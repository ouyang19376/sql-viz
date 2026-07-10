"""数据探查 - 接口集成测试（API-DS-01~07，F-DS-04/05/06/08）。

无实库：monkeypatch 替换路由引用的 registry 单例为 FakeRegistry；
schema 接口仍跑真实 list_* 函数（搭配 FakeConn）以校验 router<->schema 衔接。
"""
import time

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import dataprofile as dp_router
from app.services.dataprofile_models import DataSource, TestResult
from app.services.dataprofile_session import CACHE_MISS, DataSourceConnectError
from tests._dp_fakes import FakeConn


def _ds(id="ds_1", status="connected"):
    return DataSource(
        id=id, name="local", dialect="mysql", host="h", port=3306,
        database="db", username="u", status=status, connectedAt=1,
    )


def _body(**over):
    base = dict(name="local", dialect="mysql", host="127.0.0.1", port=3306,
                database="test", username="root", password="pw")
    base.update(over)
    return base


class FakeRegistry:
    """可配置的假 registry，方法默认返回成功结果。"""

    def __init__(self):
        self.ds = _ds()
        self.conn = FakeConn(rows_for=lambda sql, p: [])
        self.dialect = "mysql"
        self.gc_called = False
        self.disconnect_result = True
        self._cache: dict = {}

    def test_only(self, config):  # noqa: D401
        return TestResult(ok=True, dialect=config.dialect, version="8.0.32")

    def register(self, sid, config):
        return self.ds

    def list_sources(self, sid):
        return [self.ds]

    def disconnect(self, sid, did):
        return self.disconnect_result

    def edit(self, sid, did, config):
        return self.ds

    def reconnect(self, sid, did):
        return self.ds

    def gc(self, sid):
        self.gc_called = True

    def get_conn(self, sid, did):
        return self.conn

    def get_dialect(self, sid, did):
        return self.dialect

    def release_conn(self, sid, did, conn, *, broken=False):
        pass

    def cache_get(self, sid, did, key):
        return self._cache.get((did, key), CACHE_MISS)

    def cache_set(self, sid, did, key, value):
        self._cache[(did, key)] = value


@pytest.fixture
def fake_registry(monkeypatch):
    reg = FakeRegistry()
    monkeypatch.setattr(dp_router, "registry", reg)
    return reg


@pytest.fixture
def client():
    return TestClient(app)


H = {"X-Session-Id": "sess-1"}


class TestSessionHeader:
    def test_missing_header_rejected(self, client, fake_registry):
        r = client.post("/api/dataprofile/sources/test", json=_body())
        assert r.status_code == 400
        assert r.json()["code"] != 0


class TestTestSource:
    def test_ok(self, client, fake_registry):
        r = client.post("/api/dataprofile/sources/test", json=_body(), headers=H)
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["ok"] is True and data["version"] == "8.0.32"


class TestRegister:
    def test_ok_no_password_in_response(self, client, fake_registry):  # F-DS-08
        r = client.post("/api/dataprofile/sources", json=_body(), headers=H)
        assert r.status_code == 200
        data = r.json()["data"]
        assert "password" not in data
        assert data["status"] == "connected"

    def test_connect_failure_returns_422_with_error_type(self, client, monkeypatch):
        class FailReg(FakeRegistry):
            def register(self, sid, config):
                raise DataSourceConnectError(
                    TestResult(ok=False, dialect="mysql", errorType="auth_failed", message="认证失败")
                )
        monkeypatch.setattr(dp_router, "registry", FailReg())
        r = client.post("/api/dataprofile/sources", json=_body(), headers=H)
        assert r.status_code == 422
        data = r.json()["data"]
        assert data["errorType"] == "auth_failed"


