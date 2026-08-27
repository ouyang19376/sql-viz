"""OpenAI 兼容 LLM 客户端封装（F-BK-DT-03）。

singleton + 懒初始化：导入本模块不触发 API key 校验（便于测试时 mock）；
首次 chat 调用才检查并创建 client，连不上 / API key 缺失 → 抛错。
"""
from __future__ import annotations

from typing import Generator, Optional
from time import perf_counter

from openai import APITimeoutError, OpenAI

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


class LLMTimeoutError(LLMClientError):
    """LLM 调用超时（APITimeoutError）。路由层可单独捕获以返回「分析超时」
    而非笼统的「服务暂不可用」。"""


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
        # 硬超时由 LLM_TIMEOUT_SECONDS 控制（默认 120s，给推理模型留余量）；
        # max_retries=0：SDK 默认重试 2 次会把单次超时拖成 3 倍时长，血缘长脚本下 UI 长时间挂死
        timeout=LLM_TIMEOUT_SECONDS,
        max_retries=0,
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
    except APITimeoutError as exc:
        record_llm_usage(
            success=False,
            prompt_tokens=estimated_prompt_tokens,
            latency_ms=(perf_counter() - started_at) * 1000,
            failure_type=type(exc).__name__,
        )
        raise LLMTimeoutError(f"LLM 调用超时：{exc}") from exc
    except Exception as exc:  # openai 其余 SDK 异常统一包装
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


def stream_chat(system_prompt: str, user_message: str) -> Generator[str, None, None]:
    """流式 chat 调用（F-AS-15）：逐 token yield 内容 delta。

    不强制 json_object（流式输出裸 SQL/文本）；stream_options={"include_usage": True}
    使末块携带 usage 以便记账（否则 chunk.usage 恒为 None）。
    抛 LLMClientError 包装上游错误；成功结束记一次 usage（早断流不记，可接受）。
    """
    client = _get_client()
    estimated_prompt_tokens = estimate_tokens(system_prompt, user_message)
    started_at = perf_counter()
    try:
        stream = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            stream=True,
            stream_options={"include_usage": True},
            max_tokens=LLM_MAX_TOKENS,
            temperature=0.7,
        )
    except APITimeoutError as exc:
        record_llm_usage(
            success=False,
            prompt_tokens=estimated_prompt_tokens,
            latency_ms=(perf_counter() - started_at) * 1000,
            failure_type=type(exc).__name__,
        )
        raise LLMTimeoutError(f"LLM 流式调用超时：{exc}") from exc
    except Exception as exc:
        record_llm_usage(
            success=False,
            prompt_tokens=estimated_prompt_tokens,
            latency_ms=(perf_counter() - started_at) * 1000,
            failure_type=type(exc).__name__,
        )
        raise LLMClientError(f"LLM 流式调用失败：{type(exc).__name__}: {exc}") from exc

    usage = None
    completion_chars = 0
    try:
        for chunk in stream:
            if getattr(chunk, "usage", None):
                usage = chunk.usage
            if chunk.choices:
                delta = chunk.choices[0].delta.content
                if delta:
                    completion_chars += len(delta)
                    yield delta
    except APITimeoutError as exc:
        record_llm_usage(
            success=False,
            prompt_tokens=estimated_prompt_tokens,
            completion_tokens=estimate_tokens("x" * completion_chars),
            latency_ms=(perf_counter() - started_at) * 1000,
            failure_type=type(exc).__name__,
        )
        raise LLMTimeoutError(f"LLM 流式调用超时：{exc}") from exc
    except Exception as exc:
        record_llm_usage(
            success=False,
            prompt_tokens=estimated_prompt_tokens,
            completion_tokens=estimate_tokens("x" * completion_chars),
            latency_ms=(perf_counter() - started_at) * 1000,
            failure_type=type(exc).__name__,
        )
        raise LLMClientError(f"LLM 流式调用失败：{type(exc).__name__}: {exc}") from exc
    else:
        prompt_tokens = getattr(usage, "prompt_tokens", None) or estimated_prompt_tokens
        completion_tokens = getattr(usage, "completion_tokens", None) or estimate_tokens(
            "x" * completion_chars
        )
        total_tokens = getattr(usage, "total_tokens", None)
        record_llm_usage(
            success=True,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            latency_ms=(perf_counter() - started_at) * 1000,
        )


def reset_client_for_test() -> None:
    """测试钩子：清空 singleton，便于 monkeypatch 注入 mock。"""
    global _client
    _client = None
