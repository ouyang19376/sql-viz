"""方言路由测试。"""
from fastapi.testclient import TestClient

from app.main import app


def test_list_dialects_returns_seven():
    with TestClient(app) as client:
        resp = client.get("/api/dialects")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        dialects = body["data"]["dialects"]
        assert len(dialects) == 7


def test_dialect_summary_has_color_and_function_count():
    with TestClient(app) as client:
        body = client.get("/api/dialects").json()
        mysql = next(d for d in body["data"]["dialects"] if d["id"] == "mysql")
        assert mysql["color"] == "#00758F"
        assert mysql["version"] == "8.0"
        # function_count 应与详情接口返回的函数数一致（数据模型不变量，避免硬编码计数随数据增长失效）
        detail = client.get("/api/dialects/mysql").json()
        assert mysql["function_count"] == len(detail["data"]["dialect"]["functions"])


def test_dialect_detail_categories_sorted_by_order():
    with TestClient(app) as client:
        body = client.get("/api/dialects/mysql").json()
        assert body["code"] == 0
        dialect = body["data"]["dialect"]
        orders = [c["order"] for c in dialect["categories"]]
        assert orders == sorted(orders)
        assert len(dialect["categories"]) > 0


def test_dialect_detail_functions_exclude_animation_and_params():
    with TestClient(app) as client:
        body = client.get("/api/dialects/mysql").json()
        for f in body["data"]["dialect"]["functions"]:
            assert "animation" not in f
            assert "params" not in f
            assert "signature" in f


def test_unknown_dialect_returns_code_404():
    with TestClient(app) as client:
        resp = client.get("/api/dialects/nonexistent")
        assert resp.status_code == 200  # HTTP 200，错误走业务码
        body = resp.json()
        assert body["code"] == 404
        assert body["data"] is None
        # 404 不缓存
        assert "etag" not in {k.lower() for k in resp.headers.keys()}


def test_dialects_list_sets_etag_and_cache_control():
    with TestClient(app) as client:
        resp = client.get("/api/dialects")
        assert resp.status_code == 200
        etag = resp.headers.get("etag")
        assert etag and etag.startswith('W/"')
        cache_control = resp.headers.get("cache-control", "")
        assert "max-age=" in cache_control


def test_dialects_list_returns_304_on_matching_if_none_match():
    with TestClient(app) as client:
        first = client.get("/api/dialects")
        etag = first.headers["etag"]
        second = client.get("/api/dialects", headers={"If-None-Match": etag})
        assert second.status_code == 304
        assert second.headers.get("etag") == etag
        assert second.content == b""  # 304 必须空 body
