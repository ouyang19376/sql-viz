"""数据探查 - 只读查询执行（PRD-dataprofile F-QB-02/04/06/08，API-QB-01）。

护栏分层：
- 静态分析由调用方（router）在借连接前先做（analyzer.analyze），此处仅执行已放行的 SQL。
- LIMIT 注入：子查询包裹 + 分页（mysql/pg 用 LIMIT OFFSET，hive 用 LIMIT offset,n）。
- 超时 kill：独立线程 + future.result(timeout)；超时关闭连接以中断在途查询（plan §6 难点 7）。
- 行/单元格护栏：pageSize ≤200 由模型收口；单元格超 5000 字符截断。
- totalRows：mysql/pg 用 COUNT(*) 包裹（best-effort，超时降级 None + 关连接）；hive 为 None。
"""
from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from app.core.config import (
    PROFILE_HIVE_MAX_OFFSET,
    PROFILE_MAX_CELL_CHARS,
    PROFILE_QUERY_TIMEOUT_SECONDS,
)
from app.services.dataprofile_models import ProfileDialect, QueryResult

logger = logging.getLogger(__name__)

# 查询执行线程池：超时控制需独立线程 + future.result(timeout)；模块级共享。
_executor = ThreadPoolExecutor(max_workers=8, thread_name_prefix="dp-query")


class QueryTimeout(Exception):
    """查询执行超时（已关闭连接中断在途查询）。"""


def _strip_trailing_semicolon(sql: str) -> str:
    """去掉首尾空白与末尾 ';'，便于子查询包裹。"""
    return sql.strip().rstrip(";").strip()


def _wrap_limit(sql: str, dialect: ProfileDialect, page: int, page_size: int) -> str:
    """子查询包裹 + 分页 LIMIT 注入（F-QB-08）。

    分页参数为 Pydantic 校验过的 int，经 int() 强制后拼接，无注入风险
    （跨方言驱动 param-style 不一致，故不走参数化；附注释说明）。
    hive offset 上限 PROFILE_HIVE_MAX_OFFSET（≤1万），超限抛 ValueError -> 422。
    """
    inner = _strip_trailing_semicolon(sql)
    offset = int((page - 1) * page_size)
    n = int(page_size)
    if dialect == "hive":
        if offset > PROFILE_HIVE_MAX_OFFSET:
            raise ValueError(
                f"Hive 分页 offset 超过 {PROFILE_HIVE_MAX_OFFSET} 上限，请收窄范围或下载结果"
            )
        return f"SELECT * FROM ({inner}) AS _t LIMIT {offset}, {n}"
    # mysql / postgresql
    return f"SELECT * FROM ({inner}) AS _t LIMIT {n} OFFSET {offset}"


def _serialize_cell(value: Any) -> Any:
    """归一化为 JSON 安全类型（str|int|float|bool|None）+ 单元格截断（F-QB-04）。"""
    if value is None:
        return None
    if isinstance(value, bool):  # 须在 int 之前判定（bool 是 int 子类）
        return value
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (bytes, bytearray)):
        try:
            return _truncate_str(value.decode("utf-8", errors="replace"))
        except Exception:  # noqa: BLE001
            return _truncate_str(str(value))
    return _truncate_str(str(value))


def _truncate_str(s: str) -> str:
    if len(s) > PROFILE_MAX_CELL_CHARS:
        return s[:PROFILE_MAX_CELL_CHARS] + "…(截断)"
    return s


def _col_name(desc: Any) -> str:
    """兼容 pymysql(tuple) 与 psycopg3(Column) 取列名。"""
    name = getattr(desc, "name", None)
    if name:
        return str(name)
    if isinstance(desc, (tuple, list)) and desc:
        return str(desc[0])
    return "?"


def _run_select(conn: Any, paged_sql: str) -> tuple[list[str], list[tuple]]:
    cur = conn.cursor()
    try:
        cur.execute(paged_sql)
        columns = [_col_name(d) for d in cur.description] if cur.description else []
        rows = cur.fetchall()
    finally:
        cur.close()
    return columns, rows


