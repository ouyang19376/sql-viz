"""Search Service — 函数搜索业务逻辑（API-04 / F-BK-04）。

数据规模 < 500 条，启动时已加载到内存，子串匹配性能足够（< 5ms）。
匹配字段优先级：name > signature > description。
"""
from app.core.loader import get_data_store

# 匹配优先级：数字越小越靠前
_MATCH_PRIORITY = {"name": 0, "signature": 1, "description": 2}

# 单次返回上限（搜索框不需要更多）
_RESULT_LIMIT = 50


def _match_field(fn: dict, q_lower: str) -> str | None:
    """返回首个命中字段名，未命中返回 None。"""
    if q_lower in fn.get("name", "").lower():
        return "name"
    if q_lower in fn.get("signature", "").lower():
        return "signature"
    if q_lower in fn.get("description", "").lower():
        return "description"
    return None


def search_functions(q: str, dialect_id: str | None = None) -> list[dict]:
    """按关键词在函数名/签名/描述中模糊匹配。

    Args:
        q: 搜索关键词（不区分大小写）。空字符串返回 [].
        dialect_id: 可选，限定方言范围。None 表示全方言搜索。

    Returns:
        命中项列表（不超过 50 条），每项包含 function/dialect/category_id/match_field。
        排序：按 match_field 优先级 + 函数名字典序。
    """
    q_norm = (q or "").strip().lower()
    if not q_norm:
        return []

    store = get_data_store()
    if dialect_id is not None:
        if dialect_id not in store:
            return []
        items = [(dialect_id, store[dialect_id])]
    else:
        items = list(store.items())

    results: list[dict] = []
    for did, data in items:
        for fn in data.get("functions", []):
            field = _match_field(fn, q_norm)
            if field is None:
                continue
            results.append(
                {
                    "function": {
                        "id": fn.get("id", ""),
                        "name": fn.get("name", ""),
                        "signature": fn.get("signature", ""),
                        "description": fn.get("description", ""),
                    },
                    "dialect": {
                        "id": did,
                        "name": data.get("name", did),
                        "color": data.get("color", ""),
                    },
                    "category_id": fn.get("category_id", ""),
                    "match_field": field,
                }
            )

    results.sort(
        key=lambda r: (
            _MATCH_PRIORITY[r["match_field"]],
            r["function"]["name"].lower(),
            r["dialect"]["id"],
        )
    )
    return results[:_RESULT_LIMIT]
