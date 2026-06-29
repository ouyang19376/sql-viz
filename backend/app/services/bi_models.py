"""BI 报表 Pydantic 模型 — DS / PV / VZ 模块（PRD-bi §5.3）。

含数据源管理（F-DS-01~07）的 ColumnSchema / DatasetMeta，
明细预览（F-PV / API-BI-04）的 FilterClause / PreviewRequest，
及聚合（F-VZ / API-BI-05）的 MetricSpec / AggregateRequest。
"""
from typing import Literal, Union

from pydantic import BaseModel, ConfigDict, Field

InferredType = Literal["string", "number", "date", "boolean"]
FieldRole = Literal["dimension", "measure"]
AggFunc = Literal["sum", "avg", "count", "count_distinct", "max", "min"]
FilterOp = Literal["eq", "neq", "in", "gt", "gte", "lt", "lte", "contains"]


class ColumnSchema(BaseModel):
    """单列结构：拍平后的列名 + 推断类型 + 维度/指标角色。"""

    model_config = ConfigDict(extra="forbid")

    name: str
    type: InferredType
    role: FieldRole


class DatasetMeta(BaseModel):
    """数据集元信息，落盘为 {id}/meta.json，列表接口直接回显。"""

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    sourceFilename: str
    rowCount: int
    columns: list[ColumnSchema]
    createdAt: str  # ISO 时间
    sizeBytes: int


class FilterClause(BaseModel):
    """单条筛选：字段 + 算子 + 值。维度用 eq/neq/in/contains，数值用范围算子。

    value 联合类型对齐前端：等值/包含为标量，in 为字符串列表（PRD §5.2）。
    """

    model_config = ConfigDict(extra="forbid")

    field: str
    op: FilterOp
    value: Union[str, float, list[str]]


class SortClause(BaseModel):
    """单列排序（明细预览 + 大屏聚合共用）：字段 + 方向。无效字段由服务层跳过。"""

    model_config = ConfigDict(extra="forbid")

    field: str
    order: Literal["asc", "desc"]


class PreviewRequest(BaseModel):
    """明细预览请求（API-BI-04）：后端分页 + 筛选。"""

    model_config = ConfigDict(extra="forbid")

    page: int = Field(default=1, ge=1)
    pageSize: int = Field(default=50, ge=1, le=200)
    filters: list[FilterClause] = Field(default_factory=list, max_length=20)
    sort: SortClause | None = None


class MetricSpec(BaseModel):
    """单个聚合指标（API-BI-05）：字段 + 聚合函数 + 展示别名。"""

    model_config = ConfigDict(extra="forbid")

    field: str
    agg: AggFunc
    alias: str = Field(max_length=64)


class AggregateRequest(BaseModel):
    """聚合请求（API-BI-05）：groupBy + metrics + filters。

    groupBy 为空 → 全量聚合（总览卡片）；非空 → 分组聚合（主图表）。
    """

    model_config = ConfigDict(extra="forbid")

    groupBy: list[str] = Field(default_factory=list, max_length=8)
    metrics: list[MetricSpec] = Field(min_length=1, max_length=20)
    filters: list[FilterClause] = Field(default_factory=list, max_length=20)
    sort: SortClause | None = None
