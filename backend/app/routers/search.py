"""搜索路由 — API-04 函数搜索（F-BK-04）。"""
from fastapi import APIRouter

from app.core.response import ok
from app.services.search_service import search_functions

router = APIRouter(prefix="/api", tags=["search"])


@router.get("/search")
def search(q: str = "", dialect_id: str | None = None) -> dict:
    """API-04: 按关键词搜索函数。

    Query Params:
        q: 关键词（必填，空字符串返回空结果）
        dialect_id: 可选，限定方言范围
    """
    results = search_functions(q, dialect_id)
    return ok({"results": results, "total": len(results)})
