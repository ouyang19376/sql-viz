"""函数路由测试 — API-03 函数详情、API-05 跨方言对照。"""
from fastapi.testclient import TestClient

from app.main import app


def test_function_detail_includes_animation_and_params():
    with TestClient(app) as client:
        body = client.get("/api/dialects/mysql/functions/count").json()
        assert body["code"] == 0
        fn = body["data"]["function"]
        assert fn["id"] == "count"
        assert "animation" in fn
        assert "params" in fn
        assert len(fn["params"]) > 0
        dialect = body["data"]["dialect"]
        assert dialect["id"] == "mysql"
        assert dialect["color"] == "#00758F"


def test_function_detail_unknown_returns_404():
    with TestClient(app) as client:
        body = client.get("/api/dialects/mysql/functions/nonexistent").json()
        assert body["code"] == 404
        assert body["data"] is None


def test_compatible_returns_same_name_mappings():
    """row_number 在 mysql 与 hive 同名，应返回两条映射。"""
    with TestClient(app) as client:
        body = client.get("/api/functions/row_number/compatible").json()
        assert body["code"] == 0
        data = body["data"]
        assert data["name"] == "ROW_NUMBER"
        dialect_ids = [m["dialect_id"] for m in data["mappings"]]
        assert "mysql" in dialect_ids
        assert "hive" in dialect_ids


def test_compatible_unknown_function_returns_404():
    with TestClient(app) as client:
        body = client.get("/api/functions/no_such_func/compatible").json()
        assert body["code"] == 404
