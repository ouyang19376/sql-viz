"""OpenAI 兼容 LLM 客户端封装（F-BK-DT-03）。

singleton + 懒初始化：导入本模块不触发 API key 校验（便于测试时 mock）；
首次 chat 调用才检查并创建 client，连不上 / API key 缺失 → 抛错。
"""
from __future__ import annotations

from typing import Optional
from time import perf_counter

from openai import OpenAI

from app.core.config import (
    LLM_MAX_TOKENS,
    LLM_MODEL,
    LLM_TIMEOUT_SECONDS,
    OPENAI_API_KEY,
    OPENAI_BASE_URL,
)
from app.services.llm_usage import estimate_tokens, record_llm_usage


class LLMClientError(RuntimeError):
    """LLM 客户端层错误：配置缺失 / 上游异常 / 超时。"""


_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    """懒初始化 singleton。"""
    global _client
    if _client is not None:
        return _client
    if not OPENAI_API_KEY:
        raise LLMClientError(
            "OPENAI_API_KEY 未配置；请复制 .env.example 为 .env 并填入 key。"
        )
    _client = OpenAI(
        api_key=OPENAI_API_KEY,
        base_url=OPENAI_BASE_URL,
        # 60s 硬超时（PRD §6.1，requirements.txt 已锁 openai>=1.30）
        timeout=LLM_TIMEOUT_SECONDS,
    )
    return _client


def chat_json(system_prompt: str, user_message: str) -> str:
    """单次 chat 调用，强制 JSON 输出（F-LM-02）。

    返回 LLM 原始 content 字符串（未解析）；调用方负责 JSON.parse + Schema 校验。
    抛 LLMClientError 包装一切上游错误，让调用方统一兜底。
    """
    client = _get_client()
    estimated_prompt_tokens = estimate_tokens(system_prompt, user_message)
    started_at = perf_counter()
    try:
        resp = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            response_format={"type": "json_object"},
            max_tokens=LLM_MAX_TOKENS,
            temperature=0.7,
        )
    except Exception as exc:  # openai 各类 SDK 异常统一包装
        record_llm_usage(
            success=False,
            prompt_tokens=estimated_prompt_tokens,
            latency_ms=(perf_counter() - started_at) * 1000,
            failure_type=type(exc).__name__,
        )
        raise LLMClientError(f"LLM 调用失败：{type(exc).__name__}: {exc}") from exc

    content = resp.choices[0].message.content if resp.choices else None
    usage = getattr(resp, "usage", None)
    prompt_tokens = getattr(usage, "prompt_tokens", None) or estimated_prompt_tokens
    completion_tokens = getattr(usage, "completion_tokens", None) or estimate_tokens(content)
    total_tokens = getattr(usage, "total_tokens", None)
    if not content:
        record_llm_usage(
            success=False,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            latency_ms=(perf_counter() - started_at) * 1000,
            failure_type="EmptyContent",
        )
        raise LLMClientError("LLM 返回空内容")
    record_llm_usage(
        success=True,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        latency_ms=(perf_counter() - started_at) * 1000,
    )
    return content


def reset_client_for_test() -> None:
    """测试钩子：清空 singleton，便于 monkeypatch 注入 mock。"""
    global _client
    _client = None
