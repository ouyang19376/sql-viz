"""RAG for NL2SQL - 接口集成测试（API-CK-01/02，F-CK-07/08/09/10 + API-AS-01 /ask + F-AS-15 /ask/stream）。

无实 LLM / Milvus / embedding / rerank：monkeypatch 替换路由引用的 chat_json / stream_chat / embed / mlvus / rerank。
"""
import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import rag_sql as r
from app.services.llm_client import LLMClientError
from app.services.rag_sql_embed import EmbedError
from app.services.rag_sql_milvus import MilvusError
from app.services.rag_sql_rerank import RerankError

client = TestClient(app)

DDL = """
CREATE TABLE dwd_trade_order_info (
  order_id BIGINT NOT NULL COMMENT '订单编号',
  user_id BIGINT COMMENT '用户ID'
) COMMENT='交易订单明细事实表'
PARTITIONED BY (dt STRING COMMENT '分区日期');
"""


def _chat_ok(system, user):
    return json.dumps(
        {
            "chineseName": "交易订单明细事实表",
            "topic": "交易域",
            "description": "订单明细",
            "keyFields": ["order_id"],
            "partitionField": "dt",
            "granularity": "一行一个订单SKU",
        }
    )


class FakeMilvus:
    """记录调用 + 可配置 exists / 可注入异常。"""

    def __init__(self, exists=False, fail_upsert=False):
        self.exists = exists
        self.fail_upsert = fail_upsert
        self.calls = {"exists": [], "upsert": []}

    def table_exists(self, name):
        self.calls["exists"].append(name)
        return self.exists

    def upsert_table_meta(self, name, raw_text, summary_json, fields_json, topic, vector):
        self.calls["upsert"].append(
            dict(name=name, raw_text=raw_text, vector=vector, topic=topic)
        )
        if self.fail_upsert:
            raise MilvusError("向量库暂不可用")


def _embed_ok(text):
    return [0.1, 0.2, 0.3, 0.4]


def _chunk_body(ddl=DDL):
    return {"ddl": ddl}


def _ingest_body(overwrite=False):
    return {
        "tableName": "dwd_trade_order_info",
        "rawText": "### 表概要\n表名：dwd_trade_order_info",
        "summary": {"tableName": "dwd_trade_order_info", "topic": "交易域"},
        "fields": [{"name": "order_id", "type": "BIGINT", "nullable": False}],
        "overwrite": overwrite,
    }


# ─── API-CK-01：/chunk ─────────────────────────────────
def test_chunk_success(monkeypatch):
    monkeypatch.setattr(r, "chat_json", _chat_ok)
    resp = client.post("/api/rag-sql/chunk", json=_chunk_body())
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 0
    data = body["data"]
    assert data["refused"] is False
    assert len(data["chunks"]) == 1
    c = data["chunks"][0]
    assert c["tableName"] == "dwd_trade_order_info"
    assert c["summary"]["chineseName"] == "交易订单明细事实表"
    assert c["summary"]["partitionField"] == "dt"
    assert len(c["fields"]) == 2
    assert "### 表概要" in c["rawText"]


def test_chunk_parse_fail_refused(monkeypatch):
    monkeypatch.setattr(r, "chat_json", _chat_ok)
    resp = client.post("/api/rag-sql/chunk", json=_chunk_body("这是普通文本"))
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["refused"] is True
    assert data["chunks"] == []
    assert "CREATE TABLE" in data["message"]


def test_chunk_llm_fallback_success(monkeypatch):
    """plan §6.2 #3：sqlglot 失败 -> LLM 自由解析成功（API 层）。"""

    def chat(system, user):
        return json.dumps({"tables": [{
            "tableName": "dwd_order",
            "fields": [{"name": "order_id", "type": "bigint", "nullable": False}],
        }]})

    monkeypatch.setattr(r, "chat_json", chat)
    resp = client.post("/api/rag-sql/chunk", json=_chunk_body("建表 dwd_order 含 order_id"))
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["refused"] is False
    assert len(data["chunks"]) == 1
    assert data["chunks"][0]["tableName"] == "dwd_order"