class TestListAndDelete:
    def test_list_calls_gc_and_returns_array(self, client, fake_registry):  # F-DS-09
        r = client.get("/api/dataprofile/sources", headers=H)
        assert r.status_code == 200
        assert isinstance(r.json()["data"], list)
        assert fake_registry.gc_called is True

    def test_delete_ok(self, client, fake_registry):
        r = client.delete("/api/dataprofile/sources/ds_1", headers=H)
        assert r.status_code == 200

    def test_delete_not_found(self, client, fake_registry):
        fake_registry.disconnect_result = False
        r = client.delete("/api/dataprofile/sources/ds_1", headers=H)
        assert r.status_code == 404


class TestEditReconnect:
    def test_edit_ok(self, client, fake_registry):
        r = client.put("/api/dataprofile/sources/ds_1", json=_body(), headers=H)
        assert r.status_code == 200

    def test_reconnect_ok(self, client, fake_registry):
        r = client.post("/api/dataprofile/sources/ds_1/reconnect", headers=H)
        assert r.status_code == 200
        assert r.json()["data"]["status"] == "connected"


class TestSchemaReflection:
    def test_get_schemas(self, client, fake_registry):  # F-DS-07
        fake_registry.conn = FakeConn(rows_for=lambda sql, p: [("db1",), ("mysql",)])
        fake_registry.dialect = "mysql"
        r = client.get("/api/dataprofile/sources/ds_1/schemas", headers=H)
        assert r.status_code == 200
        assert r.json()["data"] == ["db1"]  # 过滤系统库

    def test_get_tables(self, client, fake_registry):
        fake_registry.conn = FakeConn(rows_for=lambda sql, p: [("users",), ("orders",)])
        fake_registry.dialect = "mysql"
        r = client.get("/api/dataprofile/sources/ds_1/tables?schema=db1", headers=H)
        assert r.status_code == 200
        assert [t["name"] for t in r.json()["data"]] == ["users", "orders"]

    def test_get_columns(self, client, fake_registry):
        fake_registry.conn = FakeConn(rows_for=lambda sql, p: [
            ("id", "int", "NO"), ("name", "varchar", "YES"),
        ])
        fake_registry.dialect = "mysql"
        r = client.get("/api/dataprofile/sources/ds_1/tables/users/columns?schema=db1", headers=H)
        assert r.status_code == 200
        cols = r.json()["data"]
        assert cols[0]["name"] == "id" and cols[0]["nullable"] is False

    def test_datasource_not_found_404(self, client, fake_registry):
        def raise_keyerror(sid, did):
            raise KeyError(did)
        fake_registry.get_conn = raise_keyerror
        fake_registry.get_dialect = raise_keyerror
        r = client.get("/api/dataprofile/sources/ds_1/schemas", headers=H)
        assert r.status_code == 404

    def test_schema_cached_on_second_call(self, client, fake_registry):  # F-DS-07 会话内缓存
        fake_registry.conn = FakeConn(rows_for=lambda sql, p: [("db1",), ("mysql",)])
        fake_registry.dialect = "mysql"
        r1 = client.get("/api/dataprofile/sources/ds_1/schemas", headers=H)
        assert r1.json()["data"] == ["db1"]
        # 第二次：换 FakeConn 返回，仍应命中缓存（不重新查库）
        fake_registry.conn = FakeConn(rows_for=lambda sql, p: [("CHANGED",)])
        r2 = client.get("/api/dataprofile/sources/ds_1/schemas", headers=H)
        assert r2.json()["data"] == ["db1"]  # 缓存值，非 CHANGED


# ─── QB：/analyze、/format、/query（API-QB-01/02 + F-QB-11） ──
class TestAnalyze:
    def test_analyze_allowed(self, client, fake_registry):
        r = client.post(
            "/api/dataprofile/analyze",
            json={"sql": "SELECT * FROM t", "dialect": "mysql"},
            headers=H,
        )
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["allowed"] is True
        assert data["statementCount"] == 1

    def test_analyze_blocked(self, client, fake_registry):
        r = client.post(
            "/api/dataprofile/analyze",
            json={"sql": "DELETE FROM t", "dialect": "mysql"},
            headers=H,
        )
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["allowed"] is False
        assert len(data["violations"]) > 0


