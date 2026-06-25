"""SQL 血缘基础 Parser（F-BK-02）。

优先使用 sqlglot 做语句解析和基础表抽取；在依赖不可用或复杂 SQL 无法解析时，降级到
轻量规则兜底，保证后续 LLM 仍有结构化草稿可参考。
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.services.lineage_models import SqlDialect

try:  # sqlglot 是 PRD 推荐 parser；测试/离线环境未安装时仍保留规则兜底。
    import sqlglot
    from sqlglot import exp as sqlglot_exp
except Exception:  # pragma: no cover - 覆盖安装/未安装两种运行环境
    sqlglot = None
    sqlglot_exp = None

IDENT = r"[`\"\[]?[\w$${}.:-]+[`\"\]]?"
TABLE_RE = rf"{IDENT}(?:\s*\.\s*{IDENT}){{0,2}}"
TARGET_RE = re.compile(
    rf"\b(?:insert\s+(?:overwrite\s+)?(?:table\s+|into\s+)?|create\s+(?:or\s+replace\s+)?(?:temporary\s+|temp\s+)?table\s+)(?P<table>{TABLE_RE})",
    re.IGNORECASE,
)
SOURCE_RE = re.compile(rf"\b(?:from|join)\s+(?P<table>{TABLE_RE})", re.IGNORECASE)
CTE_RE = re.compile(rf"(?:with|,)\s+(?P<table>{IDENT})\s+as\s*\(", re.IGNORECASE)
COMMENT_RE = re.compile(r"(--[^\n]*|/\*.*?\*/)", re.DOTALL)


@dataclass
class ParserTable:
    id: str
    name: str
    type: str = "entity"
    statement_indexes: set[int] = field(default_factory=set)


@dataclass
class ParserDependency:
    source: str
    target: str
    kind: str
    statement_index: int
    line_start: int | None = None
    line_end: int | None = None


@dataclass
class ParserLineageDraft:
    dialect: SqlDialect
    tables: dict[str, ParserTable] = field(default_factory=dict)
    dependencies: list[ParserDependency] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def normalize_table_name(raw: str) -> str:
    """统一表名格式：去引号/中括号、压缩点号空白、保留占位符。"""
    name = re.sub(r"\s*\.\s*", ".", raw.strip())
    parts = []
    for part in name.split("."):
        cleaned = part.strip().strip("`\"[]")
        if cleaned:
            parts.append(cleaned)
    return ".".join(parts)


def split_table_parts(name: str) -> tuple[str | None, str | None]:
    parts = name.split(".")
    if len(parts) == 2:
        return parts[0], None
    if len(parts) >= 3:
        return parts[-3], parts[-2]
    return None, None


def parse_sql(sql: str, dialect: SqlDialect = "auto") -> ParserLineageDraft:
    cleaned = COMMENT_RE.sub(" ", sql)
    statements = _split_statements(cleaned)
    draft = ParserLineageDraft(dialect=dialect)

    if not statements:
        draft.warnings.append("未识别到可解析的 SQL 语句。")
        return draft

    lower_sql = cleaned.lower()
    if "${" in cleaned:
        draft.warnings.append("脚本包含动态变量占位符，已按原样参与表名识别，建议人工复核。")
    if not any(token in lower_sql for token in ("select", "insert", "create", "from", "join", "with")):
        draft.warnings.append("输入内容缺少常见 SQL 关键字。")
        return draft

    _parse_with_sqlglot(cleaned, dialect, draft)
    for idx, statement in enumerate(statements, start=1):
        _parse_statement_with_rules(statement, idx, draft)

    if not draft.tables:
        draft.warnings.append("未识别到明确的表名。")
    if draft.tables and not draft.dependencies:
        draft.warnings.append("已识别表名，但未识别到明确的源表到目标表依赖。")
    return draft


def _split_statements(sql: str) -> list[str]:
    return [item.strip() for item in re.split(r";\s*", sql) if item.strip()]


def _parse_with_sqlglot(sql: str, dialect: SqlDialect, draft: ParserLineageDraft) -> None:
    if sqlglot is None or sqlglot_exp is None:
        draft.warnings.append("SQL parser 依赖不可用，已使用基础规则兜底解析。")
        return

    try:
        kwargs: dict[str, str] = {}
        read_dialect = _sqlglot_dialect(dialect)
        if read_dialect:
            kwargs["read"] = read_dialect
        expressions = sqlglot.parse(sql, **kwargs)
    except Exception:
        draft.warnings.append("SQL parser 未能完整解析脚本，已使用基础规则兜底解析。")
        return

    for idx, expression in enumerate(expressions, start=1):
        if expression is not None:
            _parse_expression_with_sqlglot(expression, idx, draft)


def _sqlglot_dialect(dialect: SqlDialect) -> str | None:
    mapping = {
        "hive": "hive",
        "sparksql": "spark",
        "mysql": "mysql",
        "postgresql": "postgres",
    }
    return mapping.get(dialect)


def _parse_expression_with_sqlglot(expression: Any, statement_index: int, draft: ParserLineageDraft) -> None:
    ctes = {
        normalize_table_name(cte.alias)
        for cte in expression.find_all(sqlglot_exp.CTE)
        if getattr(cte, "alias", None)
    }
    for cte in ctes:
        _add_table(draft, cte, "temporary", statement_index)

    targets = _extract_target_tables(expression)
    for target in targets:
        _add_table(draft, target, "entity", statement_index)

    source_tables: set[str] = set()
    for table in expression.find_all(sqlglot_exp.Table):
        name = _sqlglot_table_name(table)
        if not name:
            continue
        table_type = "temporary" if name in ctes else "entity"
        if name in targets:
            table_type = "entity"
        _add_table(draft, name, table_type, statement_index)
        if name not in targets:
            source_tables.add(name)

    for target in targets:
        for source in source_tables:
            if source != target:
                _add_dependency(draft, source, target, "read", statement_index)


def _extract_target_tables(expression: Any) -> set[str]:
    targets: set[str] = set()
    for node_type in (sqlglot_exp.Insert, sqlglot_exp.Create):
        for node in expression.find_all(node_type):
            target = _table_from_node(getattr(node, "this", None))
            if target:
                targets.add(target)
    return targets


def _table_from_node(node: Any) -> str | None:
    if node is None:
        return None
    if isinstance(node, sqlglot_exp.Table):
        return _sqlglot_table_name(node)
    for table in node.find_all(sqlglot_exp.Table):
        return _sqlglot_table_name(table)
    return None


def _sqlglot_table_name(table: Any) -> str:
    parts = []
    for attr in ("catalog", "db", "name"):
        value = getattr(table, attr, None)
        if value:
            parts.append(str(value))
    if parts:
        return normalize_table_name(".".join(parts))
    return normalize_table_name(table.sql())


def _parse_statement_with_rules(statement: str, statement_index: int, draft: ParserLineageDraft) -> None:
    ctes = {normalize_table_name(m.group("table")) for m in CTE_RE.finditer(statement)}
    for cte in ctes:
        _add_table(draft, cte, "temporary", statement_index)

    target_match = TARGET_RE.search(statement)
    target = normalize_table_name(target_match.group("table")) if target_match else None
    if target:
        _add_table(draft, target, "entity", statement_index)

    for match in SOURCE_RE.finditer(statement):
        source = normalize_table_name(match.group("table"))
        if not source or source.lower() in {"select", "("}:
            continue
        table_type = "temporary" if source in ctes else "entity"
        _add_table(draft, source, table_type, statement_index)
        if target and source != target:
            kind = "join" if match.group(0).lower().lstrip().startswith("join") else "read"
            _add_dependency(
                draft,
                source,
                target,
                kind,
                statement_index,
                _line_for_pos(statement, match.start()),
                _line_for_pos(statement, match.end()),
            )


def _add_table(draft: ParserLineageDraft, name: str, table_type: str, statement_index: int) -> None:
    if not name:
        return
    existing = draft.tables.get(name)
    if existing:
        if existing.type == "entity" and table_type == "temporary":
            existing.type = "temporary"
        existing.statement_indexes.add(statement_index)
        return
    draft.tables[name] = ParserTable(
        id=name,
        name=name,
        type=table_type,
        statement_indexes={statement_index},
    )


def _add_dependency(
    draft: ParserLineageDraft,
    source: str,
    target: str,
    kind: str,
    statement_index: int,
    line_start: int | None = None,
    line_end: int | None = None,
) -> None:
    key = (source, target, kind, statement_index)
    if any((dep.source, dep.target, dep.kind, dep.statement_index) == key for dep in draft.dependencies):
        return
    draft.dependencies.append(
        ParserDependency(
            source=source,
            target=target,
            kind=kind,
            statement_index=statement_index,
            line_start=line_start,
            line_end=line_end,
        )
    )


def _line_for_pos(text: str, pos: int) -> int:
    return text.count("\n", 0, pos) + 1
