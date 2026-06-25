"""JSON 数据加载器 — 启动时把方言文件加载到内存。"""
import json
import logging
from typing import Any

from app.core.config import DATA_DIR

logger = logging.getLogger(__name__)

# 内存数据存储：dialect_id -> 原始 JSON 对象（已解包 dialect 包装层）
_data_store: dict[str, dict[str, Any]] = {}


def load_all_data() -> None:
    """启动时加载 data/sql 下所有方言 JSON 到内存。"""
    global _data_store
    _data_store.clear()

    if not DATA_DIR.exists():
        logger.warning("数据目录不存在: %s", DATA_DIR)
        return

    for filepath in DATA_DIR.glob("*.json"):
        dialect_id = filepath.stem
        try:
            with open(filepath, encoding="utf-8") as f:
                raw = json.load(f)
            # 标准数据格式含 "dialect" 包装层
            data = raw.get("dialect", raw) if isinstance(raw, dict) else raw
            _data_store[dialect_id] = data
            logger.info("已加载方言: %s", dialect_id)
        except (json.JSONDecodeError, OSError) as e:
            logger.error("加载失败 %s: %s", filepath, e)


def get_data_store() -> dict[str, dict[str, Any]]:
    """返回内存数据存储。"""
    return _data_store


def get_dialect_data(dialect_id: str) -> dict[str, Any] | None:
    """返回某方言原始数据，不存在返回 None。"""
    return _data_store.get(dialect_id)
