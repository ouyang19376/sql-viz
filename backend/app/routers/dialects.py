"""方言路由 — API-01 方言列表、API-02 方言详情。"""
from fastapi import APIRouter, Request, Response

from app.core.cache import apply_cache_headers
from app.core.response import fail, ok
from app.services.dialect_service import get_all_dialects, get_dialect_by_id

router = APIRouter(prefix="/api", tags=["dialects"])


@router.get("/dialects")
def list_dialects(request: Request, response: Response):
    """API-01: 返回 7 种方言的摘要列表。"""
    body = ok({"dialects": get_all_dialects()})
    cached = apply_cache_headers(request, response, body)
    return cached if cached is not None else body


@router.get("/dialects/{dialect_id}")
def get_dialect(dialect_id: str, request: Request, response: Response):
    """API-02: 返回指定方言的详情（分类树 + 函数列表，不含 animation）。"""
    dialect = get_dialect_by_id(dialect_id)
    if dialect is None:
        # 404 不缓存
        return fail(404, "dialect not found")
    body = ok({"dialect": dialect})
    cached = apply_cache_headers(request, response, body)
    return cached if cached is not None else body