def test_chunk_length_guard_rejects_overlong(monkeypatch):
    """F-CK-10：DDL > 20000 字符 -> Pydantic 422。"""
    monkeypatch.setattr(r, "chat_json", _chat_ok)
    resp = client.post("/api/rag-sql/chunk", json={"ddl": "x" * 20001})
    assert resp.status_code == 422


def test_chunk_empty_ddl_rejected(monkeypatch):
    monkeypatch.setattr(r, "chat_json", _chat_ok)
    resp = client.post("/api/rag-sql/chunk", json={"ddl": ""})
    assert resp.status_code == 422


# ─── API-CK-02：/ingest/table ─────────────────────────
def test_ingest_new_table(monkeypatch):
    fake = FakeMilvus(exists=False)
    monkeypatch.setattr(r, "embed_one", _embed_ok)
    monkeypatch.setattr(r, "mlvus", fake)
    resp = client.post("/api/rag-sql/ingest/table", json=_ingest_body())
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["ingested"] is True
    assert data["alreadyExists"] is False
    assert data["overwritten"] is False
    assert data["ingestedAt"] is not None
    assert fake.calls["upsert"]  # embed + upsert 被调用


def test_ingest_exists_without_overwrite_probes_only(monkeypatch):
    """F-CK-08：同名表已入库且未确认 -> 仅探测，不 embed 不写。"""
    fake = FakeMilvus(exists=True)
    embed_calls = []

    def embed(text):
        embed_calls.append(text)
        return [0.1]

    monkeypatch.setattr(r, "embed_one", embed)
    monkeypatch.setattr(r, "mlvus", fake)
    resp = client.post("/api/rag-sql/ingest/table", json=_ingest_body(overwrite=False))
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["ingested"] is False
    assert data["alreadyExists"] is True
    assert data["overwritten"] is False
    assert embed_calls == []  # 未 embed
    assert fake.calls["upsert"] == []  # 未写


def test_ingest_overwrite_confirmed(monkeypatch):
    """F-CK-08：确认覆盖 -> 删旧插新，overwritten=True。"""
    fake = FakeMilvus(exists=True)
    monkeypatch.setattr(r, "embed_one", _embed_ok)
    monkeypatch.setattr(r, "mlvus", fake)
    resp = client.post("/api/rag-sql/ingest/table", json=_ingest_body(overwrite=True))
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["ingested"] is True
    assert data["overwritten"] is True
    assert data["alreadyExists"] is True


def test_ingest_embed_error_returns_504(monkeypatch):
    def embed_boom(text):
        raise EmbedError("embedding 上游超时")

    monkeypatch.setattr(r, "embed_one", embed_boom)
    monkeypatch.setattr(r, "mlvus", FakeMilvus(exists=False))
    resp = client.post("/api/rag-sql/ingest/table", json=_ingest_body())
    assert resp.status_code == 504
    assert resp.json()["code"] == -1


def test_ingest_milvus_error_returns_500(monkeypatch):
    monkeypatch.setattr(r, "embed_one", _embed_ok)
    monkeypatch.setattr(r, "mlvus", FakeMilvus(exists=False, fail_upsert=True))
    resp = client.post("/api/rag-sql/ingest/table", json=_ingest_body())
    assert resp.status_code == 500
    assert resp.json()["code"] == -2


# ─── API-CK-03：/tables（KB 栏目「SQL数据表元数据」展示） ──
class FakeTableMilvus:
    """table_meta 列表内存替身：返回可配置列表 / 可注入异常。"""

    def __init__(self, tables=None, fail=False):
        self._tables = tables or []
        self.fail = fail

    def list_table_meta(self):
        if self.fail:
            raise MilvusError("向量库暂不可用")
        return self._tables


