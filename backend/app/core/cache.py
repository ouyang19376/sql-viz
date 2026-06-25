"""HTTP 缓存助手 — ETag + Cache-Control。

方言数据启动时加载到内存、运行期不变，相同 payload 始终产出相同 ETag，
浏览器/前端可凭 If-None-Match 命中 304 跳过重传。
"""
import hashlib
import json
from typing import Any

from fastapi import Request, Response

# 与前端 TanStack Query staleTime（10min，见 tech-plan.md §5.3）保持一致
DEFAULT_MAX_AGE = 600


def compute_etag(payload: Any) -> str:
    """基于序列化后的 payload 计算弱 ETag。"""
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return 'W/"' + hashlib.md5(raw).hexdigest() + '"'


def apply_cache_headers(
    request: Request,
    response: Response,
    payload: Any,
    max_age: int = DEFAULT_MAX_AGE,
) -> Response | None:
    """写入 ETag/Cache-Control，并在 If-None-Match 命中时返回 304 Response。

    Returns:
        命中时返回 304 Response（调用方应直接 return）；未命中返回 None，
        响应头已写入 response，调用方继续返回业务 body。
    """
    etag = compute_etag(payload)
    cache_control = f"public, max-age={max_age}"

    if request.headers.get("if-none-match") == etag:
        return Response(
            status_code=304,
            headers={"ETag": etag, "Cache-Control": cache_control},
        )

    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = cache_control
    return None
