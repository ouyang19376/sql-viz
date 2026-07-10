"""数据探查 - Schema 反射测试（F-DS-07）。

无实库：FakeConn + rows_for 决定 fetchall 结果，校验生成的 SQL 与参数化。
"""
import pytest

from app.services.dataprofile_schema import (
    _check_ident,
    list_columns,
    list_schemas,
    list_tables,
)
from tests._dp_fakes import FakeConn


class TestListSchemas:
    def test_mysql_filters_system_schemas(self):
        conn = FakeConn(rows_for=lambda sql, p: [
            ("db1",), ("mysql",), ("information_schema",), ("sys",), ("performance_schema",),
        ])
        assert list_schemas(conn, "mysql") == ["db1"]

    def test_postgresql_filters_pg_and_meta(self):
        # PG 的 pg_*/information_schema 过滤写在 SQL 里（DB 侧执行）。
        # 假 conn 模拟「DB 已过滤后」的返回，并断言生成的 SQL 含过滤条件。
        captured = {}
        def rows_for(sql, params):
            captured["sql"] = sql
            return [("public",)]
        conn = FakeConn(rows_for=rows_for)
        assert list_schemas(conn, "postgresql") == ["public"]
        sql = captured["sql"].upper()
        assert "PG_%" in sql.replace('"', "'") or "PG_%" in sql
        assert "INFORMATION_SCHEMA" in sql

    def test_hive_show_databases(self):
        conn = FakeConn(rows_for=lambda sql, p: [("default",), ("db1",)])
        assert list_schemas(conn, "hive") == ["default", "db1"]


class TestListTables:
    def test_mysql_parameterized(self):
        captured = {}
        def rows_for(sql, params):
            captured["sql"] = sql
            captured["params"] = params
            return [("users",), ("orders",)]
        conn = FakeConn(rows_for=rows_for)
        tables = list_tables(conn, "mysql", "db1")
        assert [t.name for t in tables] == ["users", "orders"]
        assert all(t.schema == "db1" for t in tables)
        assert "%s" in captured["sql"]
        assert captured["params"] == ("db1",)

    def test_postgresql_base_table_filter(self):
        captured = {}
        def rows_for(sql, params):
            captured["sql"] = sql
            return [("t1",)]
        conn = FakeConn(rows_for=rows_for)
        list_tables(conn, "postgresql", "public")
        assert "BASE TABLE" in captured["sql"]

    def test_hive_show_tables_in_db(self):
        captured = {}
        def rows_for(sql, params):
            captured["sql"] = sql
            return [("t1",)]
        conn = FakeConn(rows_for=rows_for)
        tables = list_tables(conn, "hive", "db1")
        assert captured["sql"] == "SHOW TABLES IN db1"
        assert tables[0].schema == "db1"


class TestListColumns:
    def test_mysql_nullable_mapping(self):
        captured = {}
        def rows_for(sql, params):
            captured["params"] = params
            return [("id", "int", "NO"), ("name", "varchar", "YES")]
        conn = FakeConn(rows_for=rows_for)
        cols = list_columns(conn, "mysql", "db1", "users")
        assert captured["params"] == ("db1", "users")
        assert [c.name for c in cols] == ["id", "name"]
        assert cols[0].nullable is False and cols[1].nullable is True

    def test_hive_describe_skips_partition_header(self):
        captured = {}
        def rows_for(sql, params):
            captured["sql"] = sql
            return [("id", "int", ""), ("# Partition Information", "", ""), ("name", "string", "")]
        conn = FakeConn(rows_for=rows_for)
        cols = list_columns(conn, "hive", "db1", "users")
        assert captured["sql"] == "DESCRIBE db1.users"
        assert [c.name for c in cols] == ["id", "name"]  # 跳过 # 分区行
        assert cols[0].nullable is True  # Hive 无 NOT NULL 概念


class TestCheckIdent:
    def test_valid(self):
        _check_ident("users")  # 不抛

    def test_rejects_injection(self):
        with pytest.raises(ValueError):
            _check_ident("users; DROP TABLE x")
        with pytest.raises(ValueError):
            _check_ident("a b")
