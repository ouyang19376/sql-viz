"""数据探查 - Schema 反射（PRD-dataprofile F-DS-07，API-DS-05/06/07）。

按方言拉取 库 / 表 / 列：
- MySQL / PostgreSQL：统一走 information_schema（参数化查询，防注入）。
- Hive：SHOW DATABASES / SHOW TABLES IN <db> / DESCRIBE（标识符先白名单校验）。
"""
from __future__ import annotations

import re
from typing import Any

from app.services.dataprofile_models import ColumnInfo, ProfileDialect, TableInfo

# 标识符白名单（用于 Hive 的 SHOW/DESCRIBE 拼接，杜绝注入）
_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

_MYSQL_SYS_SCHEMAS = {"information_schema", "mysql", "performance_schema", "sys"}


def list_schemas(conn: Any, dialect: ProfileDialect, *, default_schema: str | None = None) -> list[str]:
    """库/Schema 列表。default_schema 仅用于 None 时回退（连库的当前库）。"""
    cur = conn.cursor()
    try:
        if dialect == "hive":
            cur.execute("SHOW DATABASES")
            rows = cur.fetchall()
            return [r[0] for r in rows if r and r[0] != "_dummy"]
        # mysql / postgresql
        if dialect == "postgresql":
            sql = (
                "SELECT schema_name FROM information_schema.schemata "
                "WHERE schema_name NOT LIKE 'pg_%' "
                "AND schema_name <> 'information_schema' "
                "ORDER BY schema_name"
            )
            cur.execute(sql)
        else:  # mysql
            sql = "SELECT schema_name FROM information_schema.schemata ORDER BY schema_name"
            cur.execute(sql)
        rows = cur.fetchall()
        names = [r[0] for r in rows]
        if dialect == "mysql":
            names = [n for n in names if n not in _MYSQL_SYS_SCHEMAS]
        return names
    finally:
        cur.close()


def list_tables(conn: Any, dialect: ProfileDialect, schema: str | None) -> list[TableInfo]:
    """表列表。schema 为空时：MySQL 取当前库；PG 取 public；Hive 取 default。"""
    cur = conn.cursor()
    try:
        if dialect == "hive":
            db = schema or "default"
            _check_ident(db)
            cur.execute(f"SHOW TABLES IN {db}")
            rows = cur.fetchall()
            return [TableInfo(name=r[0], schema=db) for r in rows if r]

        if dialect == "mysql":
            target = schema or _current_db(conn)
            cur.execute(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = %s ORDER BY table_name",
                (target,),
            )
            return [TableInfo(name=r[0], schema=target) for r in cur.fetchall()]

        # postgresql
        target = schema or "public"
        cur.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = %s AND table_type = 'BASE TABLE' ORDER BY table_name",
            (target,),
        )
        return [TableInfo(name=r[0], schema=target) for r in cur.fetchall()]
    finally:
        cur.close()


def list_columns(conn: Any, dialect: ProfileDialect, schema: str | None, table: str) -> list[ColumnInfo]:
    """列信息。MySQL/PG 走 information_schema；Hive 走 DESCRIBE。"""
    cur = conn.cursor()
    try:
        if dialect == "hive":
            db = schema or "default"
            _check_ident(db)
            _check_ident(table)
            cur.execute(f"DESCRIBE {db}.{table}")
            rows = cur.fetchall()
            cols: list[ColumnInfo] = []
            for r in rows:
                # Hive DESCRIBE: (col_name, data_type, comment)；遇分区行 # col_name 跳过
                name = r[0]
                if not name or name.startswith("#"):
                    continue
                cols.append(ColumnInfo(name=name, type=str(r[1]) if len(r) > 1 else "string", nullable=True))
            return cols

        # mysql / postgresql
        if dialect == "mysql":
            target_schema = schema or _current_db(conn)
        else:
            target_schema = schema or "public"
        _check_ident(table)
        cur.execute(
            "SELECT column_name, data_type, is_nullable "
            "FROM information_schema.columns "
            "WHERE table_schema = %s AND table_name = %s "
            "ORDER BY ordinal_position",
            (target_schema, table),
        )
        return [
            ColumnInfo(
                name=r[0],
                type=str(r[1]),
                nullable=(str(r[2]).upper() == "YES"),
            )
            for r in cur.fetchall()
        ]
    finally:
        cur.close()


def _current_db(conn: Any) -> str:
    """MySQL 当前库（连接时指定的 database）。"""
    cur = conn.cursor()
    try:
        cur.execute("SELECT DATABASE()")
        row = cur.fetchone()
        return str(row[0]) if row and row[0] else ""
    finally:
        cur.close()


def _check_ident(name: str) -> None:
    """标识符白名单校验（仅用于 Hive SHOW/DESCRIBE 拼接路径）。"""
    if not name or not _IDENT_RE.match(name):
        raise ValueError(f"非法标识符：{name!r}")