def test_list_tables_returns_meta(monkeypatch):
    """已入库表元数据列表：每张表一项，含 rawText 供点击预览。"""
    tables = [
        {"tableName": "dwd_order", "topic": "交易域", "rawText": "### 表概要\ndwd_order", "createdAt": 200},
        {"tableName": "dim_user", "topic": None, "rawText": "### 表概要\ndim_user", "createdAt": 100},
    ]
    monkeypatch.setattr(r, "mlvus", FakeTableMilvus(tables=tables))
    resp = client.get("/api/rag-sql/tables")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) == 2
    by_name = {t["tableName"]: t for t in data}
    assert by_name["dwd_order"]["topic"] == "交易域"
    assert by_name["dwd_order"]["rawText"].startswith("### 表概要")
    assert by_name["dim_user"]["topic"] is None


def test_list_tables_empty(monkeypatch):
    monkeypatch.setattr(r, "mlvus", FakeTableMilvus(tables=[]))
    resp = client.get("/api/rag-sql/tables")
    assert resp.status_code == 200
    assert resp.json()["data"] == []


def test_list_tables_milvus_error_returns_500(monkeypatch):
    monkeypatch.setattr(r, "mlvus", FakeTableMilvus(fail=True))
    resp = client.get("/api/rag-sql/tables")
    assert resp.status_code == 500
    assert resp.json()["code"] == -2


# ============================================================
# KB 子模块（API-KB-01~04，F-KB-01~08）
# ============================================================
KB_CONTENT = (
    "第一条规范：SELECT 必须显式列出列名。\n\n"
    "第二条规范：禁止使用 SELECT *。\n\n"
    "第三条规范：表必须带别名。"
)


class FakeKbMilvus:
    """kb_docs 内存替身：记录调用 + 可配置 kb_exists / 失败。"""

    def __init__(self, kb_exists=False, fail_insert=False, fail_count=False):
        self.kb_exists = kb_exists
        self.fail_insert = fail_insert
        self.fail_count = fail_count
        self.docs = {}  # title -> doc dict
        self.by_id = {}  # doc_id -> doc dict
        self.calls = {"exists": [], "insert": [], "delete_title": [], "list": 0, "get": [], "del_id": []}

    def kb_doc_exists(self, title):
        self.calls["exists"].append(title)
        return self.kb_exists or title in self.docs

    def delete_kb_doc_by_title(self, title):
        self.calls["delete_title"].append(title)
        doc = self.docs.pop(title, None)
        if doc:
            self.by_id.pop(doc["doc_id"], None)

    def insert_kb_chunks(self, doc_id, title, category, source_name, chunks, vectors, created_at):
        self.calls["insert"].append({"doc_id": doc_id, "title": title, "n": len(chunks)})
        if self.fail_insert:
            raise MilvusError("向量库暂不可用")
        doc = {
            "doc_id": doc_id, "title": title, "category": category,
            "sourceName": source_name, "chunks": list(chunks), "createdAt": created_at,
        }
        self.docs[title] = doc
        self.by_id[doc_id] = doc

    def list_kb_docs(self):
        self.calls["list"] += 1
        return [
            {"id": d["doc_id"], "title": t, "category": d["category"],
             "sourceName": d["sourceName"], "createdAt": d["createdAt"],
             "chunkCount": len(d["chunks"])}
            for t, d in self.docs.items()
        ]

    def get_kb_doc(self, doc_id):
        self.calls["get"].append(doc_id)
        d = self.by_id.get(doc_id)
        if not d:
            return None
        return {"id": doc_id, "title": d["title"], "category": d["category"],
                "sourceName": d["sourceName"], "createdAt": d["createdAt"],
                "chunkCount": len(d["chunks"]),
                "chunks": [{"index": i, "text": c} for i, c in enumerate(d["chunks"])]}

    def delete_kb_doc(self, doc_id):
        self.calls["del_id"].append(doc_id)
        d = self.by_id.pop(doc_id, None)
        if not d:
            return 0
        self.docs.pop(d["title"], None)
        return len(d["chunks"])

    def count_table_meta(self):
        """stats（F-BK-CM-01）：FakeKbMilvus 不持有 table_meta，恒 0。"""
        if self.fail_count:
            raise MilvusError("向量库暂不可用")
        return 0

    def count_kb_docs(self):
        """stats（F-BK-CM-01）：从内部状态派生 文档数 / 分片数。"""
        if self.fail_count:
            raise MilvusError("向量库暂不可用")
        return {
            "docCount": len(self.by_id),
            "chunkCount": sum(len(d["chunks"]) for d in self.by_id.values()),
        }


