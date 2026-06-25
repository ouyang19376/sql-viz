"""函数路由 — API-03 函数详情、API-05 跨方言对照。"""
from fastapi import APIRouter

from app.core.response import fail, ok
from app.services.function_service import (
    get_compatible_functions,
    get_function_detail,
)

router = APIRouter(tags=["functions"])


@router.get("/api/dialects/{dialect_id}/functions/{function_id}")
def get_function(dialect_id: str, function_id: str) -> dict:
    """API-03: 返回指定函数的完整数据（含 animation 字段）+ 方言摘要。"""
    detail = get_function_detail(dialect_id, function_id)
    if detail is None:
        return fail(404, "function not found")
    return ok(detail)


@router.get("/api/functions/{function_id}/compatible")
def get_compatible(function_id: str) -> dict:
    """API-05: 返回某函数在其他方言中的对应函数名和签名差异。"""
    result = get_compatible_functions(function_id)
    if result is None:
        return fail(404, "function not found")
    return ok(result)
