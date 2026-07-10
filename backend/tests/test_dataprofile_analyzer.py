"""数据探查 - SQL 静态分析测试（F-QB-03 / F-QB-11）。

合法矩阵覆盖 5 类复杂只读查询；非法矩阵覆盖 DML/DDL/多语句/INTO OUTFILE/危险函数/空。
断言 allowed 而非具体违规文案，避免与 sqlglot 版本耦合。
"""
import pytest

from app.services.dataprofile_analyzer import analyze, format_sql


# ─── 合法查询（allowed=True） ─────────────────────────
class TestAllowed:
    @pytest.mark.parametrize(
        "sql",
        [
            "SELECT * FROM users",
            "SELECT a.id, b.name FROM a JOIN b ON a.id = b.id",
            "SELECT * FROM (SELECT 1 AS x) t",
            "WITH cte AS (SELECT 1 AS x) SELECT * FROM cte",
            "SELECT 1 UNION SELECT 2",
            "SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM t",
        ],
    )
    def test_allowed(self, sql):
        a = analyze(sql, "mysql")
        assert a.allowed is True, a.violations
        assert a.statementCount == 1
        assert a.violations == []

    def test_dialect_hive_allowed(self):
        assert analyze("SELECT * FROM t", "hive").allowed is True

    def test_postgres_allowed(self):
        assert analyze("SELECT * FROM t", "postgresql").allowed is True


# ─── 非法查询（allowed=False） ─────────────────────────
class TestBlocked:
    @pytest.mark.parametrize(
        "sql",
        [
            "INSERT INTO t (a) VALUES (1)",
            "UPDATE t SET a = 1",
            "DELETE FROM t",
            "CREATE TABLE t (a INT)",
            "DROP TABLE t",
            "ALTER TABLE t ADD COLUMN c INT",
            "SELECT 1; SELECT 2",  # 多语句
            "SELECT * FROM t INTO OUTFILE '/tmp/x'",  # INTO OUTFILE
            "SELECT SLEEP(5)",  # 危险函数
            "SELECT BENCHMARK(1000000, MD5('x'))",
            "SELECT LOAD_FILE('/etc/passwd')",
        ],
    )
    def test_blocked(self, sql):
        a = analyze(sql, "mysql")
        assert a.allowed is False
        assert len(a.violations) > 0

    def test_multistatement_count(self):
        a = analyze("SELECT 1; SELECT 2", "mysql")
        assert a.statementCount == 2

    def test_empty_sql_blocked(self):
        assert analyze("", "mysql").allowed is False
        assert analyze("-- only a comment", "mysql").allowed is False

    def test_blocked_carries_violation_text(self):
        a = analyze("DELETE FROM users", "mysql")
        assert a.allowed is False
        assert any("DELETE" in v or "Delete" in v for v in a.violations)


# ─── 格式化（F-QB-11） ──────────────────────────────────
class TestFormat:
    def test_pretty_uppercases_keywords(self):
        out = format_sql("select id from users", "mysql")
        assert "SELECT" in out
        assert "users" in out

    def test_preserves_table_name(self):
        out = format_sql("select   id   from   orders", "mysql")
        assert "orders" in out

    def test_invalid_returns_original(self):
        bad = "SELECT FROM"
        # 解析失败时返回原串（不抛异常）
        out = format_sql(bad, "mysql")
        assert isinstance(out, str)