def _embed_batch_ok(texts):
    return [[0.1, 0.2] for _ in texts]


def _embed_batch_fail(texts):
    raise EmbedError("embedding 上游超时")


def _kb_body(overwrite=False, title="SQL 编码规范", content=KB_CONTENT, category="sql_standard"):
    return {"title": title, "category": category, "content": content, "overwrite": overwrite}


# ─── API-KB-01：/ingest/doc ────────────────────────────
def test_ingest_doc_new(monkeypatch):
    fake = FakeKbMilvus()
    monkeypatch.setattr(r, "embed", _embed_batch_ok)
    monkeypatch.setattr(r, "mlvus", fake)
    resp = client.post("/api/rag-sql/ingest/doc", json=_kb_body())
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["ingested"] is True
    assert data["alreadyExists"] is False
    assert data["overwritten"] is False
    assert data["id"].startswith("doc_")
    assert data["chunkCount"] == 3  # 3 段
    assert data["ingestedAt"] is not None
    assert fake.calls["insert"]  # 批量 insert 调用一次


def test_ingest_doc_exists_probe_only(monkeypatch):
    """F-KB-07：同标题已入库且未确认 -> 仅探测，不 embed 不写。"""
    fake = FakeKbMilvus(kb_exists=True)
    embed_calls = []

    def embed(texts):
        embed_calls.extend(texts)
        return _embed_batch_ok(texts)

    monkeypatch.setattr(r, "embed", embed)
    monkeypatch.setattr(r, "mlvus", fake)
    resp = client.post("/api/rag-sql/ingest/doc", json=_kb_body(overwrite=False))
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["ingested"] is False
    assert data["alreadyExists"] is True
    assert data["overwritten"] is False
    assert embed_calls == []  # 未 embed
    assert fake.calls["insert"] == []  # 未写


def test_ingest_doc_overwrite_confirmed(monkeypatch):
    """F-KB-07：确认覆盖 -> 删旧插新，overwritten=True。"""
    fake = FakeKbMilvus(kb_exists=True)
    monkeypatch.setattr(r, "embed", _embed_batch_ok)
    monkeypatch.setattr(r, "mlvus", fake)
    resp = client.post("/api/rag-sql/ingest/doc", json=_kb_body(overwrite=True))
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["ingested"] is True
    assert data["overwritten"] is True
    assert data["alreadyExists"] is True
    assert fake.calls["delete_title"] == ["SQL 编码规范"]  # 先删旧


def test_ingest_doc_size_guard_rejects_overlong(monkeypatch):
    """F-KB-08：content > 200000 字符 -> Pydantic 422。"""
    monkeypatch.setattr(r, "embed", _embed_batch_ok)
    monkeypatch.setattr(r, "mlvus", FakeKbMilvus())
    body = _kb_body(content="x" * 200001)
    resp = client.post("/api/rag-sql/ingest/doc", json=body)
    assert resp.status_code == 422


def test_ingest_doc_missing_category_rejected(monkeypatch):
    """F-KB-02：类别必选，缺省 -> 422。"""
    monkeypatch.setattr(r, "embed", _embed_batch_ok)
    monkeypatch.setattr(r, "mlvus", FakeKbMilvus())
    resp = client.post("/api/rag-sql/ingest/doc", json={"title": "t", "content": "c"})
    assert resp.status_code == 422


