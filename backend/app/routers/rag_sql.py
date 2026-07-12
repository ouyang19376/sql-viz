"""RAG for NL2SQL - 路由（PRD-rag-sql CK + KB + AS 子模块）。

无 X-Session-Id（知识库全局共享，区别于 dataprofile §6.1）。
CK：chunk（DDL->文本块）、ingest/table（入 RAG）。
KB：ingest/doc（文档入 RAG）、kb 列表 / 详情 / 删除。
AS：ask（NL2SQL 非流式，API-AS-01）、ask/stream（SSE 流式，F-AS-15）。
"""
import json
import logging
import time

from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse

from app.core.config import RAG_HISTORY_MAX_TURNS, RAG_RETRIEVE_TOPK, RAG_RERANK_TOPN
from app.core.response import fail, ok
from app.services import rag_sql_milvus as mlvus
from app.services import rag_sql_rerank
from app.services.llm_client import LLMClientError, chat_json, stream_chat
from app.services.rag_sql_chunk import build_raw_text, chunk_ddl
from app.services.rag_sql_embed import EmbedError, embed, embed_one
from app.services.rag_sql_generate import (
    finalize_stream_sql,
    generate,
    generate_stream,
    validate_sql,
)
from app.services.rag_sql_kb import ingest_doc
from app.services.rag_sql_milvus import MilvusError
from app.services.rag_sql_models import (
    AskRequest,
    AskResponse,
    ChunkRequest,
    ChunkResponse,
    IngestResult,
    IngestTableChunkRequest,
    KbDocDetail,
    KbDocInput,
    KbDocRef,
    KbIngestResult,
    RagSqlStats,
    TableMetaRef,
)
from app.services.rag_sql_retriever import retrieve

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/rag-sql", tags=["rag-sql"])


# ─── API-CK-01：DDL -> 结构化文本块（F-CK-02/03/09） ─────────
@router.post("/chunk")
def chunk_endpoint(req: ChunkRequest):
    """sqlglot 结构解析 + LLM 语义增强。refused（解析失败）仍回 code 0（§6.3）。"""
    try:
        resp: ChunkResponse = chunk_ddl(req.ddl, chat_fn=chat_json)
    except LLMClientError as exc:
        msg = str(exc)
        if "timeout" in msg.lower() or "超时" in msg:
            return JSONResponse(status_code=504, content=fail(-1, "LLM 调用超时"))
        return JSONResponse(status_code=500, content=fail(-2, msg))
    return ok(resp.model_dump(mode="json"))


# ─── API-CK-02：表文本块入 RAG（F-CK-07/08） ───────────────
def _ingest_table(req: IngestTableChunkRequest, embed_fn, milvus) -> IngestResult:
    """embed + Milvus upsert，含覆盖探测（F-CK-08）。

    DI（embed_fn / milvus）便于测试注入 mock；路由层默认真实实现。
    """
    exists = milvus.table_exists(req.tableName)
    if exists and not req.overwrite:
        # 仅探测：交前端二次确认，不 embed 不写
        return IngestResult(
            ingested=False, tableName=req.tableName, alreadyExists=True, overwritten=False
        )
    vector = embed_fn(req.rawText)
    # 以 summary/fields 重写 rawText（权威）：用户编辑字段后入库文本与最新结构一致，
    # 忽略请求体里的 rawText 快照（仅 /chunk 生成时的初值）。
    raw_text = build_raw_text(req.summary, req.fields)
    milvus.upsert_table_meta(
        req.tableName,
        raw_text,
        req.summary.model_dump_json(),
        json.dumps([f.model_dump() for f in req.fields], ensure_ascii=False),
        req.summary.topic,
        vector,
    )
    return IngestResult(
        ingested=True,
        tableName=req.tableName,
        alreadyExists=exists,
        overwritten=exists,
        ingestedAt=int(time.time()),
    )


@router.post("/ingest/table")
def ingest_table_endpoint(req: IngestTableChunkRequest):
    try:
        result = _ingest_table(req, embed_fn=embed_one, milvus=mlvus)
    except EmbedError as exc:
        return JSONResponse(status_code=504, content=fail(-1, str(exc)))
    except MilvusError as exc:
        return JSONResponse(status_code=500, content=fail(-2, str(exc)))
    except Exception as exc:  # noqa: BLE001 - 兜底，避免 500 泄漏栈
        logger.exception("ingest_table failed: %s", req.tableName)
        return JSONResponse(
            status_code=500, content=fail(-2, f"入库失败：{str(exc)[:200]}")
        )
    msg = "已覆盖更新" if result.overwritten else ("已入库" if result.ingested else "同名表已存在，待确认覆盖")
    return ok(result.model_dump(mode="json"), message=msg)


