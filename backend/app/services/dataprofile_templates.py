"""数据探查 - 内置指标模板渲染（PRD-dataprofile F-PG-05）。

按方言把内置指标渲染为归一化形状 SQL（零 LLM）：

    SELECT '<table>' AS table_name,
           '<column>' AS column_name,
           '<metric>'  AS metric,
           CAST(<value_expr> AS <方言字符串>) AS value
    FROM <table> [GROUP BY <column> [ORDER BY ... LIMIT N]]

归一化形状契约（plan §6 难点 5）：value 始终 CAST 为方言字符串类型
（mysql CHAR / postgresql TEXT / hive STRING），使任意段组合的 UNION ALL
在三种方言均类型一致、可 EXPLAIN 通过；同时给 LLM 一个可强制契约。

复合/多行指标：min_max/numeric_stats 单行 CONCAT；value_distribution/topn_frequency
多行（每桶一行，value=CONCAT(bucket,'=',count)），metric 列保持为指标 id。
"""
from __future__ import annotations

import re

from app.core.config import PROFILE_GENERATE_TOPN
from app.services.dataprofile_models import ProfileDialect

# 标识符白名单（支持 schema.table 两段；防注入）
_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$")

# 方言字符串类型（归一化 value 的统一类型）
_STRING_TYPE: dict[str, str] = {
    "mysql": "CHAR",
    "postgresql": "TEXT",
    "hive": "STRING",
}

# 方言正则算子（regex_match，F-PG-05 needsParam）
_REGEX_OP: dict[str, str] = {
    "mysql": "REGEXP",
    "postgresql": "~",
    "hive": "RLIKE",
}


class TemplateRenderError(ValueError):
    """模板渲染失败（非法标识符 / 缺参数），承载原因。"""


def validate_ident(name: str, kind: str = "标识符") -> None:
    """表/列标识符白名单校验（防注入）。非法抛 TemplateRenderError。"""
    if not name or not _IDENT_RE.match(name):
        raise TemplateRenderError(f"非法{kind}：{name!r}")


def parse_table(s: str) -> tuple[str | None, str]:
    """拆分 schema.table -> (schema, name)。无点返回 (None, s)。调用前应已 validate_ident。"""
    if "." in s:
        schema, name = s.split(".", 1)
        return schema, name
    return None, s


def _cast(expr: str, dialect: ProfileDialect) -> str:
    """把表达式 CAST 为方言字符串类型。"""
    return f"CAST({expr} AS {_STRING_TYPE[dialect]})"


def _escape_sql_string(s: str) -> str:
    """SQL 字符串字面量转义：单引号翻倍（防 regex 参数注入）。"""
    return s.replace("'", "''")


def render_builtin(
    metric_id: str,
    dialect: ProfileDialect,
    table: str,
    column: str | None = None,
    param: str | None = None,
) -> str:
    """渲染内置指标为归一化 SQL（F-PG-05）。

    table/column 为已校验的标识符；param 仅 regex_match 用（正则）。
    needsColumn 指标要求 column 非空；regex_match 要求 param 非空。
    """
    validate_ident(table, "表名")
    if column:
        validate_ident(column, "列名")
    elif metric_id != "row_count":
        # 除 row_count 外均 needsColumn（与目录元数据一致），缺列直接拒
        raise TemplateRenderError(f"指标 {metric_id} 需要指定列")

    cast = _STRING_TYPE[dialect]
    # 公共投影：四列归一化形状
    def proj(value_expr: str, *, metric: str = metric_id) -> str:
        col_literal = column if column else ""
        return (
            f"SELECT '{table}' AS table_name, "
            f"'{col_literal}' AS column_name, "
            f"'{metric}' AS metric, "
            f"CAST({value_expr} AS {cast}) AS value"
        )

    if metric_id == "row_count":  # 无列
        return f"{proj('COUNT(*)')} FROM {table}"

    if metric_id == "null_rate":
        expr = "ROUND(AVG(CASE WHEN {c} IS NULL THEN 100.0 ELSE 0.0 END), 2)".format(c=column)
        return f"{proj(expr)} FROM {table}"

    if metric_id == "distinct_count":
        return f"{proj(f'COUNT(DISTINCT {column})')} FROM {table}"

    if metric_id == "duplicate_count":
        expr = f"COUNT({column}) - COUNT(DISTINCT {column})"
        return f"{proj(expr)} FROM {table}"

    if metric_id == "value_distribution":
        expr = f"CONCAT(COALESCE({column}, '(NULL)'), '=', COUNT(*))"
        return f"{proj(expr)} FROM {table} GROUP BY {column}"

    if metric_id == "min_max":
        expr = f"CONCAT('min=', MIN({column}), ',max=', MAX({column}))"
        return f"{proj(expr)} FROM {table}"

    if metric_id == "numeric_stats":
        expr = (
            f"CONCAT('min=', MIN({column}), ',max=', MAX({column}), "
            f"',avg=', ROUND(AVG({column}), 2))"
        )
        return f"{proj(expr)} FROM {table}"

    if metric_id == "type_consistency":
        expr = f"COUNT(CASE WHEN {column} IS NOT NULL AND {column} <> TRIM({column}) THEN 1 END)"
        return f"{proj(expr)} FROM {table}"

    if metric_id == "regex_match":
        if not param:
            raise TemplateRenderError("regex_match 需要正则参数（metricParams）")
        op = _REGEX_OP[dialect]
        pat = _escape_sql_string(param)
        expr = f"ROUND(AVG(CASE WHEN {column} {op} '{pat}' THEN 100.0 ELSE 0.0 END), 2)"
        return f"{proj(expr)} FROM {table}"

    if metric_id == "topn_frequency":
        expr = f"CONCAT(COALESCE({column}, '(NULL)'), '=', COUNT(*))"
        return (
            f"{proj(expr)} FROM {table} "
            f"GROUP BY {column} ORDER BY COUNT(*) DESC LIMIT {PROFILE_GENERATE_TOPN}"
        )

    raise TemplateRenderError(f"未知内置指标：{metric_id}")


def string_type(dialect: ProfileDialect) -> str:
    """暴露方言字符串类型名（LLM 提示词与自定义段对齐用）。"""
    return _STRING_TYPE[dialect]