def test_ingest_doc_embed_error_returns_504(monkeypatch):
    monkeypatch.setattr(r, "embed", _embed_batch_fail)
    monkeypatch.setattr(r, "mlvus", FakeKbMilvus())
    resp = client.post("/api/rag-sql/ingest/doc", json=_kb_body())
    assert resp.status_code == 504
    assert resp.json()["code"] == -1


def test_ingest_doc_milvus_error_returns_500(monkeypatch):
    monkeypatch.setattr(r, "embed", _embed_batch_ok)
    monkeypatch.setattr(r, "mlvus", FakeKbMilvus(fail_insert=True))
    resp = client.post("/api/rag-sql/ingest/doc", json=_kb_body())
    assert resp.status_code == 500
    assert resp.json()["code"] == -2


# ─── API-KB-02/03/04：列表 / 详情 / 删除 ─────────────────
def _ingest_one(monkeypatch, fake, title="SQL 编码规范", category="sql_standard"):
    monkeypatch.setattr(r, "embed", _embed_batch_ok)
    monkeypatch.setattr(r, "mlvus", fake)
    resp = client.post("/api/rag-sql/ingest/doc", json=_kb_body(title=title, category=category))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["id"]


def test_list_kb_returns_groupable_flat_list(monkeypatch):
    """F-KB-04：列表返回扁平数组，含 chunkCount；前端按 category 分组。"""
    fake = FakeKbMilvus()
    _ingest_one(monkeypatch, fake, title="SQL 编码规范", category="sql_standard")
    _ingest_one(monkeypatch, fake, title="建模规范 A", category="modeling_standard")
    resp = client.get("/api/rag-sql/kb")
    assert resp.status_code == 200
    docs = resp.json()["data"]
    assert len(docs) == 2
    by_title = {d["title"]: d for d in docs}
    assert by_title["SQL 编码规范"]["chunkCount"] == 3
    assert by_title["SQL 编码规范"]["category"] == "sql_standard"
    assert by_title["建模规范 A"]["category"] == "modeling_standard"
    assert all(d["id"].startswith("doc_") for d in docs)


def test_list_kb_empty(monkeypatch):
    monkeypatch.setattr(r, "mlvus", FakeKbMilvus())
    resp = client.get("/api/rag-sql/kb")
    assert resp.status_code == 200
    assert resp.json()["data"] == []


def test_get_kb_returns_chunks(monkeypatch):
    """F-KB-05：详情含全部分片原文，按 index 排序。"""
    fake = FakeKbMilvus()
    doc_id = _ingest_one(monkeypatch, fake)
    resp = client.get(f"/api/rag-sql/kb/{doc_id}")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["id"] == doc_id
    assert data["chunkCount"] == 3
    assert [c["index"] for c in data["chunks"]] == [0, 1, 2]
    assert data["chunks"][0]["text"].startswith("第一条规范")


def test_get_kb_not_found_returns_404(monkeypatch):
    monkeypatch.setattr(r, "mlvus", FakeKbMilvus())
    resp = client.get("/api/rag-sql/kb/doc_nope")
    assert resp.status_code == 404
    assert resp.json()["code"] == -2


def test_delete_kb_returns_count(monkeypatch):
    """F-KB-06：删除连带分片，返回删除条数。"""
    fake = FakeKbMilvus()
    doc_id = _ingest_one(monkeypatch, fake)
    resp = client.delete(f"/api/rag-sql/kb/{doc_id}")
    assert resp.status_code == 200
    assert resp.json()["data"]["deleted"] == 3
    # 再查应 404
    resp2 = client.get(f"/api/rag-sql/kb/{doc_id}")
    assert resp2.status_code == 404


def test_delete_kb_not_found_returns_404(monkeypatch):
    monkeypatch.setattr(r, "mlvus", FakeKbMilvus())
    resp = client.delete("/api/rag-sql/kb/doc_nope")
    assert resp.status_code == 404


