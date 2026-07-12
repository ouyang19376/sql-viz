"""RAG for NL2SQL - 文本 embedding（PRD-rag-sql §10 A3，火山引擎 doubao 文本 embedding）。

OpenAI 兼容协议（doubao / 通用兼容端点均可），复用已装的 openai SDK。
singleton + 懒初始化：导入不触发 key 校验，首次 embed 才建 client；不可用 -> EmbedError。
"""
from __future__ import annotations

import logging
from typing import Optional

from openai import OpenAI

from app.core.config import (
    EMBEDDING_API_KEY,
    EMBEDDING_BASE_URL,
    EMBEDDING_MODEL,
)

logger = logging.getLogger(__name__)


class EmbedError(RuntimeError):
    """embedding 调用层错误：配置缺失 / 上游异常 / 超时。"""


_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    global _client
    if _client is not None:
        return _client
    if not EMBEDDING_API_KEY:
        raise EmbedError("EMBEDDING_API_KEY 未配置；请在 .env 填入 doubao embedding key。")
    _client = OpenAI(
        api_key=EMBEDDING_API_KEY,
        base_url=EMBEDDING_BASE_URL,
        timeout=30,
    )
    return _client


def reset_client_for_test() -> None:
    """测试钩子：清空 singleton。"""
    global _client
    _client = None


def embed(texts: list[str]) -> list[list[float]]:
    """批量文本 embedding。空入参返回空列表。

    doubao 兼容 OpenAI embeddings 接口；input 支持批量。
    """
    if not texts:
        return []
    client = _get_client()
    try:
        resp = client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
    except Exception as exc:  # noqa: BLE001 - SDK 各类异常统一包装
        raise EmbedError(f"embedding 调用失败：{type(exc).__name__}: {exc}") from exc
    # 按 index 对齐（API 保证返回顺序与输入一致，仍以 index 兜底）
    data = sorted(resp.data, key=lambda d: d.index)
    return [d.embedding for d in data]


def embed_one(text: str) -> list[float]:
    """单条文本 embedding（表 rawText 入库用）。"""
    return embed([text])[0]
