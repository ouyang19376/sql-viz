"""SQL 血缘分析 Pydantic 模型 — 请求 / 响应 / 内部 LLM 输出 Schema。"""
from __future__ import annotations

from typing import Literal, Union

from pydantic import BaseModel, ConfigDict, Field, confloat, constr

from app.core.config import LINEAGE_SQL_MAX_CHARS

SqlDialect = Literal["auto", "hive", "sparksql", "mysql", "postgresql", "generic"]
TableType = Literal["entity", "temporary", "unknown"]
DependencyKind = Literal["read", "write", "cte", "join", "union", "subquery", "unknown"]


class LineageAnalyzeRequest(BaseModel):
    """血缘分析请求（F-LN-06 / F-BK-04）。"""

    model_config = ConfigDict(extra="forbid")

    sql: constr(min_length=1, max_length=LINEAGE_SQL_MAX_CHARS)
    dialect: SqlDialect = "auto"


class LineageTableNode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: constr(min_length=1)
    name: constr(min_length=1)
    type: TableType = "entity"
    database: str | None = None
    schema: str | None = None
    alias: str | None = None
    statementIndexes: list[int] = Field(default_factory=list)


class LineageDependency(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: constr(min_length=1)
    source: constr(min_length=1)
    target: constr(min_length=1)
    kind: DependencyKind = "unknown"
    statementIndex: int | None = None
    lineStart: int | None = None
    lineEnd: int | None = None
    description: str | None = None
    confidence: confloat(ge=0, le=1) | None = None


class LineageAnalysisResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str
    dialect: SqlDialect
    tables: list[LineageTableNode]
    dependencies: list[LineageDependency]
    warnings: list[str] = Field(default_factory=list)


class LineageAnalyzeSuccess(BaseModel):
    refused: Literal[False] = False
    result: LineageAnalysisResult


class LineageAnalyzeRefused(BaseModel):
    refused: Literal[True] = True
    message: str


LineageAnalyzeResponse = Union[LineageAnalyzeSuccess, LineageAnalyzeRefused]


class LineageNeo4jPushRequest(BaseModel):
    """Neo4j 推送请求（F-EX-07）：只接收结构化结果，不接收前端 Cypher。"""

    model_config = ConfigDict(extra="forbid")

    result: LineageAnalysisResult


class LineageNeo4jPushResult(BaseModel):
    tables: int
    dependencies: int
    database: str | None = None


REFUSAL_MESSAGE = "输入内容不是有效的 SQL 脚本，请粘贴 SQL 语句后重试"


def fallback_refused(message: str = REFUSAL_MESSAGE) -> LineageAnalyzeRefused:
    return LineageAnalyzeRefused(refused=True, message=message)