# ============================================================
# AS 子模块（API-AS-01 /ask + F-AS-15 /ask/stream，F-AS-03~13）
# ============================================================
class AskFakeMilvus:
    """检索用内存替身：可配置向量命中与全量扫描语料；可注入检索异常。"""

    def __init__(self, tables=None, kb=None, vec_t=None, vec_k=None, fail_search=False):
        self.tables = tables or []
        self.kb = kb or []
        self.vec_t = vec_t or []
        self.vec_k = vec_k or []
        self.fail_search = fail_search

    def search_table_meta(self, vector, top_k):
        if self.fail_search:
            raise MilvusError("向量库暂不可用")
        return self.vec_t[:top_k]

    def search_kb_docs(self, vector, top_k):
        if self.fail_search:
            raise MilvusError("向量库暂不可用")
        return self.vec_k[:top_k]

    def scan_table_meta_all(self):
        return self.tables

    def scan_kb_chunks_all(self):
        return self.kb


_T_HIT = {
    "id": 1,
    "tableName": "dwd_order",
    "rawText": "表名：dwd_order 主题域：交易域 字段：order_id order_amount",
    "topic": "交易域",
}
_K_HIT = {
    "id": 10,
    "docId": "doc_1",
    "title": "SQL编码规范",
    "chunkText": "SELECT 必须显式列出列名 禁止 SELECT 星号",
    "chunkIndex": 0,
}


def _embed_ask(texts):
    return [[0.1, 0.2] for _ in texts]


def _rerank_ok(query, cands, top_n):
    """确定性 rerank：按 RRF 分排序（模拟成功重排）。"""
    return sorted(cands, key=lambda c: -c.get("score", 0.0))[:top_n]


def _chat_sql_ok(system, user):
    return json.dumps({"sql": "SELECT order_id, order_amount FROM dwd_order LIMIT 100"})


def _ask_body(question="查询最近7天各省份的订单金额", dialect="mysql", history=None):
    body = {"question": question, "dialect": dialect}
    if history is not None:
        body["history"] = history
    return body


def _patch_ask(monkeypatch, fake):
    monkeypatch.setattr(r, "embed", _embed_ask)
    monkeypatch.setattr(r, "mlvus", fake)
    monkeypatch.setattr(r.rag_sql_rerank, "rerank", _rerank_ok)


# ─── API-AS-01：/ask ─────────────────────────────────────
def test_ask_success_returns_sql_and_sources(monkeypatch):
    fake = AskFakeMilvus(tables=[_T_HIT], kb=[_K_HIT], vec_t=[_T_HIT], vec_k=[_K_HIT])
    _patch_ask(monkeypatch, fake)
    monkeypatch.setattr(r, "chat_json", _chat_sql_ok)
    resp = client.post("/api/rag-sql/ask", json=_ask_body())
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["refused"] is False
    assert data["degraded"] is False
    assert "SELECT" in data["sql"]
    assert data["validation"]["allowed"] is True
    titles = {s["title"] for s in data["sources"]}
    assert "dwd_order" in titles
    assert "SQL编码规范" in titles


def test_ask_empty_kb_degrades_still_generates(monkeypatch):
    """F-AS-10：空库 -> degraded，仍生成（纯 LLM 无上下文）。"""
    fake = AskFakeMilvus(tables=[], kb=[], vec_t=[], vec_k=[])
    _patch_ask(monkeypatch, fake)
    monkeypatch.setattr(r, "chat_json", _chat_sql_ok)
    resp = client.post("/api/rag-sql/ask", json=_ask_body())
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["degraded"] is True
    assert "知识库为空" in data["degradeReason"]
    assert data["sources"] == []
    assert "SELECT" in data["sql"]  # 仍生成


def test_ask_refused_on_bad_llm_output(monkeypatch):
    """§8.3：LLM 返回非 JSON -> refused（code 0），不交付坏 SQL。"""
    fake = AskFakeMilvus(tables=[_T_HIT], kb=[_K_HIT], vec_t=[_T_HIT], vec_k=[_K_HIT])
    _patch_ask(monkeypatch, fake)
    monkeypatch.setattr(r, "chat_json", lambda s, u: "not a json")
    resp = client.post("/api/rag-sql/ask", json=_ask_body())
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["refused"] is True
    assert data["sql"] is None


