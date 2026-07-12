"""RAG for NL2SQL - Milvus 向量库（PRD-rag-sql §10 A1/A9，F-BK-CM-02 连接管理）。

Zilliz / Milvus Cloud 免费层，外部托管。singleton + 懒初始化（沿用 llm_client 范式）：
导入不连 Milvus，首次操作才建 client + 建 collection；不可用 -> MilvusError（不静默吞）。

CK 子模块用 table_meta collection（CRUD + 存在性探测）；
KB 子模块用 kb_docs collection（切片 CRUD + 按标题/文档 id 过滤）。
检索 / 统计待 AS / CM 模块。
"""
from __future__ import annotations

import logging
from typing import Optional

from pymilvus import CollectionSchema, DataType, FieldSchema, MilvusClient

from app.core.config import (
    MILVUS_COLLECTION_KB,
    MILVUS_COLLECTION_TABLE,
    MILVUS_TOKEN,
    MILVUS_URI,
)

logger = logging.getLogger(__name__)

# VARCHAR 上限（Milvus 单字段 ≤ 65535）；summary/fields 存 JSON 序列化串
_VARCHAR_MAX = 65535
_RAW_MAX = 65535


class MilvusError(RuntimeError):
    """Milvus 连接/操作错误。"""


_client: Optional[MilvusClient] = None


def get_milvus() -> MilvusClient:
    """懒初始化 singleton（F-BK-CM-02）。"""
    global _client
    if _client is not None:
        return _client
    if not MILVUS_URI:
        raise MilvusError("MILVUS_URI 未配置；请在 .env 填入 Zilliz/Milvus 连接串。")
    try:
        _client = MilvusClient(uri=MILVUS_URI, token=MILVUS_TOKEN or None, timeout=30)
    except Exception as exc:  # noqa: BLE001
        raise MilvusError(f"Milvus 连接失败：{type(exc).__name__}: {exc}") from exc
    return _client


def reset_client_for_test() -> None:
    """测试钩子。"""
    global _client
    _client = None


def _ensure_table_collection(client: MilvusClient, dim: int) -> None:
    """首次入库时按实际向量维度建 table_meta collection（plan §6.1 #2 维度取自首次 embed）。"""
    if client.has_collection(MILVUS_COLLECTION_TABLE):
        return
    schema = CollectionSchema(
        fields=[
            FieldSchema(name="id", dtype=DataType.INT64, is_primary=True, auto_id=True),
            FieldSchema(name="vector", dtype=DataType.FLOAT_VECTOR, dim=dim),
            FieldSchema(name="table_name", dtype=DataType.VARCHAR, max_length=128),
            FieldSchema(name="raw_text", dtype=DataType.VARCHAR, max_length=_RAW_MAX),
            FieldSchema(name="summary", dtype=DataType.VARCHAR, max_length=_VARCHAR_MAX),
            FieldSchema(name="fields", dtype=DataType.VARCHAR, max_length=_VARCHAR_MAX),
            FieldSchema(name="topic", dtype=DataType.VARCHAR, max_length=64),
            FieldSchema(name="created_at", dtype=DataType.INT64),
        ]
    )
    client.create_collection(MILVUS_COLLECTION_TABLE, schema=schema)
    # 向量字段索引（检索 AS 模块用；此处一并建好，避免后续重做）
    client.create_index(
        MILVUS_COLLECTION_TABLE,
        field_name="vector",
        index_type="AUTOINDEX",
        metric_type="COSINE",
    )


def _eq_filter(table_name: str) -> str:
    """构造 table_name == 'x' 过滤串，转义单引号。"""
    safe = table_name.replace("\\", "\\\\").replace("'", "\\'")
    return f"table_name == '{safe}'"


def table_exists(table_name: str) -> bool:
    """同名表是否已入库（F-CK-08 覆盖探测）。

    collection 不存在视作未入库（首次入库必经路径：query 不存在 collection 会抛
    MilvusException，需 has_collection 前置守卫，与 kb_doc_exists 一致）。
    """
    client = get_milvus()
    if not client.has_collection(MILVUS_COLLECTION_TABLE):
        return False
    rows = client.query(
        MILVUS_COLLECTION_TABLE,
        filter=_eq_filter(table_name),
        output_fields=["table_name"],
        limit=1,
    )
    return bool(rows)


