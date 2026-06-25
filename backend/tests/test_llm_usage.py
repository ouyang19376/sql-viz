"""LLM 用量监控测试 — F-LM-07。"""
from types import SimpleNamespace

from app.services import llm_client
from app.services.llm_usage import get_llm_usage_stats, reset_llm_usage_for_test


class _FakeChatCompletions:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error

    def create(self, **kwargs):
        if self.error:
            raise self.error
        return self.result


class _FakeClient:
    def __init__(self, result=None, error=None):
        self.chat = SimpleNamespace(completions=_FakeChatCompletions(result=result, error=error))


def test_chat_json_records_success_usage(monkeypatch):
    reset_llm_usage_for_test()
    resp = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content='{"refused": true}'))],
        usage=SimpleNamespace(prompt_tokens=11, completion_tokens=7, total_tokens=18),
    )
    monkeypatch.setattr(llm_client, "_client", _FakeClient(result=resp))

    assert llm_client.chat_json("system", "user") == '{"refused": true}'

    stats = get_llm_usage_stats()
    assert stats["totalCalls"] == 1
    assert stats["successCalls"] == 1
    assert stats["failureCalls"] == 0
    assert stats["promptTokens"] == 11
    assert stats["completionTokens"] == 7
    assert stats["totalTokens"] == 18


def test_chat_json_records_failure_without_raw_prompt(monkeypatch):
    reset_llm_usage_for_test()
    monkeypatch.setattr(llm_client, "_client", _FakeClient(error=TimeoutError("boom")))

    try:
        llm_client.chat_json("system prompt", "select * from sensitive_table")
    except llm_client.LLMClientError:
        pass

    stats = get_llm_usage_stats()
    assert stats["totalCalls"] == 1
    assert stats["successCalls"] == 0
    assert stats["failureCalls"] == 1
    assert stats["failureByType"] == {"TimeoutError": 1}
    assert "sensitive_table" not in str(stats)