class TestFormat:
    def test_format_uppercases(self, client, fake_registry):
        r = client.post(
            "/api/dataprofile/format",
            json={"sql": "select id from t", "dialect": "mysql"},
            headers=H,
        )
        assert r.status_code == 200
        assert "SELECT" in r.json()["data"]["sql"]


class TestQuery:
    @staticmethod
    def _conn(rows, total=120):
        def rows_for(sql, params):
            if "COUNT(*)" in sql.upper():
                return [(total,)]
            return rows

        return FakeConn(rows_for=rows_for, description=[("id",), ("name",)])

    def test_success_returns_result(self, client, fake_registry):
        fake_registry.conn = self._conn([(1, "张三"), (2, "李四")])
        fake_registry.dialect = "mysql"
        r = client.post(
            "/api/dataprofile/query",
            json={
                "datasourceId": "ds_1",
                "sql": "SELECT id, name FROM users",
                "page": 1,
                "pageSize": 50,
            },
            headers=H,
        )
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["columns"] == ["id", "name"]
        assert data["rows"] == [[1, "张三"], [2, "李四"]]
        assert data["totalRows"] == 120
        assert "analysis" not in data  # 成功分支无 analysis

    def test_blocked_returns_analysis_without_execution(self, client, fake_registry):
        # DELETE 被静态分析拦截：不借连接，返回 analysis
        called = {"get_conn": False}
        orig = fake_registry.get_conn

        def spy(sid, did):
            called["get_conn"] = True
            return orig(sid, did)

        fake_registry.get_conn = spy
        r = client.post(
            "/api/dataprofile/query",
            json={
                "datasourceId": "ds_1",
                "sql": "DELETE FROM users",
                "page": 1,
                "pageSize": 50,
            },
            headers=H,
        )
        assert r.status_code == 200
        data = r.json()["data"]
        assert "analysis" in data
        assert data["analysis"]["allowed"] is False
        assert called["get_conn"] is False  # 拦截前未借连接

    def test_datasource_not_found_404(self, client, fake_registry):
        def raise_keyerror(sid, did):
            raise KeyError(did)

        fake_registry.get_dialect = raise_keyerror
        r = client.post(
            "/api/dataprofile/query",
            json={"datasourceId": "ds_1", "sql": "SELECT 1", "page": 1, "pageSize": 50},
            headers=H,
        )
        assert r.status_code == 404

    def test_timeout_returns_504(self, client, fake_registry, monkeypatch):
        from app.services import dataprofile_executor as exec_mod

        monkeypatch.setattr(exec_mod, "PROFILE_QUERY_TIMEOUT_SECONDS", 0.05)
        fake_registry.conn = FakeConn(
            rows_for=lambda sql, p: time.sleep(0.2) or [(1,)], description=[("id",)]
        )
        fake_registry.dialect = "mysql"
        r = client.post(
            "/api/dataprofile/query",
            json={
                "datasourceId": "ds_1",
                "sql": "SELECT * FROM big_table",
                "page": 1,
                "pageSize": 50,
            },
            headers=H,
        )
        assert r.status_code == 504