# ─── API-CK-03：表元数据列表（KB 栏目「SQL数据表元数据」展示） ──
@router.get("/tables")
def list_tables_endpoint():
    """已入库 table_meta 列表（每张表一条），供知识管理栏目展示与点击预览。"""
    try:
        tables = mlvus.list_table_meta()
    except MilvusError as exc:
        return JSONResponse(status_code=500, content=fail(-2, str(exc)))
    except Exception as exc:  # noqa: BLE001
        logger.exception("list_tables failed")
        return JSONResponse(status_code=500, content=fail(-2, f"列表失败：{str(exc)[:200]}"))
    return ok([TableMetaRef(**t).model_dump(mode="json") for t in tables])


# ─── API-KB-01：文档入库（F-KB-01/02/03/07/08） ───────────
@router.post("/ingest/doc")
def ingest_doc_endpoint(req: KbDocInput):
    """切片 + embed + 入 kb_docs；含覆盖探测（F-KB-07）。DI（embed/mlvus）便于测试。"""
    try:
        result = ingest_doc(req, embed_fn=embed, milvus=mlvus)
    except EmbedError as exc:
        return JSONResponse(status_code=504, content=fail(-1, str(exc)))
    except MilvusError as exc:
        return JSONResponse(status_code=500, content=fail(-2, str(exc)))
    except Exception as exc:  # noqa: BLE001
        logger.exception("ingest_doc failed: %s", req.title)
        return JSONResponse(status_code=500, content=fail(-2, f"入库失败：{str(exc)[:200]}"))
    msg = (
        "已覆盖更新"
        if result.overwritten
        else ("已入库" if result.ingested else "同名文档已存在，待确认覆盖")
    )
    return ok(result.model_dump(mode="json"), message=msg)


# ─── API-KB-02：知识列表（F-KB-04，按类别前端分组） ────────
@router.get("/kb")
def list_kb_endpoint():
    try:
        docs = mlvus.list_kb_docs()
    except MilvusError as exc:
        return JSONResponse(status_code=500, content=fail(-2, str(exc)))
    except Exception as exc:  # noqa: BLE001
        logger.exception("list_kb failed")
        return JSONResponse(status_code=500, content=fail(-2, f"列表失败：{str(exc)[:200]}"))
    return ok([KbDocRef(**d).model_dump(mode="json") for d in docs])


# ─── API-KB-03：文档详情 / 分片原文（F-KB-05） ─────────────
@router.get("/kb/{doc_id}")
def get_kb_endpoint(doc_id: str):
    try:
        detail = mlvus.get_kb_doc(doc_id)
    except MilvusError as exc:
        return JSONResponse(status_code=500, content=fail(-2, str(exc)))
    except Exception as exc:  # noqa: BLE001
        logger.exception("get_kb failed: %s", doc_id)
        return JSONResponse(status_code=500, content=fail(-2, f"获取失败：{str(exc)[:200]}"))
    if detail is None:
        return JSONResponse(status_code=404, content=fail(-2, "文档不存在"))
    return ok(KbDocDetail(**detail).model_dump(mode="json"))


# ─── API-KB-04：删除文档及分片（F-KB-06 连带） ────────────
@router.delete("/kb/{doc_id}")
def delete_kb_endpoint(doc_id: str):
    try:
        deleted = mlvus.delete_kb_doc(doc_id)
    except MilvusError as exc:
        return JSONResponse(status_code=500, content=fail(-2, str(exc)))
    except Exception as exc:  # noqa: BLE001
        logger.exception("delete_kb failed: %s", doc_id)
        return JSONResponse(status_code=500, content=fail(-2, f"删除失败：{str(exc)[:200]}"))
    if deleted == 0:
        return JSONResponse(status_code=404, content=fail(-2, "文档不存在"))
    return ok({"deleted": deleted}, message=f"已删除 {deleted} 个分片")


# ─── API-AS-01：NL2SQL 生成（F-AS-03/04/05/06/07/10/11/12/13） ─────
def _history(req: AskRequest):
    """截断多轮历史（plan §6.8，RAG_HISTORY_MAX_TURNS）。"""
    return (req.history or [])[:RAG_HISTORY_MAX_TURNS]


def _ask(req: AskRequest, embed_fn, milvus, rerank_fn, chat_fn) -> AskResponse:
    """非流式 NL2SQL 生成编排：检索 -> 生成 -> 校验。DI 便于测试注入 mock。"""
    top_k = req.topK or RAG_RETRIEVE_TOPK
    sources, degraded, reason = retrieve(
        req.question, embed_fn, milvus, rerank_fn, top_k, RAG_RERANK_TOPN
    )
    sql, refused, msg = generate(
        req.question, req.dialect, sources, _history(req), chat_fn
    )
    if refused:
        return AskResponse(
            dialect=req.dialect,
            sources=sources,
            degraded=degraded,
            degradeReason=reason,
            refused=True,
            message=msg,
        )
    validation = validate_sql(sql, req.dialect)
    return AskResponse(
        sql=sql,
        dialect=req.dialect,
        validation=validation,
        sources=sources,
        degraded=degraded,
        degradeReason=reason,
    )


