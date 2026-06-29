"""BI 数据集服务 — F-DS-04/05/07（PRD-bi §5.4）。

落盘结构：BI_DATA_DIR/{id}/meta.json + data.parquet（或 data.pkl 兜底）。
存储格式集中在 read_df/write_df 一处：装有 pyarrow 用 parquet（列式、聚合只读所需列），
否则回退 pickle（无额外依赖，PRD 决策点 6）。明细预览 / 聚合模块复用 read_df。
"""
from __future__ import annotations

import json
import math
import shutil
import uuid
from datetime import datetime

import numpy as np
import pandas as pd

from app.core.config import BI_DATA_DIR
from app.services.bi_models import ColumnSchema, DatasetMeta, FilterClause, MetricSpec, SortClause

# pyarrow 可用则 parquet，否则 pickle（格式探测集中此处）
try:
    import pyarrow  # noqa: F401

    _DATA_FILENAME = "data.parquet"
    _USE_PARQUET = True
except ImportError:
    _DATA_FILENAME = "data.pkl"
    _USE_PARQUET = False

_META_FILENAME = "meta.json"


# ─── 路径与存储原语 ───────────────────────────────────────────────
def _dataset_dir(dataset_id: str):
    return BI_DATA_DIR / dataset_id


def write_df(df: pd.DataFrame, dataset_id: str) -> int:
    """写入全量数据，返回落盘文件字节数。"""
    path = _dataset_dir(dataset_id) / _DATA_FILENAME
    if _USE_PARQUET:
        df.to_parquet(path, index=False)
    else:
        df.to_pickle(path)
    return path.stat().st_size


def read_df(dataset_id: str, columns: list[str] | None = None) -> pd.DataFrame:
    """读取全量数据。parquet 支持列裁剪（columns=）；pickle 读后再裁剪。"""
    d = _dataset_dir(dataset_id)
    parquet_path = d / "data.parquet"
    pickle_path = d / "data.pkl"
    if parquet_path.exists():
        return pd.read_parquet(parquet_path, columns=columns)
    if pickle_path.exists():
        df = pd.read_pickle(pickle_path)
        return df[columns] if columns else df
    raise FileNotFoundError(f"数据集 {dataset_id} 数据文件缺失")


# ─── 数据集 CRUD ─────────────────────────────────────────────────
def create_dataset(
    name: str, source_filename: str, columns: list[ColumnSchema], df: pd.DataFrame
) -> DatasetMeta:
    """F-DS-04：分配 id、落盘 data + meta，返回元信息。"""
    dataset_id = "ds_" + uuid.uuid4().hex[:6]
    _dataset_dir(dataset_id).mkdir(parents=True, exist_ok=True)

    size_bytes = write_df(df, dataset_id)
    meta = DatasetMeta(
        id=dataset_id,
        name=name,
        sourceFilename=source_filename,
        rowCount=int(df.shape[0]),
        columns=columns,
        createdAt=datetime.now().isoformat(timespec="seconds"),
        sizeBytes=size_bytes,
    )
    _write_meta(meta)
    return meta


def list_datasets() -> list[DatasetMeta]:
    """F-DS-05：扫描目录返回所有数据集元信息，按创建时间倒序。"""
    if not BI_DATA_DIR.exists():
        return []
    metas: list[DatasetMeta] = []
    for child in BI_DATA_DIR.iterdir():
        if not child.is_dir():
            continue
        meta = _read_meta(child.name)
        if meta is not None:
            metas.append(meta)
    metas.sort(key=lambda m: m.createdAt, reverse=True)
    return metas


def dataset_exists(dataset_id: str) -> bool:
    return (_dataset_dir(dataset_id) / _META_FILENAME).exists()


def delete_dataset(dataset_id: str) -> bool:
    """F-DS-07：删除整个数据集目录。返回是否实际删除。"""
    d = _dataset_dir(dataset_id)
    if not d.exists():
        return False
    shutil.rmtree(d)
    return True


# ─── 明细预览（F-PV-01/02/03，API-BI-04） ─────────────────────────
def preview(
    dataset_id: str,
    page: int,
    page_size: int,
    filters: list[FilterClause],
    sort: SortClause | None = None,
) -> tuple[list[str], list[list], int]:
    """读全量 → 应用筛选 → 排序 → 切片分页，返回 (列名, 行, 筛选后总行数)。

    仅对当前页切片做 JSON 化转换，避免全量转换开销（PRD 难点 6）。
    排序在切片前对全量生效，翻页时顺序保持一致。
    """
    df = read_df(dataset_id)
    df = apply_filters(df, filters)
    if sort and sort.field in df.columns:
        df = df.sort_values(
            sort.field, ascending=sort.order == "asc", na_position="last"
        )
    total = int(df.shape[0])
    start = (page - 1) * page_size
    page_df = df.iloc[start : start + page_size]
    columns = [str(c) for c in df.columns]
    return columns, _df_to_rows(page_df), total


# ─── 聚合（F-VZ / API-BI-05） ────────────────────────────────────
# groupBy 为空 → 全量聚合（总览卡片）；非空 → 分组聚合（主图表）。
# NaN 处理（PRD 决策点 8）：sum/avg/max/min 跳过 NaN（pandas 默认 skipna），
# count 计非空，count_distinct 去重非空；全空分组 sum → None（min_count=1）。
_GROUP_AGG = {
    "sum": lambda s: s.sum(min_count=1),
    "avg": "mean",
    "count": "count",
    "count_distinct": "nunique",
    "max": "max",
    "min": "min",
}
# 数值型聚合先 to_numeric 强转，避免字符串列误算；count/count_distinct 用原始列
_NUMERIC_AGGS = {"sum", "avg", "max", "min"}


