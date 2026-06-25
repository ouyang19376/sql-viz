"""搜索路由测试 — API-04（F-BK-04）。"""
from fastapi.testclient import TestClient

from app.main import app


def test_search_by_name_returns_results():
    """关键词命中函数名（如 count），应返回多方言结果。"""
    with TestClient(app) as client:
        body = client.get("/api/search?q=count").json()
    assert body["code"] == 0
    data = body["data"]
    assert data["total"] >= 1
    # 至少包含 mysql 的 COUNT
    dialect_ids = {r["dialect"]["id"] for r in data["results"]}
    assert "mysql" in dialect_ids
    fn_names = {r["function"]["name"].lower() for r in data["results"]}
    assert "count" in fn_names
    # 每条结果均带 category_id 与 match_field
    for r in data["results"]:
        assert "category_id" in r
        assert r["match_field"] in ("name", "signature", "description")


def test_search_with_dialect_filter():
    """传 dialect_id 应只返回该方言结果。"""
    with TestClient(app) as client:
        body = client.get("/api/search?q=count&dialect_id=mysql").json()
    assert body["code"] == 0
    results = body["data"]["results"]
    assert len(results) >= 1
    assert all(r["dialect"]["id"] == "mysql" for r in results)


def test_search_empty_query_returns_empty():
    """空 q 不报错，直接返回 results=[]、total=0。"""
    with TestClient(app) as client:
        body = client.get("/api/search?q=").json()
    assert body["code"] == 0
    assert body["data"]["results"] == []
    assert body["data"]["total"] == 0


def test_search_no_match_returns_empty():
    """无命中关键词返回空列表。"""
    with TestClient(app) as client:
        body = client.get("/api/search?q=zzznotreal").json()
    assert body["code"] == 0
    assert body["data"]["results"] == []
    assert body["data"]["total"] == 0
