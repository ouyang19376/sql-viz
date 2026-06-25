"""统一响应包装。"""
from typing import Any, Optional

from pydantic import BaseModel


class ApiResponse(BaseModel):
    code: int
    message: str
    data: Optional[Any] = None


def ok(data: Any, message: str = "ok") -> dict:
    return {"code": 0, "message": message, "data": data}


def fail(code: int, message: str, data: Any = None) -> dict:
    return {"code": code, "message": message, "data": data}
