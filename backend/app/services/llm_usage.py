"""LLM 用量统计（F-LM-07）。

只记录聚合指标，不记录 prompt / SQL 原文 / LLM 原始输出。
"""
from __future__ import annotations

from threading import Lock
from typing import Any

_lock = Lock()
_stats = {
    "totalCalls": 0,
    "successCalls": 0,
    "failureCalls": 0,
    "promptTokens": 0,
    "completionTokens": 0,
    "totalTokens": 0,
    "totalLatencyMs": 0.0,
    "failureByType": {},
}


def estimate_tokens(*texts: str | None) -> int:
    """粗略 token 估算：用于上游未返回 usage 时的监控兜底。"""
    total_chars = sum(len(text) for text in texts if text)
    if total_chars <= 0:
        return 0
    return max(1, (total_chars + 3) // 4)


def record_llm_usage(
    *,
    success: bool,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    total_tokens: int | None = None,
    latency_ms: float = 0.0,
    failure_type: str | None = None,
) -> None:
    """记录一次 LLM 调用的聚合用量，不接收或保存原始输入。"""
    safe_prompt_tokens = max(0, prompt_tokens)
    safe_completion_tokens = max(0, completion_tokens)
    safe_total_tokens = max(0, total_tokens if total_tokens is not None else safe_prompt_tokens + safe_completion_tokens)
    safe_latency_ms = max(0.0, latency_ms)

    with _lock:
        _stats["totalCalls"] += 1
        if success:
            _stats["successCalls"] += 1
        else:
            _stats["failureCalls"] += 1
            key = failure_type or "UnknownError"
            failures: dict[str, int] = _stats["failureByType"]  # type: ignore[assignment]
            failures[key] = failures.get(key, 0) + 1
        _stats["promptTokens"] += safe_prompt_tokens
        _stats["completionTokens"] += safe_completion_tokens
        _stats["totalTokens"] += safe_total_tokens
        _stats["totalLatencyMs"] += safe_latency_ms


def get_llm_usage_stats() -> dict[str, Any]:
    """返回当前进程内的 LLM 聚合监控快照。"""
    with _lock:
        total_calls = int(_stats["totalCalls"])
        success_calls = int(_stats["successCalls"])
        failure_calls = int(_stats["failureCalls"])
        total_latency_ms = float(_stats["totalLatencyMs"])
        failure_by_type = dict(_stats["failureByType"])  # type: ignore[arg-type]
        return {
            "totalCalls": total_calls,
            "successCalls": success_calls,
            "failureCalls": failure_calls,
            "failureRate": failure_calls / total_calls if total_calls else 0.0,
            "promptTokens": int(_stats["promptTokens"]),
            "completionTokens": int(_stats["completionTokens"]),
            "totalTokens": int(_stats["totalTokens"]),
            "avgLatencyMs": total_latency_ms / total_calls if total_calls else 0.0,
            "failureByType": failure_by_type,
        }


def reset_llm_usage_for_test() -> None:
    """测试钩子：清空当前进程内的用量统计。"""
    with _lock:
        _stats["totalCalls"] = 0
        _stats["successCalls"] = 0
        _stats["failureCalls"] = 0
        _stats["promptTokens"] = 0
        _stats["completionTokens"] = 0
        _stats["totalTokens"] = 0
        _stats["totalLatencyMs"] = 0.0
        _stats["failureByType"] = {}
