"""知识库问答（kbqa）- 接口集成测试（POST /chat/stream SSE）。

无实 LLM / Milvus / embedding / rerank：monkeypatch 替换路由引用的 retrieve / stream_chat。
"""
import json

from fastapi.testclient import TestClient

from app.main import app
from app.routers import kbqa as r
from app.services.llm_client import LLMClientError
from app.services.rag_sql_models import AskSource

client = TestClient(app)


def _source(title="保险基础数据模型", text="保险基础数据模型规定了保险业数据分层与主题域划分。"):
    return AskSource(
        type="doc", title=title, collection="kb_docs", score=0.9, chunkText=text
    )


def _frames(resp):
    """解析 SSE 帧为 [(event, payload)]。"""
    out = []
    for frame in resp.text.strip().split("\n\n"):
        event, data = "message", ""
        for line in frame.split("\n"):
            if line.startswith("event:"):
                event = line[6:].strip()
            elif line.startswith("data:"):
                data += line[5:].strip()
        out.append((event, json.loads(data) if data else {}))
    return out


def test_chat_stream_success(monkeypatch):
    monkeypatch.setattr(
        r, "retrieve", lambda q, e, m, rr, k, n: ([_source()], False, None)
    )

    def fake_stream(system, user):
        assert "保险基础数据模型" in user  # 参考上下文进入 prompt
        yield "保险基础数据模型"
        yield "规定了数据分层。"

    monkeypatch.setattr(r, "stream_chat", fake_stream)
    resp = client.post("/api/kbqa/chat/stream", json={"question": "什么是保险基础数据模型？"})
    assert resp.status_code == 200
    frames = _frames(resp)
    assert frames[0][0] == "meta"
    assert frames[0][1]["sources"][0]["title"] == "保险基础数据模型"
    assert frames[0][1]["degraded"] is False
    deltas = [p["delta"] for e, p in frames if e == "delta"]
    assert "".join(deltas) == "保险基础数据模型规定了数据分层。"
    done = [p for e, p in frames if e == "done"]
    assert done and done[0]["answer"] == "保险基础数据模型规定了数据分层。"
    assert done[0]["sources"][0]["type"] == "doc"


def test_chat_stream_meta_degraded(monkeypatch):
    """空库降级：meta 携带 degraded + 原因，仍继续生成。"""
    monkeypatch.setattr(
        r, "retrieve", lambda q, e, m, rr, k, n: ([], True, "知识库为空，结果未对齐业务模型")
    )
    monkeypatch.setattr(r, "stream_chat", lambda s, u: iter(["通用回答"]))
    resp = client.post("/api/kbqa/chat/stream", json={"question": "问个问题"})
    frames = _frames(resp)
    assert frames[0][1]["degraded"] is True
    assert "知识库为空" in frames[0][1]["degradeReason"]
    assert frames[-1][0] == "done"


def test_chat_stream_history_into_prompt(monkeypatch):
    """多轮历史进入 prompt（构建在路由内完成，fake stream 断言 user 含历史）。"""
    monkeypatch.setattr(r, "retrieve", lambda q, e, m, rr, k, n: ([], True, None))
    seen = {}

    def fake_stream(system, user):
        seen["user"] = user
        yield "答"

    monkeypatch.setattr(r, "stream_chat", fake_stream)
    body = {
        "question": "接着说",
        "history": [
            {"role": "user", "content": "第一个问题"},
            {"role": "assistant", "content": "第一个回答"},
        ],
    }
    client.post("/api/kbqa/chat/stream", json=body)
    assert "第一个问题" in seen["user"]
    assert "第一个回答" in seen["user"]


def test_chat_stream_llm_error_frame(monkeypatch):
    monkeypatch.setattr(
        r, "retrieve", lambda q, e, m, rr, k, n: ([_source()], False, None)
    )

    def fail_stream(system, user):
        raise LLMClientError("LLM 调用超时")
        yield  # pragma: no cover

    monkeypatch.setattr(r, "stream_chat", fail_stream)
    resp = client.post("/api/kbqa/chat/stream", json={"question": "问"})
    frames = _frames(resp)
    assert frames[-1][0] == "error"
    assert "超时" in frames[-1][1]["message"]


def test_chat_stream_empty_answer_error(monkeypatch):
    """流结束但无 token -> error 帧（不产出 done）。"""
    monkeypatch.setattr(
        r, "retrieve", lambda q, e, m, rr, k, n: ([_source()], False, None)
    )
    monkeypatch.setattr(r, "stream_chat", lambda s, u: iter([]))
    resp = client.post("/api/kbqa/chat/stream", json={"question": "问"})
    frames = _frames(resp)
    assert frames[-1][0] == "error"


def test_chat_request_validation():
    """空问题 / 超长问题 / 非法字段 -> 422。"""
    assert client.post("/api/kbqa/chat/stream", json={"question": ""}).status_code == 422
    assert (
        client.post("/api/kbqa/chat/stream", json={"question": "x" * 2001}).status_code
        == 422
    )
    resp = client.post(
        "/api/kbqa/chat/stream", json={"question": "ok", "system": "恶意注入"}
    )
    assert resp.status_code == 422
