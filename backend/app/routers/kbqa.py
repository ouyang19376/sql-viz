"""知识库问答（kbqa）- 路由。

单端点：POST /chat/stream（SSE 流式回答，帧序列镜像 rag-sql /ask/stream）：
  meta（sources/降级，检索后即发）-> delta*（Markdown token）-> done（answer 汇总）；
  异常 -> error 事件。
检索/生成完整复用 rag-sql 设施（embed / milvus / rerank / retrieve / stream_chat），
无 X-Session-Id（知识库全局共享）。
"""
import json
import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.core.config import RAG_HISTORY_MAX_TURNS, RAG_RETRIEVE_TOPK, RAG_RERANK_TOPN
from app.services import rag_sql_milvus as mlvus
from app.services import rag_sql_rerank
from app.services.kbqa_models import KbqaChatRequest
from app.services.kbqa_prompt import build_chat_prompt
from app.services.llm_client import LLMClientError, stream_chat
from app.services.rag_sql_embed import EmbedError, embed
from app.services.rag_sql_milvus import MilvusError
from app.services.rag_sql_retriever import retrieve

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/kbqa", tags=["kbqa"])


def _sse(event: str, payload: dict) -> str:
    """手工 SSE 帧（不引 sse-starlette，契合项目原生风格）。"""
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("/chat/stream")
def chat_stream_endpoint(req: KbqaChatRequest):
    """流式知识库问答。

    帧序列：meta（sources/降级，检索后即发）-> delta*（回答 token）-> done；
    异常 -> error 事件。sync generator 由 Starlette iterate_in_threadpool 托管，
    不阻塞事件循环。
    """
    top_k = req.topK or RAG_RETRIEVE_TOPK
    history = (req.history or [])[:RAG_HISTORY_MAX_TURNS]

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
                },
            )
            system, user = build_chat_prompt(req.question, sources, history)
            parts: list[str] = []
            for token in stream_chat(system, user):
                if not token:
                    continue
                parts.append(token)
                yield _sse("delta", {"delta": token})
            answer = "".join(parts).strip()
            if not answer:
                yield _sse("error", {"message": "生成失败：模型未返回有效回答，请重试。"})
                return
            yield _sse(
                "done",
                {
                    "answer": answer,
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
            logger.exception("kbqa chat/stream failed")
            yield _sse("error", {"message": f"生成失败：{str(exc)[:200]}"})

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