def test_ask_validation_fail_marks_not_allowed(monkeypatch):
    """F-AS-07：生成 DROP -> sqlglot 拦截，allowed=False，仍展示供用户重试。"""
    fake = AskFakeMilvus(tables=[_T_HIT], kb=[_K_HIT], vec_t=[_T_HIT], vec_k=[_K_HIT])
    _patch_ask(monkeypatch, fake)
    monkeypatch.setattr(r, "chat_json", lambda s, u: json.dumps({"sql": "DROP TABLE dwd_order"}))
    resp = client.post("/api/rag-sql/ask", json=_ask_body())
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["validation"]["allowed"] is False
    assert len(data["validation"]["violations"]) > 0


def test_ask_llm_timeout_returns_504(monkeypatch):
    """F-AS-12：LLM 超时/异常 -> 504 红字（非 refused）。"""
    fake = AskFakeMilvus(tables=[_T_HIT], kb=[_K_HIT], vec_t=[_T_HIT], vec_k=[_K_HIT])
    _patch_ask(monkeypatch, fake)

    def boom(s, u):
        raise LLMClientError("LLM 调用失败：timeout: read timed out")

    monkeypatch.setattr(r, "chat_json", boom)
    resp = client.post("/api/rag-sql/ask", json=_ask_body())
    assert resp.status_code == 504
    assert resp.json()["code"] == -1


def test_ask_milvus_error_returns_500(monkeypatch):
    fake = AskFakeMilvus(fail_search=True)
    _patch_ask(monkeypatch, fake)
    monkeypatch.setattr(r, "chat_json", _chat_sql_ok)
    resp = client.post("/api/rag-sql/ask", json=_ask_body())
    assert resp.status_code == 500
    assert resp.json()["code"] == -2


def test_ask_question_too_long_rejected(monkeypatch):
    """F-AS-03 长度护栏：question > 2000 -> 422。"""
    _patch_ask(monkeypatch, AskFakeMilvus())
    monkeypatch.setattr(r, "chat_json", _chat_sql_ok)
    resp = client.post("/api/rag-sql/ask", json=_ask_body(question="x" * 2001))
    assert resp.status_code == 422


def test_ask_missing_dialect_rejected(monkeypatch):
    _patch_ask(monkeypatch, AskFakeMilvus())
    monkeypatch.setattr(r, "chat_json", _chat_sql_ok)
    resp = client.post("/api/rag-sql/ask", json={"question": "q"})
    assert resp.status_code == 422


def test_ask_history_truncated(monkeypatch):
    """F-AS-13：history 超过 RAG_HISTORY_MAX_TURNS(6) -> 后端截断不报错。"""
    fake = AskFakeMilvus(tables=[_T_HIT], kb=[_K_HIT], vec_t=[_T_HIT], vec_k=[_K_HIT])
    _patch_ask(monkeypatch, fake)
    monkeypatch.setattr(r, "chat_json", _chat_sql_ok)
    history = [{"role": "user", "content": f"q{i}"} for i in range(20)]
    resp = client.post("/api/rag-sql/ask", json=_ask_body(history=history))
    assert resp.status_code == 200
    assert resp.json()["data"]["refused"] is False


# ─── F-AS-15：/ask/stream（SSE） ─────────────────────────
def _parse_sse(text):
    frames = []
    for chunk in text.split("\n\n"):
        if not chunk.strip():
            continue
        event = "message"
        data = ""
        for line in chunk.split("\n"):
            if line.startswith("event:"):
                event = line[len("event:"):].strip()
            elif line.startswith("data:"):
                data += line[len("data:"):].strip()
        frames.append((event, json.loads(data) if data else {}))
    return frames


