"""Function Service — 函数详情与跨方言对照业务逻辑。"""
from app.core.loader import get_data_store, get_dialect_data


def get_function_detail(dialect_id: str, function_id: str) -> dict | None:
    """返回指定方言下某函数的完整详情（含 animation/params）+ 方言摘要。

    不存在返回 None。
    """
    data = get_dialect_data(dialect_id)
    if data is None:
        return None

    fn = next(
        (f for f in data.get("functions", []) if f.get("id") == function_id),
        None,
    )
    if fn is None:
        return None

    return {
        "function": fn,
        "dialect": {
            "id": dialect_id,
            "name": data.get("name", dialect_id),
            "color": data.get("color", ""),
        },
    }


def get_compatible_functions(function_id: str) -> dict | None:
    """跨方言对照（API-05）：按函数名在所有方言中查找同名函数。

    数据中方言间函数 id 不一致（如 mysql.row_number vs hive.row_number_du），
    故以 NAME 为匹配键。返回所有命中方言的签名差异，含调用方所在方言。

    找不到原始函数返回 None。
    """
    store = get_data_store()

    # 先定位原始函数，取其 name（function_id 仅在 mysql 全集，故跨方言搜索）
    source_name: str | None = None
    source_dialect: str | None = None
    for did, data in store.items():
        for f in data.get("functions", []):
            if f.get("id") == function_id:
                source_name = f.get("name")
                source_dialect = did
                break
        if source_name:
            break

    if not source_name:
        return None

    # 跨方言按 name 匹配
    mappings: list[dict] = []
    for did, data in store.items():
        for f in data.get("functions", []):
            if f.get("name") == source_name:
                mappings.append(
                    {
                        "dialect_id": did,
                        "name": f.get("name", ""),
                        "signature": f.get("signature", ""),
                        "note": f.get("compatible_note") or f.get("note") or None,
                    }
                )
                break

    return {
        "function_id": function_id,
        "name": source_name,
        "source_dialect": source_dialect,
        "mappings": mappings,
    }
