"""RAG for NL2SQL - 知识库切片与入库（PRD-rag-sql F-KB-03/07/08，API-KB-01）。

两步：
1. chunk_doc：段落优先（`\\n\\n` 分段）+ 滑窗兜底（超长段按字符窗口切，overlap）。
   项目无 tokenizer，以字符近似 plan §6.7 的 ~512 token 窗口，避免新增依赖。
2. ingest_doc：覆盖探测 -> 切片 -> 批量 embed -> 入 kb_docs；DI（embed_fn / milvus）便于测试注入 mock。
"""
from __future__ import annotations

import logging
import time
import uuid
from typing import Callable

from app.services.rag_sql_embed import EmbedError
from app.services.rag_sql_milvus import MilvusError
from app.services.rag_sql_models import KbDocInput, KbIngestResult

logger = logging.getLogger(__name__)

# 段落分隔；单段超此长度走滑窗
_PARA_SPLIT = "\n\n"
_CHUNK_MAX_CHARS = 1000
_CHUNK_OVERLAP = 100


def chunk_doc(content: str) -> list[str]:
    """规范文档切片（plan §6.7）：段落优先，超长滑窗兜底。

    - 按 `\\n\\n` 分段，strip 后丢弃空段；
    - 单段 > _CHUNK_MAX_CHARS -> 按窗口切（步长 = 窗口 - overlap），末尾不足一窗也收尾；
    - 全空白/无有效段落 -> 兜底返回整段（strip 后非空），保证至少一个分片。
    """
    paragraphs = [p.strip() for p in content.split(_PARA_SPLIT) if p.strip()]
    chunks: list[str] = []
    step = max(1, _CHUNK_MAX_CHARS - _CHUNK_OVERLAP)
    for para in paragraphs:
        if len(para) <= _CHUNK_MAX_CHARS:
            chunks.append(para)
            continue
        start = 0
        while start < len(para):
            piece = para[start : start + _CHUNK_MAX_CHARS]
            if piece.strip():
                chunks.append(piece)
            if start + _CHUNK_MAX_CHARS >= len(para):
                break
            start += step
    if not chunks:
        whole = content.strip()
        if whole:
            chunks.append(whole)
    return chunks


def ingest_doc(
    inp: KbDocInput,
    embed_fn: Callable[[list[str]], list[list[float]]],
    milvus,
) -> KbIngestResult:
    """文档入库（API-KB-01）：覆盖探测 -> 切片 -> embed -> 入 kb_docs。

    DI（embed_fn / milvus）便于测试注入 mock；路由层默认真实实现。
    overwrite=False 且同标题已入库 -> 仅探测返回 alreadyExists（F-KB-07）；
    overwrite=True -> 删旧插新（覆盖幂等，§6.6）。
    """
    exists = milvus.kb_doc_exists(inp.title)
    if exists and not inp.overwrite:
        return KbIngestResult(ingested=False, title=inp.title, alreadyExists=True)

    chunks = chunk_doc(inp.content)
    if not chunks:  # Pydantic min_length=1 已挡空串，此处双保险
        chunks = [inp.content]

    try:
        vectors = embed_fn(chunks)
    except EmbedError:
        raise  # 交路由 504
    except Exception as exc:  # noqa: BLE001 - 上游 SDK 各类异常统一包装为 EmbedError
        raise EmbedError(f"embedding 调用失败：{type(exc).__name__}: {exc}") from exc

    if len(vectors) != len(chunks):
        raise EmbedError(
            f"embedding 返回向量数({len(vectors)})与分片数({len(chunks)})不一致"
        )

    created_at = int(time.time())
    doc_id = f"doc_{uuid.uuid4().hex[:16]}"
    if exists and inp.overwrite:
        milvus.delete_kb_doc_by_title(inp.title)
    milvus.insert_kb_chunks(
        doc_id, inp.title, inp.category, inp.sourceName, chunks, vectors, created_at
    )
    return KbIngestResult(
        ingested=True,
        id=doc_id,
        title=inp.title,
        chunkCount=len(chunks),
        alreadyExists=exists,
        overwritten=exists,
        ingestedAt=created_at,
    )


__all__ = ["MilvusError", "chunk_doc", "ingest_doc"]