def delete_table(table_name: str) -> None:
    """按表名删旧向量（覆盖幂等 / §6.6）。"""
    client = get_milvus()
    client.delete(MILVUS_COLLECTION_TABLE, filter=_eq_filter(table_name))


def upsert_table_meta(
    table_name: str,
    raw_text: str,
    summary_json: str,
    fields_json: str,
    topic: Optional[str],
    vector: list[float],
) -> None:
    """建集合（首次）+ 删旧同名 + 插新（覆盖幂等）。调用方保证已 embed。"""
    client = get_milvus()
    _ensure_table_collection(client, dim=len(vector))
    # 覆盖幂等：先删同名再插
    try:
        client.delete(MILVUS_COLLECTION_TABLE, filter=_eq_filter(table_name))
    except Exception as exc:  # noqa: BLE001 - 删旧失败不阻断插入，仅记日志
        logger.warning("delete old table_meta for %s failed: %s", table_name, exc)
    import time

    client.insert(
        MILVUS_COLLECTION_TABLE,
        data=[
            {
                "vector": vector,
                "table_name": table_name,
                "raw_text": raw_text,
                "summary": summary_json,
                "fields": fields_json,
                "topic": topic or "",
                "created_at": int(time.time()),
            }
        ],
    )


def count_table_meta() -> int:
    """table_meta 向量数（F-BK-CM-01 stats 用；kb_docs 计数见 count_kb_docs）。"""
    client = get_milvus()
    if not client.has_collection(MILVUS_COLLECTION_TABLE):
        return 0
    stats = client.get_collection_stats(MILVUS_COLLECTION_TABLE)
    # get_collection_stats 返回 {'row_count': N}
    try:
        return int(stats.get("row_count", 0))
    except (AttributeError, ValueError, TypeError):
        return 0


def list_table_meta() -> list[dict]:
    """table_meta 列表（KB 栏目「SQL数据表元数据」展示）。

    每张表一条向量；rawText 为 build_raw_text 拼接的解析后文本块（点击预览用）。
    返回 [{tableName, topic, rawText, createdAt}]，按入库时间倒序。
    collection 不存在返回空；MVP 知识量小，单次 query 取满 _QUERY_LIMIT。
    """
    client = get_milvus()
    if not client.has_collection(MILVUS_COLLECTION_TABLE):
        return []
    try:
        rows = client.query(
            MILVUS_COLLECTION_TABLE,
            filter='table_name != ""',
            output_fields=["table_name", "raw_text", "topic", "created_at"],
            limit=_QUERY_LIMIT,
        )
    except Exception as exc:  # noqa: BLE001
        raise MilvusError(f"table_meta 列表失败：{type(exc).__name__}: {exc}") from exc
    out: list[dict] = []
    for r in rows or []:
        f = _normalize_hit(r, ["table_name", "raw_text", "topic", "created_at"])
        if not f.get("table_name"):
            continue
        out.append(
            {
                "tableName": f.get("table_name") or "",
                "topic": f.get("topic") or None,
                "rawText": f.get("raw_text") or "",
                "createdAt": int(f.get("created_at") or 0),
            }
        )
    out.sort(key=lambda x: x["createdAt"], reverse=True)
    return out


# ============================================================
# kb_docs collection（KB 子模块，F-KB-03~08）
# ============================================================
# query 上限（Milvus 单次 query 返回行数硬上限；MVP 知识量小，取满）
_QUERY_LIMIT = 16384


def _str_filter(field: str, value: str) -> str:
    """构造 field == 'x' 过滤串，转义单引号与反斜杠。"""
    safe = value.replace("\\", "\\\\").replace("'", "\\'")
    return f"{field} == '{safe}'"


def _ensure_kb_collection(client: MilvusClient, dim: int) -> None:
    """首次入库时按实际向量维度建 kb_docs collection（plan §6.1 #2）。"""
    if client.has_collection(MILVUS_COLLECTION_KB):
        return
    schema = CollectionSchema(
        fields=[
            FieldSchema(name="id", dtype=DataType.INT64, is_primary=True, auto_id=True),
            FieldSchema(name="vector", dtype=DataType.FLOAT_VECTOR, dim=dim),
            FieldSchema(name="doc_id", dtype=DataType.VARCHAR, max_length=128),
            FieldSchema(name="title", dtype=DataType.VARCHAR, max_length=128),
            FieldSchema(name="category", dtype=DataType.VARCHAR, max_length=64),
            FieldSchema(name="chunk_index", dtype=DataType.INT64),
            FieldSchema(name="chunk_text", dtype=DataType.VARCHAR, max_length=_RAW_MAX),
            FieldSchema(name="source_name", dtype=DataType.VARCHAR, max_length=128),
            FieldSchema(name="created_at", dtype=DataType.INT64),
        ]
    )
    client.create_collection(MILVUS_COLLECTION_KB, schema=schema)
    client.create_index(
        MILVUS_COLLECTION_KB,
        field_name="vector",
        index_type="AUTOINDEX",
        metric_type="COSINE",
    )


