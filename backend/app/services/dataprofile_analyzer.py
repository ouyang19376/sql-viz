"""数据探查 - SQL 静态分析与格式化（PRD-dataprofile F-QB-03 / F-QB-11，API-QB-02）。

sqlglot AST 白名单：仅允许单条只读 SELECT（含 UNION / CTE / 子查询），
拦截 DML / DDL / 多语句 / INTO OUTFILE / 危险函数（plan §6 难点 2）。

注意：sqlglot 把 `SELECT ... UNION SELECT ...` 解析为顶层 `exp.Union`（Select 的
兄弟节点，而非其子结构），故白名单须显式放行 Union / Intersect / Except，
否则会误拦合法 UNION 查询（对 plan §6 难点 2 的必要修正）。
"""
from __future__ import annotations

from app.services.dataprofile_models import ProfileDialect, SqlAnalysis

try:  # sqlglot 是硬依赖（requirements.txt），但保留与 lineage_parser 一致的降级防御
    import sqlglot
    from sqlglot import exp as sqlglot_exp
except Exception:  # pragma: no cover - 依赖缺失时降级
    sqlglot = None
    sqlglot_exp = None


# sqlglot 方言映射（与 lineage_parser._sqlglot_dialect 对齐）
_DIALECT_MAP: dict[str, str] = {
    "mysql": "mysql",
    "postgresql": "postgres",
    "hive": "hive",
}


def _readonly_types() -> tuple:
    """顶层允许的只读查询类型（懒构造，避免 sqlglot 不可用时 NameError）。"""
    if sqlglot_exp is None:
        return ()
    return (
        sqlglot_exp.Select,
        sqlglot_exp.Union,
        sqlglot_exp.Intersect,
        sqlglot_exp.Except,
        sqlglot_exp.Subquery,
    )


def _forbidden_types() -> tuple:
    """DML / DDL 节点黑名单（defense-in-depth：合法只读查询中不应出现）。"""
    if sqlglot_exp is None:
        return ()
    return (
        sqlglot_exp.Insert,
        sqlglot_exp.Update,
        sqlglot_exp.Delete,
        sqlglot_exp.Create,
        sqlglot_exp.Drop,
        sqlglot_exp.Alter,
        sqlglot_exp.TruncateTable,
        sqlglot_exp.Merge,
    )


# 危险函数（大写匹配；INTO OUTFILE/DUMPFILE 由 exp.Into 拦截，不在此列）
_DANGEROUS_FUNCS = {
    "LOAD_FILE",
    "SLEEP",
    "BENCHMARK",
    "GET_LOCK",
    "RELEASE_LOCK",
    "SYS_EXEC",
    "SYS_EVAL",
}


def analyze(sql: str, dialect: ProfileDialect) -> SqlAnalysis:
    """静态分析：仅允许单条只读 SELECT，拦截危险操作（F-QB-03）。

    纯函数，不触碰数据源；/query 在借连接前先调用它（命中即拦截，省一次 DB 往返）。
    """
    if sqlglot is None or sqlglot_exp is None:
        return SqlAnalysis(allowed=False, violations=["SQL 解析器不可用"], statementCount=0)

    try:
        expressions = sqlglot.parse(sql, read=_DIALECT_MAP.get(dialect))
    except Exception:
        return SqlAnalysis(allowed=False, violations=["SQL 解析失败，请检查语法"], statementCount=0)

    statements = [e for e in (expressions or []) if e is not None]
    count = len(statements)
    if count == 0:
        return SqlAnalysis(allowed=False, violations=["空 SQL 或无法解析"], statementCount=0)
    if count > 1:
        return SqlAnalysis(allowed=False, violations=["仅允许单条语句，检测到多语句"], statementCount=count)

    expr = statements[0]
    violations: list[str] = []

    if not isinstance(expr, _readonly_types()):
        violations.append(f"仅允许只读 SELECT 查询，检测到 {_node_label(expr)}")

    # DML / DDL 节点（即使顶层非只读，也收集具体违规供定位）
    for node in expr.find_all(*_forbidden_types()):
        violations.append(f"包含 {_node_label(node)} 语句")

    # INTO OUTFILE / DUMPFILE（SELECT 可携带，须单独拦截）
    for _ in expr.find_all(sqlglot_exp.Into):
        violations.append("禁止 INTO OUTFILE / DUMPFILE")

    # 危险函数（find_all(Func) 覆盖具名函数与 Anonymous）
    for node in expr.find_all(sqlglot_exp.Func):
        name = (getattr(node, "name", "") or "").upper()
        if name in _DANGEROUS_FUNCS:
            violations.append(f"禁止使用危险函数 {name}")

    return SqlAnalysis(
        allowed=(len(violations) == 0),
        violations=_dedup(violations),
        statementCount=count,
    )


def format_sql(sql: str, dialect: ProfileDialect) -> str:
    """sqlglot transpile 格式化（F-QB-11）。解析失败时原样返回。"""
    if sqlglot is None:
        return sql
    try:
        parts = sqlglot.transpile(
            sql, read=_DIALECT_MAP.get(dialect), write=_DIALECT_MAP.get(dialect), pretty=True
        )
        return ";\n".join(parts) if parts else sql
    except Exception:
        return sql


def _node_label(node: object) -> str:
    """取 sqlglot 节点的可读类型名（去掉 exp. 前缀）。"""
    return type(node).__name__


def _dedup(items: list[str]) -> list[str]:
    """去重保序。"""
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out