def test_ask_stream_emits_meta_delta_done(monkeypatch):
    fake = AskFakeMilvus(tables=[_T_HIT], kb=[_K_HIT], vec_t=[_T_HIT], vec_k=[_K_HIT])
    _patch_ask(monkeypatch, fake)

    def fake_stream(system, user):
        yield "SELECT"
        yield " 1"

    monkeypatch.setattr(r, "stream_chat", fake_stream)
    resp = client.post("/api/rag-sql/ask/stream", json=_ask_body())
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    frames = _parse_sse(resp.text)
    events = [e for e, _ in frames]
    assert events[0] == "meta"
    assert events[-1] == "done"
    assert events.count("delta") == 2
    meta = next(p for e, p in frames if e == "meta")
    assert any(s["title"] == "dwd_order" for s in meta["sources"])
    done = next(p for e, p in frames if e == "done")
    assert done["sql"] == "SELECT 1"
    assert done["validation"]["allowed"] is True
    # delta 累积 = done.sql
    deltas = "".join(p["delta"] for e, p in frames if e == "delta")
    assert deltas == "SELECT 1"


def test_ask_stream_error_event_on_llm_failure(monkeypatch):
    fake = AskFakeMilvus(tables=[_T_HIT], kb=[_K_HIT], vec_t=[_T_HIT], vec_k=[_K_HIT])
    _patch_ask(monkeypatch, fake)

    def boom(system, user):
        raise LLMClientError("LLM 流式调用失败：timeout")

    monkeypatch.setattr(r, "stream_chat", boom)
    resp = client.post("/api/rag-sql/ask/stream", json=_ask_body())
    assert resp.status_code == 200
    frames = _parse_sse(resp.text)
    events = [e for e, _ in frames]
    assert "meta" in events  # 检索已发出 meta
    assert events[-1] == "error"
    err = next(p for e, p in frames if e == "error")
    assert "timeout" in err["message"]


def test_ask_stream_empty_kb_meta_marks_degraded(monkeypatch):
    """F-AS-10 流式：空库 -> meta.degraded=True，仍流式生成。"""
    fake = AskFakeMilvus(tables=[], kb=[], vec_t=[], vec_k=[])
    _patch_ask(monkeypatch, fake)
    monkeypatch.setattr(r, "stream_chat", lambda s, u: iter(["SELECT 1"]))
    resp = client.post("/api/rag-sql/ask/stream", json=_ask_body())
    assert resp.status_code == 200
    meta = next(p for e, p in _parse_sse(resp.text) if e == "meta")
    assert meta["degraded"] is True
    assert "知识库为空" in meta["degradeReason"]


# ─── API-CM-01：/stats（F-BK-CM-01） ────────────────────
def test_stats_empty(monkeypatch):
    """空库 stats：全 0。"""
    monkeypatch.setattr(r, "mlvus", FakeKbMilvus())
    resp = client.get("/api/rag-sql/stats")
    assert resp.status_code == 200
    assert resp.json()["data"] == {"tableCount": 0, "docCount": 0, "chunkCount": 0}


def test_stats_reflects_ingested_docs(monkeypatch):
    """入库后 stats 反映文档数 / 分片数（2 文档 × 3 段 = 6 分片）。"""
    fake = FakeKbMilvus()
    monkeypatch.setattr(r, "embed", _embed_batch_ok)
    monkeypatch.setattr(r, "mlvus", fake)
    client.post("/api/rag-sql/ingest/doc", json=_kb_body(title="SQL 编码规范"))
    client.post("/api/rag-sql/ingest/doc", json=_kb_body(title="建模规范"))
    resp = client.get("/api/rag-sql/stats")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["tableCount"] == 0
    assert data["docCount"] == 2
    assert data["chunkCount"] == 6


def test_stats_milvus_error_returns_500(monkeypatch):
    monkeypatch.setattr(r, "mlvus", FakeKbMilvus(fail_count=True))
    resp = client.get("/api/rag-sql/stats")
    assert resp.status_code == 500
    assert resp.json()["code"] == -2