def kb_doc_exists(title: str) -> bool:
    """同标题文档是否已入库（F-KB-07 覆盖探测）。"""
    client = get_milvus()
    if not client.has_collection(MILVUS_COLLECTION_KB):
        return False
    rows = client.query(
        MILVUS_COLLECTION_KB,
        filter=_str_filter("title", title),
        output_fields=["doc_id"],
        limit=1,
    )
    return bool(rows)


def _doc_ids_by_title(client: MilvusClient, title: str) -> list[str]:
    """按标题查全部匹配文档的 doc_id（去重）。"""
    if not client.has_collection(MILVUS_COLLECTION_KB):
        return []
    rows = client.query(
        MILVUS_COLLECTION_KB,
        filter=_str_filter("title", title),
        output_fields=["doc_id"],
        limit=_QUERY_LIMIT,
    )
    seen: list[str] = []
    s: set = set()
    for r in rows:
        did = r.get("doc_id")
        if did and did not in s:
            s.add(did)
            seen.append(did)
    return seen


def delete_kb_doc_by_title(title: str) -> None:
    """覆盖幂等（F-KB-07）：按标题查 doc_id 集合后删全部 chunk。"""
    client = get_milvus()
    for did in _doc_ids_by_title(client, title):
        client.delete(MILVUS_COLLECTION_KB, filter=_str_filter("doc_id", did))


def insert_kb_chunks(
    doc_id: str,
    title: str,
    category: str,
    source_name: Optional[str],
    chunks: list[str],
    vectors: list[list[float]],
    created_at: int,
) -> None:
    """建集合（首次）+ 批量插入分片。调用方保证 chunks 与 vectors 已对齐、已 embed。"""
    client = get_milvus()
    if not chunks:
        return
    _ensure_kb_collection(client, dim=len(vectors[0]))
    data = [
        {
            "vector": vectors[i],
            "doc_id": doc_id,
            "title": title,
            "category": category,
            "chunk_index": i,
            "chunk_text": chunks[i],
            "source_name": source_name or "",
            "created_at": created_at,
        }
        for i in range(len(chunks))
    ]
    client.insert(MILVUS_COLLECTION_KB, data=data)


def list_kb_docs() -> list[dict]:
    """知识列表（API-KB-02 / F-KB-04）：query 全量后按 doc_id 分组计 chunkCount。

    collection 不存在返回空；MVP 知识量小，单次 query 取满 _QUERY_LIMIT。
    """
    client = get_milvus()
    if not client.has_collection(MILVUS_COLLECTION_KB):
        return []
    rows = client.query(
        MILVUS_COLLECTION_KB,
        filter='doc_id != ""',
        output_fields=["doc_id", "title", "category", "source_name", "created_at"],
        limit=_QUERY_LIMIT,
    )
    by_doc: dict[str, dict] = {}
    counts: dict[str, int] = {}
    for r in rows:
        did = r.get("doc_id")
        if not did:
            continue
        counts[did] = counts.get(did, 0) + 1
        if did not in by_doc:
            by_doc[did] = {
                "id": did,
                "title": r.get("title", ""),
                "category": r.get("category", ""),
                "sourceName": r.get("source_name") or None,
                "createdAt": int(r.get("created_at", 0) or 0),
            }
    refs = [dict(v, chunkCount=counts.get(k, 0)) for k, v in by_doc.items()]
    refs.sort(key=lambda x: x["createdAt"], reverse=True)
    return refs