@router.post("/ask")
def ask_endpoint(req: AskRequest):
    """NL2SQL 生成（非流式，API-AS-01 / F-AS-06）。refused/降级仍回 code 0（§6.3）。"""
    try:
        result = _ask(req, embed_fn=embed, milvus=mlvus, rerank_fn=rag_sql_rerank.rerank, chat_fn=chat_json)
    except LLMClientError as exc:
        msg = str(exc)
        if "超时" in msg or "timeout" in msg.lower():
            return JSONResponse(status_code=504, content=fail(-1, "LLM 调用超时"))
        return JSONResponse(status_code=500, content=fail(-2, msg))
    except EmbedError as exc:
        return JSONResponse(status_code=504, content=fail(-1, str(exc)))
    except MilvusError as exc:
        return JSONResponse(status_code=500, content=fail(-2, str(exc)))
    except Exception as exc:  # noqa: BLE001
        logger.exception("ask failed")
        return JSONResponse(status_code=500, content=fail(-2, f"生成失败：{str(exc)[:200]}"))
    return ok(result.model_dump(mode="json"))


# ─── F-AS-15：流式 NL2SQL 生成（SSE） ──────────────────────
def _sse(event: str, payload: dict) -> str:
    """手工 SSE 帧（不引 sse-starlette，契合项目原生风格）。"""
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("/ask/stream")
def ask_stream_endpoint(req: AskRequest):
    """流式 NL2SQL 生成（F-AS-15）。

    SSE 帧序列：meta（sources/降级，检索后即发）-> delta*（SQL token）-> done（sql+校验）；
    异常 -> error 事件。sync generator 由 Starlette iterate_in_threadpool 托管，不阻塞事件循环。
    """
    top_k = req.topK or RAG_RETRIEVE_TOPK
    history = _history(req)

    def event_gen():
        try:
            sources, degraded, reason = retrieve(
                req.question, embed, mlvus, rag_sql_rerank.rerank, top_k, RAG_RERANK_TOPN
            )
            yield _sse(
                "meta",
                {
                    "sources": [s.model_dump(mode="json") for s in sources],
                    "degraded": degraded,
                    "degradeReason": reason,
                    "dialect": req.dialect,
                },
            )
            parts: list[str] = []
            for token in generate_stream(
                req.question, req.dialect, sources, history, stream_chat
            ):
                parts.append(token)
                yield _sse("delta", {"delta": token})
            sql, refused, msg = finalize_stream_sql("".join(parts))
            if refused:
                yield _sse("error", {"message": msg or "生成失败：模型未生成有效 SQL"})
                return
            validation = validate_sql(sql, req.dialect)
            yield _sse(
                "done",
                {
                    "sql": sql,
                    "validation": validation.model_dump(mode="json"),
                    "dialect": req.dialect,
                    "sources": [s.model_dump(mode="json") for s in sources],
                    "degraded": degraded,
                    "degradeReason": reason,
                },
            )
        except LLMClientError as exc:
            yield _sse("error", {"message": str(exc)})
        except EmbedError as exc:
            yield _sse("error", {"message": str(exc)})
        except MilvusError as exc:
            yield _sse("error", {"message": str(exc)})
        except Exception as exc:  # noqa: BLE001
            logger.exception("ask/stream failed")
            yield _sse("error", {"message": f"生成失败：{str(exc)[:200]}"})

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── API-CM-01：知识库规模（F-BK-CM-01） ──────────────────
@router.get("/stats")
def stats_endpoint():
    """知识库规模：表数(table_meta) + 文档数/分片数(kb_docs)。Milvus 异常 -> 500。

    与读接口一致直接引用 mlvus（测试 monkeypatch r.mlvus）；无 DI 参数。
    """
    try:
        table_count = mlvus.count_table_meta()
        kb = mlvus.count_kb_docs()
    except MilvusError as exc:
        return JSONResponse(status_code=500, content=fail(-2, str(exc)))
    except Exception as exc:  # noqa: BLE001
        logger.exception("stats failed")
        return JSONResponse(status_code=500, content=fail(-2, f"统计失败：{str(exc)[:200]}"))
    return ok(
        RagSqlStats(
            tableCount=table_count,
            docCount=kb["docCount"],
            chunkCount=kb["chunkCount"],
        ).model_dump(mode="json")
    )