def _run_count(conn: Any, sql: str) -> int:
    cur = conn.cursor()
    try:
        cur.execute(f"SELECT COUNT(*) FROM ({_strip_trailing_semicolon(sql)}) AS _t")
        row = cur.fetchone()
    finally:
        cur.close()
    return int(row[0]) if row and row[0] is not None else 0


def execute_query(
    conn: Any, dialect: ProfileDialect, sql: str, page: int, page_size: int
) -> tuple[QueryResult, bool]:
    """只读执行（含 LIMIT 注入 + 超时 kill + 截断 + totalRows）。

    返回 (QueryResult, broken)：broken=True 表示执行期间连接已关闭（超时 kill），
    调用方须以 broken 归还/丢弃连接。分页查询超时抛 QueryTimeout。
    """
    start = time.monotonic()
    paged_sql = _wrap_limit(sql, dialect, page, page_size)

    # 1. 分页查询（超时 -> kill 连接 -> QueryTimeout）
    fut = _executor.submit(_run_select, conn, paged_sql)
    try:
        columns, raw_rows = fut.result(timeout=PROFILE_QUERY_TIMEOUT_SECONDS)
    except FuturesTimeoutError:
        _close_quietly(conn)
        raise QueryTimeout()
    except Exception:
        # 驱动执行异常：连接可能不可用，标记 broken 由路由丢弃
        _close_quietly(conn)
        raise

    rows = [[_serialize_cell(c) for c in row] for row in raw_rows]
    truncated = len(rows) >= page_size  # 当前页已满 -> 可能还有更多行

    # 2. totalRows：mysql/pg 用 COUNT(*)（best-effort）；hive 为 None
    total: int | None = None
    broken = False
    if dialect != "hive":
        remaining = max(1.0, PROFILE_QUERY_TIMEOUT_SECONDS - (time.monotonic() - start))
        cfut = _executor.submit(_run_count, conn, sql)
        try:
            total = cfut.result(timeout=remaining)
        except Exception:
            # COUNT 超时或失败：不致命，保留已取行；但连接可能处于异常态，关连接置 broken
            _close_quietly(conn)
            broken = True
            total = None

    elapsed_ms = int((time.monotonic() - start) * 1000)
    return (
        QueryResult(
            columns=columns,
            rows=rows,
            page=page,
            pageSize=page_size,
            totalRows=total,
            truncated=truncated,
            elapsedMs=elapsed_ms,
        ),
        broken,
    )


def _close_quietly(conn: Any) -> None:
    try:
        conn.close()
    except Exception:  # noqa: BLE001
        pass


def explain_sql(conn: Any, sql: str) -> tuple[bool, str | None]:
    """EXPLAIN 试运行（PRD-dataprofile F-PG-08，API-PG-02）。

    `EXPLAIN <sql>` 三方言通用。超时则关闭连接中断在途执行（plan §6 难点 4）。
    返回 (ok, error)：ok=True 通过；ok=False 带 error（SQL 错误或超时文案）。
    非 SQL 错误（语法/权限）不关闭连接（可复用）；仅超时关闭。

    连接生命周期由调用方管理：本函数仅在超时时 close 以中断在途 EXPLAIN，
    调用方据此以 broken 归还/丢弃连接。
    """
    def _run() -> None:
        cur = conn.cursor()
        try:
            cur.execute(f"EXPLAIN {_strip_trailing_semicolon(sql)}")
            cur.fetchall()  # 消费结果（部分驱动要求取完才释放）
        finally:
            cur.close()

    fut = _executor.submit(_run)
    try:
        fut.result(timeout=PROFILE_QUERY_TIMEOUT_SECONDS)
        return True, None
    except FuturesTimeoutError:
        _close_quietly(conn)  # 中断在途 EXPLAIN
        return False, "EXPLAIN 超时"
    except Exception as exc:  # noqa: BLE001 - SQL 语法/权限错误归一化为失败
        return False, str(exc)[:300]