def get_kb_doc(doc_id: str) -> Optional[dict]:
    """文档详情（API-KB-03 / F-KB-05）：按 doc_id 取全部分片，按 chunk_index 排序。"""
    client = get_milvus()
    if not client.has_collection(MILVUS_COLLECTION_KB):
        return None
    rows = client.query(
        MILVUS_COLLECTION_KB,
        filter=_str_filter("doc_id", doc_id),
        output_fields=[
            "title",
            "category",
            "source_name",
            "created_at",
            "chunk_index",
            "chunk_text",
        ],
        limit=_QUERY_LIMIT,
    )
    if not rows:
        return None
    rows.sort(key=lambda r: int(r.get("chunk_index", 0) or 0))
    first = rows[0]
    return {
        "id": doc_id,
        "title": first.get("title", ""),
        "category": first.get("category", ""),
        "sourceName": first.get("source_name") or None,
        "createdAt": int(first.get("created_at", 0) or 0),
        "chunkCount": len(rows),
        "chunks": [
            {"index": int(r.get("chunk_index", i) or i), "text": r.get("chunk_text", "")}
            for i, r in enumerate(rows)
        ],
    }


def delete_kb_doc(doc_id: str) -> int:
    """删除文档及其全部分片（API-KB-04 / F-KB-06 连带）。返回删除条数；不存在返回 0。"""
    client = get_milvus()
    if not client.has_collection(MILVUS_COLLECTION_KB):
        return 0
    rows = client.query(
        MILVUS_COLLECTION_KB,
        filter=_str_filter("doc_id", doc_id),
        output_fields=["doc_id"],
        limit=_QUERY_LIMIT,
    )
    n = len(rows)
    if n == 0:
        return 0
    client.delete(MILVUS_COLLECTION_KB, filter=_str_filter("doc_id", doc_id))
    return n


def count_kb_docs() -> dict:
    """kb_docs 统计（F-BK-CM-01 stats）：返回 {docCount, chunkCount}。

    docCount = distinct doc_id；chunkCount = 全部分片数（= 行数）。
    collection 不存在返回 0/0；MVP 知识量小，单次 query 取满 _QUERY_LIMIT。
    """
    client = get_milvus()
    if not client.has_collection(MILVUS_COLLECTION_KB):
        return {"docCount": 0, "chunkCount": 0}
    try:
        rows = client.query(
            MILVUS_COLLECTION_KB,
            filter='doc_id != ""',
            output_fields=["doc_id"],
            limit=_QUERY_LIMIT,
        )
    except Exception as exc:  # noqa: BLE001
        raise MilvusError(f"kb_docs 统计失败：{type(exc).__name__}: {exc}") from exc
    doc_ids: set = set()
    for r in rows or []:
        did = r.get("doc_id") if isinstance(r, dict) else None
        if did:
            doc_ids.add(did)
    return {"docCount": len(doc_ids), "chunkCount": len(rows or [])}


# ============================================================
# 检索（AS 子模块，F-AS-04 混合检索 + BM25 语料）
# ============================================================
def has_table_collection() -> bool:
    """table_meta collection 是否存在（空库降级 F-AS-10 探测；不存在视作空）。"""
    try:
        return get_milvus().has_collection(MILVUS_COLLECTION_TABLE)
    except MilvusError:
        raise
    except Exception:  # noqa: BLE001 - 连接抖动按空处理，不阻断检索降级
        return False


def has_kb_collection() -> bool:
    """kb_docs collection 是否存在（F-AS-10 探测）。"""
    try:
        return get_milvus().has_collection(MILVUS_COLLECTION_KB)
    except MilvusError:
        raise
    except Exception:  # noqa: BLE001
        return False


def _normalize_hit(hit: dict, fields: list[str]) -> dict:
    """兼容 pymilvus 各版本 search/query 命中结构：字段或在顶层或在 entity 下。"""
    if not isinstance(hit, dict):
        return {}
    entity = hit.get("entity") if isinstance(hit.get("entity"), dict) else {}
    merged = {**hit, **entity}
    return {f: merged.get(f) for f in fields}