# ─── PG：/explain（API-PG-02） ──────────────────────────
class TestExplain:
    def test_explain_ok(self, client, fake_registry):
        fake_registry.conn = FakeConn(rows_for=lambda sql, p: [])  # EXPLAIN 不抛
        fake_registry.dialect = "mysql"
        r = client.post(
            "/api/dataprofile/explain",
            json={"datasourceId": "ds_1", "sql": "SELECT * FROM users"},
            headers=H,
        )
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["ok"] is True

    def test_explain_failure(self, client, fake_registry):
        def raise_on_explain(sql, p):
            raise RuntimeError("syntax error")
        fake_registry.conn = FakeConn(rows_for=raise_on_explain)
        fake_registry.dialect = "mysql"
        r = client.post(
            "/api/dataprofile/explain",
            json={"datasourceId": "ds_1", "sql": "SELECT BAD"},
            headers=H,
        )
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["ok"] is False
        assert "syntax" in data["error"]

    def test_explain_datasource_not_found(self, client, fake_registry):
        def raise_keyerror(sid, did):
            raise KeyError(did)
        fake_registry.get_dialect = raise_keyerror
        r = client.post(
            "/api/dataprofile/explain",
            json={"datasourceId": "ds_1", "sql": "SELECT 1"},
            headers=H,
        )
        assert r.status_code == 404


# ─── PG：/generate（API-PG-01） ─────────────────────────
class FakeStore:
    def __init__(self, rules):
        self._rules = rules

    def list_rules(self):
        return self._rules


def _gen_body(**over):
    base = dict(
        datasourceId="ds_1", dialect="mysql", sourceType="tables",
        tables=["db1.users"], metricIds=["null_rate"], customRuleIds=[],
        columns={"db1.users": ["email"]}, outputMode="split",
    )
    base.update(over)
    return base


class TestGenerate:
    def test_builtin_split(self, client, fake_registry):
        # 无自定义 -> 不调 LLM；列已给 -> 不反射
        r = client.post("/api/dataprofile/generate", json=_gen_body(), headers=H)
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["refused"] is False
        assert len(data["segments"]) == 1
        assert data["segments"][0]["source"] == "builtin"
        assert data["validation"]["passed"] is True

    def test_custom_with_mocked_llm(self, client, fake_registry, monkeypatch):
        from app.services.dataprofile_models import CustomRule

        rule = CustomRule(
            id="rule_t1", name="r", description="d",
            exampleSql="SELECT COUNT(*) FROM {table} WHERE {column} IS NULL",
            dialect="mysql", needsColumn=True, createdAt=1, updatedAt=1,
        )
        monkeypatch.setattr(dp_router, "store", FakeStore([rule]))
        fake_registry.conn = FakeConn(rows_for=lambda sql, p: [])  # EXPLAIN 成功
        fake_registry.dialect = "mysql"

        def fake_chat(system, user):
            import json as _json
            return _json.dumps({
                "sql": (
                    "SELECT 'db1.users' AS table_name, 'email' AS column_name, "
                    "'r' AS metric, CAST(COUNT(*) AS CHAR) AS value FROM db1.users"
                )
            })
        monkeypatch.setattr(dp_router, "chat_json", fake_chat)

        r = client.post(
            "/api/dataprofile/generate",
            json=_gen_body(metricIds=[], customRuleIds=[rule.id]),
            headers=H,
        )
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["refused"] is False
        assert len(data["segments"]) == 1
        assert data["segments"][0]["source"] == "custom"

    def test_database_source_too_many_tables_422(self, client, fake_registry, monkeypatch):
        from app.services import dataprofile_generate as gen_mod

        monkeypatch.setattr(gen_mod, "PROFILE_MAX_TABLES", 5)

        def rows_for(sql, p):
            if "information_schema.tables" in sql.lower():
                return [(f"t{i}",) for i in range(6)]
            return []
        fake_registry.conn = FakeConn(rows_for=rows_for)
        fake_registry.dialect = "mysql"

        r = client.post(
            "/api/dataprofile/generate",
            json=_gen_body(
                sourceType="database", database="db1", tables=None,
                metricIds=["row_count"], columns=None,
            ),
            headers=H,
        )
        assert r.status_code == 422

    def test_datasource_not_found_404(self, client, fake_registry):
        def raise_keyerror(sid, did):
            raise KeyError(did)
        fake_registry.get_dialect = raise_keyerror
        r = client.post("/api/dataprofile/generate", json=_gen_body(), headers=H)
        assert r.status_code == 404
