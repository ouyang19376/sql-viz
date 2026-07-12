"""RAG for NL2SQL - 混合检索（PRD-rag-sql F-AS-04/05/10/11，API-AS-01 检索段，plan §5.4/6.3）。

检索流程（固定线性，§10 A2 自写轻量 RAG）：
  embed(question) -> table_meta(向量topK + BM25topK -> RRF) + kb_docs(同) -> 合并 -> rerank(topN)
  -> AskSource[]；空库/无命中 -> 降级标记（仍生成纯 LLM）。

RRF（Reciprocal Rank Fusion，plan §6.3）：score(d)=Σ 1/(k+rank)，k=60，仅依赖排名无需分数归一化。
rerank API 异常 -> 降级用 RRF 合并分排序取 topN（F-AS-05 / plan §6.4），记日志不阻断。

BM25 语料每次按 collection 全量扫描重建（plan §6.1#4 MVP 决策：知识量小，<数秒）；
全量扫描同时作为空库探测器（两 collection 全 0 行 -> F-AS-10 空库降级）。

DI（embed_fn / milvus / rerank_fn）便于测试注入 mock；路由层默认真实实现。
"""
from __future__ import annotations

import logging
import re
from typing import Callable, Optional

from rank_bm25 import BM25Okapi

from app.services.rag_sql_embed import EmbedError
from app.services.rag_sql_milvus import MilvusError
from app.services.rag_sql_models import AskSource
from app.services.rag_sql_rerank import RerankError

logger = logging.getLogger(__name__)

# RRF 常数（plan §6.3 常用值 k=60）
_RRF_K = 60


def _tokenize(text: str) -> list[str]:
    """简易分词：字母数字下划线连串 + 单个中文字符（无 jieba 的中文兜底，向量检索为主）。

    Python3 \\w 含中文，会把整段中文当一个 token，故显式拆 CJK 单字以提升 BM25 中文召回。
    """
    if not text:
        return []
    return re.findall(r"[a-z0-9_]+|[一-鿿]", text.lower())


def rrf_merge(ranked_lists: list[list[dict]], k: int = _RRF_K) -> list[dict]:
    """RRF 融合多路排序结果（plan §6.3）。每路为候选 dict 列表（best-first），含 key 去重。

    返回按 RRF 分数降序的候选列表（拷贝），score 更新为 RRF 分数。两路均未命中返回空。
    """
    scores: dict[str, float] = {}
    payload: dict[str, dict] = {}
    for ranked in ranked_lists:
        for rank, cand in enumerate(ranked):
            key = cand.get("key")
            if not key:
                continue
            scores[key] = scores.get(key, 0.0) + 1.0 / (k + rank)
            payload[key] = cand  # 同 key 候选字段一致，后写覆盖无害
    ordered = sorted(scores.items(), key=lambda x: -x[1])
    out: list[dict] = []
    for key, score in ordered:
        cand = dict(payload[key])
        cand["score"] = float(score)
        out.append(cand)
    return out


def _table_candidate(hit: dict) -> dict:
    return {
        "key": f"table_meta:{hit.get('id')}",
        "text": hit.get("rawText") or "",
        "type": "table",
        "title": hit.get("tableName") or "",
        "collection": "table_meta",
        "chunkText": hit.get("rawText") or "",
    }


def _doc_candidate(hit: dict) -> dict:
    return {
        "key": f"kb_docs:{hit.get('id')}",
        "text": hit.get("chunkText") or "",
        "type": "doc",
        "title": hit.get("title") or "",
        "collection": "kb_docs",
        "chunkText": hit.get("chunkText") or "",
    }


def _bm25_topk(candidates: list[dict], query: str, top_k: int) -> list[dict]:
    """对候选建 BM25 索引，按 query 相关性取 top_k（plan §6.3 BM25 路）。

    仅对 text 非空的候选建索引；空语料返回空。返回的候选保留原字段（score 留待 RRF 覆盖）。
    """
    if not candidates:
        return []
    indexed = [(i, c) for i, c in enumerate(candidates) if c.get("text")]
    if not indexed:
        return []
    texts = [c["text"] for _, c in indexed]
    tokenized = [_tokenize(t) for t in texts]
    try:
        bm25 = BM25Okapi(tokenized)
        scores = bm25.get_scores(_tokenize(query))
    except Exception as exc:  # noqa: BLE001 - BM25 数值异常降级为不参与（仅向量路）
        logger.warning("BM25 计分异常，降级跳过： %s", exc)
        return []
    idx_sorted = sorted(range(len(indexed)), key=lambda i: -scores[i])
    return [dict(indexed[i][1]) for i in idx_sorted[:top_k]]


def _degrade(sources: list, table_count: int, kb_count: int) -> tuple[bool, Optional[str]]:
    """降级判定（F-AS-10 空库 / F-AS-11 无命中）。纯函数便于测试。"""
    empty_kb = table_count == 0 and kb_count == 0
    if empty_kb:
        return True, "知识库为空，结果未对齐业务模型"
    if not sources:
        return True, "未检索到相关知识，基于通用能力生成"
    return False, None


def retrieve(
    question: str,
    embed_fn: Callable[[list[str]], list[list[float]]],
    milvus,
    rerank_fn: Optional[Callable[[str, list[dict], int], list[dict]]],
    top_k: int,
    top_n: int,
) -> tuple[list[AskSource], bool, Optional[str]]:
    """混合检索（API-AS-01 检索段）。

    返回 (sources, degraded, degradeReason)。EmbedError / MilvusError 上抛交路由（504/500）。
    rerank_fn 为 None 或抛 RerankError -> 降级用 RRF 分排序取 topN（F-AS-05）。
    """
    qvec = embed_fn([question])[0]

    # table_meta 路：向量 topK + BM25 topK -> RRF
    vec_t = milvus.search_table_meta(qvec, top_k)
    scan_t = milvus.scan_table_meta_all()
    cand_t_vec = [_table_candidate(h) for h in vec_t]
    cand_t_bm = _bm25_topk([_table_candidate(h) for h in scan_t], question, top_k)
    merged_t = rrf_merge([cand_t_vec, cand_t_bm])

    # kb_docs 路
    vec_k = milvus.search_kb_docs(qvec, top_k)
    scan_k = milvus.scan_kb_chunks_all()
    cand_k_vec = [_doc_candidate(h) for h in vec_k]
    cand_k_bm = _bm25_topk([_doc_candidate(h) for h in scan_k], question, top_k)
    merged_k = rrf_merge([cand_k_vec, cand_k_bm])

    all_candidates = merged_t + merged_k

    # rerank（不可用降级用 RRF 分排序）
    if all_candidates and rerank_fn is not None:
        try:
            ranked = rerank_fn(question, all_candidates, top_n)
        except RerankError as exc:
            logger.warning("rerank 降级，改用 RRF 排序：%s", exc)
            ranked = sorted(all_candidates, key=lambda c: -c.get("score", 0.0))[:top_n]
    else:
        ranked = sorted(all_candidates, key=lambda c: -c.get("score", 0.0))[:top_n]

    sources = [
        AskSource(
            type=c["type"],
            title=c["title"],
            collection=c["collection"],
            score=float(c.get("score", 0.0)),
            chunkText=c["chunkText"],
        )
        for c in ranked
    ]

    degraded, reason = _degrade(sources, len(scan_t), len(scan_k))
    return sources, degraded, reason


__all__ = ["EmbedError", "MilvusError", "RerankError", "retrieve", "rrf_merge"]