def _metric_series(df: pd.DataFrame, spec: MetricSpec) -> pd.Series:
    """取指标字段列；数值型聚合强转 numeric（非数转 NaN）。缺失列 → 全 NaN。"""
    if spec.field not in df.columns:
        return pd.Series([np.nan] * len(df), index=df.index)
    col = df[spec.field]
    if spec.agg in _NUMERIC_AGGS:
        return pd.to_numeric(col, errors="coerce")
    return col


def _scalar_agg(series: pd.Series, agg: str):
    """全量聚合（groupBy 为空）：对整列求单一聚合值。"""
    func = _GROUP_AGG[agg]
    return func(series) if callable(func) else getattr(series, func)()


def aggregate(
    dataset_id: str,
    group_by: list[str],
    metrics: list[MetricSpec],
    filters: list[FilterClause],
    sort: SortClause | None = None,
) -> tuple[list[str], list[list]]:
    """读全量 → 应用筛选 → groupBy().agg(metrics) → 排序，返回 (列名, 行)。

    列顺序 = group_by + 各 metric.alias。groupBy 为空时返回单行总览值（忽略排序）。
    未知 groupBy 列跳过（兜底稳健，PRD 难点 9）。排序字段不在结果列时跳过。
    """
    df = read_df(dataset_id)
    df = apply_filters(df, filters)

    group_by = [c for c in group_by if c in df.columns]
    columns = [*group_by, *[m.alias for m in metrics]]

    if not group_by:
        values = [_scalar_agg(_metric_series(df, m), m.agg) for m in metrics]
        return columns, [[_to_cell(v) for v in values]]

    keys = [df[c] for c in group_by]
    series_list: list[pd.Series] = []
    for m in metrics:
        grouped = _metric_series(df, m).groupby(keys, dropna=False, sort=True)
        series_list.append(grouped.agg(_GROUP_AGG[m.agg]))
    agg_df = pd.concat(series_list, axis=1)
    agg_df.columns = [m.alias for m in metrics]
    agg_df = agg_df.reset_index()
    # 排序（按维度名或指标别名），影响图表呈现顺序（如柱状按值降序）
    if sort and sort.field in agg_df.columns:
        agg_df = agg_df.sort_values(
            sort.field, ascending=sort.order == "asc", na_position="last"
        )
    return columns, _df_to_rows(agg_df)


def apply_filters(df: pd.DataFrame, filters: list[FilterClause]) -> pd.DataFrame:
    """逐条应用筛选。未知列或类型不符的 filter 跳过而非报错（PRD 难点 9 兜底）。"""
    for f in filters:
        if f.field not in df.columns:
            continue
        try:
            mask = _build_mask(df[f.field], f.op, f.value)
        except Exception:  # noqa: BLE001 — 类型不符等异常跳过该 filter
            continue
        if mask is not None:
            df = df[mask]
    return df


def _build_mask(col: pd.Series, op: str, value) -> pd.Series | None:
    """按算子构造布尔掩码。数值范围走 to_numeric，等值/包含/in 走字符串化兼容。"""
    if op in ("gt", "gte", "lt", "lte"):
        num = pd.to_numeric(col, errors="coerce")
        v = float(value)  # type: ignore[arg-type]
        if op == "gt":
            return num > v
        if op == "gte":
            return num >= v
        if op == "lt":
            return num < v
        return num <= v
    if op == "contains":
        return col.astype(str).str.contains(str(value), case=False, na=False, regex=False)
    if op == "in":
        values = value if isinstance(value, list) else [value]
        targets = {str(v) for v in values}
        return col.astype(str).isin(targets)
    if op in ("eq", "neq"):
        # 数值列且值为数值 → 数值比较；否则字符串化比较（兼容 ID 维度等混合来源）
        if pd.api.types.is_numeric_dtype(col) and isinstance(value, (int, float)) and not isinstance(
            value, bool
        ):
            mask = col == value
        else:
            mask = col.astype(str) == str(value)
        return ~mask if op == "neq" else mask
    return None


def _df_to_rows(df: pd.DataFrame) -> list[list]:
    """DataFrame → 嵌套列表，转 JSON 安全标量：NaN→None、numpy→python、日期→字符串。"""
    out = df.copy()
    for col in out.columns:
        if pd.api.types.is_datetime64_any_dtype(out[col]):
            out[col] = out[col].dt.strftime("%Y-%m-%d %H:%M:%S")
    return [[_to_cell(v) for v in record] for record in out.itertuples(index=False, name=None)]


def _to_cell(v):
    """单元格值 → JSON 安全标量。"""
    if isinstance(v, np.generic):
        v = v.item()
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    return v


# ─── meta.json 读写 ──────────────────────────────────────────────
def _write_meta(meta: DatasetMeta) -> None:
    path = _dataset_dir(meta.id) / _META_FILENAME
    path.write_text(meta.model_dump_json(indent=2), encoding="utf-8")


def _read_meta(dataset_id: str) -> DatasetMeta | None:
    path = _dataset_dir(dataset_id) / _META_FILENAME
    if not path.exists():
        return None
    try:
        return DatasetMeta.model_validate_json(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, ValueError):
        return None  # 损坏的 meta 跳过，不阻塞列表
