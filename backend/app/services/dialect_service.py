"""Dialect Service — 方言查询业务逻辑。"""
from app.core.loader import get_dialect_data, get_data_store


def get_all_dialects() -> list[dict]:
    """返回所有方言的摘要列表。"""
    store = get_data_store()
    result: list[dict] = []
    for dialect_id, data in store.items():
        functions = data.get("functions", [])
        result.append({
            "id": dialect_id,
            "name": data.get("name", dialect_id),
            "version": data.get("version", ""),
            "description": data.get("description", ""),
            "homepage": data.get("homepage", ""),
            "color": data.get("color", ""),
            "icon": data.get("icon", ""),
            "function_count": len(functions),
        })
    return result


def get_dialect_by_id(dialect_id: str) -> dict | None:
    """返回方言详情：分类树（按 order 排序）+ 函数列表（剔除 animation/params）。

    不存在返回 None。
    """
    data = get_dialect_data(dialect_id)
    if data is None:
        return None

    # 分类按 order 排序
    categories = sorted(
        data.get("categories", []),
        key=lambda c: c.get("order", 0),
    )
    categories_out = [
        {"id": c.get("id", ""), "name": c.get("name", ""), "order": c.get("order", 0)}
        for c in categories
    ]

    # 函数列表剔除 animation 与 params（列表页轻量字段，对齐 PRD DialectDetailResponse）
    functions_out = []
    for f in data.get("functions", []):
        functions_out.append({
            "id": f.get("id", ""),
            "name": f.get("name", ""),
            "category_id": f.get("category_id", ""),
            "signature": f.get("signature", ""),
            "description": f.get("description", ""),
            "return_type": f.get("return_type", ""),
        })

    return {
        "id": dialect_id,
        "name": data.get("name", dialect_id),
        "version": data.get("version", ""),
        "description": data.get("description", ""),
        "homepage": data.get("homepage", ""),
        "color": data.get("color", ""),
        "icon": data.get("icon", ""),
        "categories": categories_out,
        "functions": functions_out,
    }
