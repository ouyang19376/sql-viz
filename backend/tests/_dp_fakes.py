"""数据探查测试共用 fakes（仅测试用，不进生产）。"""
from __future__ import annotations

from typing import Any, Callable


class FakeCursor:
    """按 rows_for(sql, params) 决定返回行的假 cursor。记录最后执行的 sql/params。"""

    def __init__(self, rows_for: Callable[[str, Any], list[tuple]], description: Any = None):
        self._rows_for = rows_for
        self.sql: str | None = None
        self.params: Any = None
        self._rows: list[tuple] = []
        self.description: Any = description  # QB 执行器测试：模拟 cursor.description

    def execute(self, sql: str, params: Any = None) -> None:
        self.sql = sql
        self.params = params
        self._rows = self._rows_for(sql, params)

    def fetchone(self) -> tuple | None:
        return self._rows[0] if self._rows else None

    def fetchall(self) -> list[tuple]:
        return self._rows

    def close(self) -> None:
        pass


class FakeConn:
    """假 DBAPI 连接：每次 cursor() 造一个 FakeCursor。"""

    def __init__(
        self,
        rows_for: Callable[[str, Any], list[tuple]] | None = None,
        description: Any = None,
    ):
        self._rows_for = rows_for or (lambda sql, params: [])
        self._description = description
        self.closed = False
        self.config: Any = None

    def cursor(self) -> FakeCursor:
        return FakeCursor(self._rows_for, self._description)

    def close(self) -> None:
        self.closed = True


class FakeDriverModule:
    """假的 pymysql/psycopg/pyhive 模块：connect 记录入参并返回 FakeConn。"""

    def __init__(self):
        self.connect_calls: list[dict] = []

    def connect(self, **kwargs):
        self.connect_calls.append(kwargs)
        conn = FakeConn()
        conn.config = kwargs
        return conn