def search_table_meta(vector: list[float], top_k: int) -> list[dict]:
    """table_meta 向量检索（F-AS-04）。返回 [{id, score, tableName, rawText, topic}] 按 score 降序。

    collection 不存在返回空（视作无命中）。score 取 COSINE distance（越大越相似）。
    """
    client = get_milvus()
    if not client.has_collection(MILVUS_COLLECTION_TABLE):
        return []
    try:
        res = client.search(
            MILVUS_COLLECTION_TABLE,
            data=[vector],
            limit=top_k,
            output_fields=["table_name", "raw_text", "topic"],
        )
    except Exception as exc:  # noqa: BLE001
        raise MilvusError(f"table_meta 向量检索失败：{type(exc).__name__}: {exc}") from exc
    hits = res[0] if res else []
    out: list[dict] = []
    for h in hits:
        f = _normalize_hit(h, ["table_name", "raw_text", "topic", "id"])
        out.append(
            {
                "id": h.get("id") if isinstance(h, dict) else None,
                "score": float(h.get("distance", 0.0)) if isinstance(h, dict) else 0.0,
                "tableName": f.get("table_name") or "",
                "rawText": f.get("raw_text") or "",
                "topic": f.get("topic") or "",
            }
        )
    return out


def search_kb_docs(vector: list[float], top_k: int) -> list[dict]:
    """kb_docs 向量检索（F-AS-04）。返回 [{id, score, docId, title, chunkText, chunkIndex}]。"""
    client = get_milvus()
    if not client.has_collection(MILVUS_COLLECTION_KB):
        return []
    try:
        res = client.search(
            MILVUS_COLLECTION_KB,
            data=[vector],
            limit=top_k,
            output_fields=["doc_id", "title", "chunk_text", "chunk_index"],
        )
    except Exception as exc:  # noqa: BLE001
        raise MilvusError(f"kb_docs 向量检索失败：{type(exc).__name__}: {exc}") from exc
    hits = res[0] if res else []
    out: list[dict] = []
    for h in hits:
        f = _normalize_hit(h, ["doc_id", "title", "chunk_text", "chunk_index", "id"])
        out.append(
            {
                "id": h.get("id") if isinstance(h, dict) else None,
                "score": float(h.get("distance", 0.0)) if isinstance(h, dict) else 0.0,
                "docId": f.get("doc_id") or "",
                "title": f.get("title") or "",
                "chunkText": f.get("chunk_text") or "",
                "chunkIndex": int(f.get("chunk_index") or 0),
            }
        )
    return out


def scan_table_meta_all() -> list[dict]:
    """table_meta 全量扫描（BM25 语料 + 空库探测 F-AS-10）。

    返回 [{id, tableName, rawText, topic}]。MVP 知识量小，单次 query 取满 _QUERY_LIMIT。
    """
    client = get_milvus()
    if not client.has_collection(MILVUS_COLLECTION_TABLE):
        return []
    try:
        rows = client.query(
            MILVUS_COLLECTION_TABLE,
            filter='table_name != ""',
            output_fields=["table_name", "raw_text", "topic"],
            limit=_QUERY_LIMIT,
        )
    except Exception as exc:  # noqa: BLE001
        raise MilvusError(f"table_meta 全量扫描失败：{type(exc).__name__}: {exc}") from exc
    out: list[dict] = []
    for r in rows or []:
        f = _normalize_hit(r, ["table_name", "raw_text", "topic", "id"])
        if not f.get("table_name"):
            continue
        out.append(
            {
                "id": r.get("id") if isinstance(r, dict) else None,
                "tableName": f.get("table_name") or "",
                "rawText": f.get("raw_text") or "",
                "topic": f.get("topic") or "",
            }
        )
    return out


def scan_kb_chunks_all() -> list[dict]:
    """kb_docs 全量分片扫描（BM25 语料 + 空库探测 F-AS-10）。

    返回 [{id, docId, title, chunkText, chunkIndex}]。
    """
    client = get_milvus()
    if not client.has_collection(MILVUS_COLLECTION_KB):
        return []
    try:
        rows = client.query(
            MILVUS_COLLECTION_KB,
            filter='doc_id != ""',
            output_fields=["doc_id", "title", "chunk_text", "chunk_index"],
            limit=_QUERY_LIMIT,
        )
    except Exception as exc:  # noqa: BLE001
        raise MilvusError(f"kb_docs 全量扫描失败：{type(exc).__name__}: {exc}") from exc
    out: list[dict] = []
    for r in rows or []:
        f = _normalize_hit(r, ["doc_id", "title", "chunk_text", "chunk_index", "id"])
        if not f.get("doc_id"):
            continue
        out.append(
            {
                "id": r.get("id") if isinstance(r, dict) else None,
                "docId": f.get("doc_id") or "",
                "title": f.get("title") or "",
                "chunkText": f.get("chunk_text") or "",
                "chunkIndex": int(f.get("chunk_index") or 0),
            }
        )
    return out
