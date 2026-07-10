"""数据探查 - 只读执行器测试（F-QB-02/04/06/08）。

无实库：FakeConn(rows_for, description) 决定分页查询与 COUNT(*) 的返回；
超时用例 monkeypatch PROFILE_QUERY_TIMEOUT_SECONDS + 慢 rows_for。
"""
import time
from datetime import datetime
from decimal import Decimal

import pytest

from app.services import dataprofile_executor as exec_mod
from app.services.dataprofile_executor import (
    QueryTimeout,
    _serialize_cell,
    _wrap_limit,
    execute_query,
)
from tests._dp_fakes import FakeConn


# ─── _wrap_limit（F-QB-08 方言分页） ───────────────────
class TestWrapLimit:
    def test_mysql_limit_offset(self):
        s = _wrap_limit("SELECT * FROM t", "mysql", 1, 50)
        assert "LIMIT 50 OFFSET 0" in s
        s2 = _wrap_limit("SELECT * FROM t", "mysql", 3, 50)
        assert "LIMIT 50 OFFSET 100" in s2  # (3-1)*50

    def test_postgres_uses_offset(self):
        s = _wrap_limit("SELECT * FROM t", "postgresql", 1, 20)
        assert "LIMIT 20 OFFSET 0" in s

    def test_hive_limit_offset_comma(self):
        # Hive: LIMIT offset, count
        s = _wrap_limit("SELECT * FROM t", "hive", 2, 50)
        assert "LIMIT 50, 50" in s  # offset=50, count=50

    def test_strips_trailing_semicolon(self):
        s = _wrap_limit("SELECT 1;", "mysql", 1, 10)
        assert ";)" not in s
        assert "SELECT 1" in s

    def test_hive_offset_over_limit_raises(self):
        # offset=(1000-1)*50=49950 > 10000
        with pytest.raises(ValueError):
            _wrap_limit("SELECT * FROM t", "hive", 1000, 50)


# ─── _serialize_cell（F-QB-04 截断与归一化） ────────────
class TestSerializeCell:
    def test_truncates_long_string(self):
        out = _serialize_cell("x" * 6000)
        assert len(out) < 6000
        assert "截断" in out

    def test_none_and_bool(self):
        assert _serialize_cell(None) is None
        assert _serialize_cell(True) is True
        assert _serialize_cell(False) is False

    def test_int_float_pass(self):
        assert _serialize_cell(42) == 42
        assert _serialize_cell(3.14) == 3.14

    def test_decimal(self):
        assert _serialize_cell(Decimal("5")) == 5
        assert isinstance(_serialize_cell(Decimal("5.5")), float)

    def test_datetime_iso(self):
        assert _serialize_cell(datetime(2026, 1, 1, 12, 0, 0)).startswith("2026-01-01")

    def test_bytes_decoded(self):
        assert _serialize_cell(b"hello") == "hello"


# ─── execute_query（集成：FakeConn） ────────────────────
class TestExecuteQuery:
    @staticmethod
    def _conn(rows, total=120, dialect="mysql"):
        def rows_for(sql, params):
            if "COUNT(*)" in sql.upper():
                return [(total,)]
            return rows
        return FakeConn(rows_for=rows_for, description=[("id",), ("name",)])

    def test_mysql_success_with_total(self):
        conn = self._conn([(1, "张三"), (2, "李四")])
        result, broken = execute_query(conn, "mysql", "SELECT id, name FROM users", 1, 50)
        assert result.columns == ["id", "name"]
        assert result.rows == [[1, "张三"], [2, "李四"]]
        assert result.totalRows == 120
        assert result.page == 1 and result.pageSize == 50
        assert result.truncated is False  # 2 < 50
        assert broken is False
        assert result.elapsedMs >= 0

    def test_truncated_when_page_full(self):
        rows = [(i,) for i in range(50)]
        conn = self._conn(rows, total=120)
        result, _ = execute_query(conn, "mysql", "SELECT id FROM t", 1, 50)
        assert result.truncated is True
        assert len(result.rows) == 50

    def test_hive_total_rows_none(self):
        conn = FakeConn(rows_for=lambda sql, p: [(1,)], description=[("id",)])
        result, broken = execute_query(conn, "hive", "SELECT id FROM t", 1, 50)
        assert result.totalRows is None
        assert broken is False
        assert result.rows == [[1]]

    def test_cell_truncation(self):
        big = "x" * 6000
        conn = self._conn([(big,)])
        result, _ = execute_query(conn, "mysql", "SELECT c FROM t", 1, 50)
        assert len(result.rows[0][0]) < 6000
        assert "截断" in result.rows[0][0]

    def test_timeout_closes_conn_and_raises(self, monkeypatch):
        monkeypatch.setattr(exec_mod, "PROFILE_QUERY_TIMEOUT_SECONDS", 0.05)

        def slow(sql, params):
            time.sleep(0.2)
            return [(1,)]

        conn = FakeConn(rows_for=slow, description=[("id",)])
        with pytest.raises(QueryTimeout):
            execute_query(conn, "mysql", "SELECT * FROM big_table", 1, 50)
        assert conn.closed is True  # 超时 kill：连接已关闭
