"""RAG for NL2SQL - rerank（PRD-rag-sql §10 A4，模力方舟 bge-reranker-v2-m3）。

外部 API 重排（不本地推理，契合 512MB 内存约束）。按通用 /rerank 协议（Cohere/Jina 风格）调用：
  POST {RERANK_BASE_URL}/rerank  {model, query, documents, top_n}
  -> {"results": [{"index": int, "relevance_score": float}, ...]}

未配置 key / 上游异常 -> RerankError，交 retriever 降级用 RRF 分数排序（F-AS-05 / plan §6.4），
不阻断主流程。DI：rerank 为纯函数（client 懒初始化），测试可直接注入 fake rerank_fn。
"""
from __future__ import annotations

import logging
from typing import Callable, Optional

import httpx

from app.core.config import RERANK_API_KEY, RERANK_BASE_URL, RERANK_MODEL

logger = logging.getLogger(__name__)


class RerankError(RuntimeError):
    """rerank 调用层错误：配置缺失 / 上游异常 / 超时。"""


_client: Optional[httpx.Client] = None


def _get_client() -> httpx.Client:
    global _client
    if _client is not None:
        return _client
    if not RERANK_API_KEY or not RERANK_BASE_URL:
        raise RerankError("RERANK_API_KEY / RERANK_BASE_URL 未配置；请在 .env 填入模力方舟 rerank 凭证。")
    _client = httpx.Client(timeout=30)
    return _client


def reset_client_for_test() -> None:
    """测试钩子。"""
    global _client
    _client = None


def rerank(
    query: str,
    candidates: list[dict],
    top_n: int,
    text_key: str = "text",
) -> list[dict]:
    """对候选按与 query 的相关性重排，取 top_n。

    candidates: 每项须含 text_key 字段（重排依据）；其它字段原样保留。
    返回重排后的 candidates（拷贝），每项 score 更新为 relevance_score。
    空候选直接返回空。异常 -> RerankError（交调用方降级）。
    """
    if not candidates:
        return []

    client = _get_client()
    documents = [str(c.get(text_key) or "") for c in candidates]
    payload = {
        "model": RERANK_MODEL,
        "query": query,
        "documents": documents,
        "top_n": min(top_n, len(candidates)),
    }
    headers = {
        "Authorization": f"Bearer {RERANK_API_KEY}",
        "Content-Type": "application/json",
    }
    # base_url 去尾斜杠后拼 /rerank
    url = f"{RERANK_BASE_URL.rstrip('/')}/rerank"
    try:
        resp = client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:  # noqa: BLE001 - httpx 各类异常统一包装
        raise RerankError(f"rerank 调用失败：{type(exc).__name__}: {exc}") from exc

    results = data.get("results") if isinstance(data, dict) else None
    if not isinstance(results, list) or not results:
        raise RerankError("rerank 返回结果为空或格式不符")

    out: list[dict] = []
    for r in results:
        if not isinstance(r, dict):
            continue
        idx = r.get("index")
        if not isinstance(idx, int) or idx < 0 or idx >= len(candidates):
            continue
        cand = dict(candidates[idx])  # 拷贝保留原字段
        cand["score"] = float(r.get("relevance_score", 0.0))
        out.append(cand)
    if not out:
        raise RerankError("rerank 未返回有效索引项")
    return out


__all__ = ["RerankError", "rerank"]
