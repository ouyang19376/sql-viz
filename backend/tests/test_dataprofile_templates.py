"""数据探查 - 内置指标模板渲染测试（F-PG-05）。

纯函数：断言归一化四列形状 + 方言字符串 CAST + 占位符已替换 + 各指标特征。
不连库、不调 LLM。
"""
import pytest

from app.services.dataprofile_models import ProfileDialect
from app.services.dataprofile_templates import (
    TemplateRenderError,
    parse_table,
    render_builtin,
    validate_ident,
)

DIALECTS: list[ProfileDialect] = ["mysql", "postgresql", "hive"]
_STRING_TYPE = {"mysql": "CHAR", "postgresql": "TEXT", "hive": "STRING"}


def _has_shape(sql: str, dialect: ProfileDialect) -> None:
    """断言四列归一化形状 + value CAST 为方言字符串。"""
    assert "AS table_name" in sql
    assert "AS column_name" in sql
    assert "AS metric" in sql
    assert "AS value" in sql
    assert f"AS {_STRING_TYPE[dialect]}" in sql  # CAST(... AS <ST>)


class TestShape:
    @pytest.mark.parametrize("dialect", DIALECTS)
    def test_row_count_no_column(self, dialect):
        sql = render_builtin("row_count", dialect, "users")
        _has_shape(sql, dialect)
        assert "'users' AS table_name" in sql
        assert "'' AS column_name" in sql  # 无列：空串
        assert "'row_count' AS metric" in sql
        assert "COUNT(*)" in sql
        assert "FROM users" in sql

    @pytest.mark.parametrize("dialect", DIALECTS)
    def test_null_rate_uses_column(self, dialect):
        sql = render_builtin("null_rate", dialect, "users", "email")
        _has_shape(sql, dialect)
        assert "'email' AS column_name" in sql
        assert "AVG(CASE WHEN email IS NULL" in sql
        assert "100.0" in sql  # 百分比

    @pytest.mark.parametrize("dialect", DIALECTS)
    def test_distinct_count(self, dialect):
        sql = render_builtin("distinct_count", dialect, "users", "email")
        _has_shape(sql, dialect)
        assert "COUNT(DISTINCT email)" in sql

    def test_duplicate_count_expr(self):
        sql = render_builtin("duplicate_count", "mysql", "users", "email")
        assert "COUNT(email) - COUNT(DISTINCT email)" in sql

    @pytest.mark.parametrize("dialect", DIALECTS)
    def test_value_distribution_groupby(self, dialect):
        sql = render_builtin("value_distribution", dialect, "users", "status")
        _has_shape(sql, dialect)
        assert "GROUP BY status" in sql
        assert "CONCAT(COALESCE(status, '(NULL)'), '=', COUNT(*))" in sql

    def test_min_max_concat(self):
        sql = render_builtin("min_max", "mysql", "users", "age")
        assert "CONCAT('min=', MIN(age), ',max=', MAX(age))" in sql

    def test_numeric_stats_has_avg(self):
        sql = render_builtin("numeric_stats", "mysql", "users", "age")
        assert ",avg=" in sql
        assert "AVG(age)" in sql

    def test_type_consistency_trim(self):
        sql = render_builtin("type_consistency", "mysql", "users", "name")
        assert "TRIM(name)" in sql
        assert "<>" in sql  # 不等比较

    def test_topn_frequency_order_limit(self):
        sql = render_builtin("topn_frequency", "mysql", "users", "status")
        assert "GROUP BY status" in sql
        assert "ORDER BY COUNT(*) DESC" in sql
        assert "LIMIT 10" in sql


class TestRegexMatch:
    def test_mysql_regexp(self):
        sql = render_builtin("regex_match", "mysql", "users", "email", r"^[\w.]+@")
        assert "email REGEXP" in sql
        # 单引号转义：原串无单引号则不变
        assert "^" in sql

    def test_postgres_tilde(self):
        sql = render_builtin("regex_match", "postgresql", "users", "email", "^[A-Z]")
        assert "email ~" in sql

    def test_hive_rlike(self):
        sql = render_builtin("regex_match", "hive", "users", "email", "^[A-Z]")
        assert "email RLIKE" in sql

    def test_quote_escaped(self):
        # 含单引号的正则须翻倍转义，防注入
        sql = render_builtin("regex_match", "mysql", "users", "email", "a'b")
        assert "a''b" in sql

    def test_missing_param_raises(self):
        with pytest.raises(TemplateRenderError):
            render_builtin("regex_match", "mysql", "users", "email", None)


class TestIdentifierValidation:
    def test_simple_name_ok(self):
        validate_ident("users")  # 不抛
        validate_ident("schema.users")

    @pytest.mark.parametrize("bad", ["", "user name", "users; DROP", "1users", "a.b.c", "a;b"])
    def test_bad_identifier_rejected(self, bad):
        with pytest.raises(TemplateRenderError):
            validate_ident(bad)

    def test_parse_table(self):
        assert parse_table("users") == (None, "users")
        assert parse_table("schema.users") == ("schema", "users")


class TestErrors:
    def test_unknown_metric_raises(self):
        with pytest.raises(TemplateRenderError):
            render_builtin("nope", "mysql", "users")

    def test_needs_column_metric_without_column_raises(self):
        # needsColumn 指标缺列应拒（防止 None 被插入 SQL）
        with pytest.raises(TemplateRenderError):
            render_builtin("null_rate", "mysql", "users", None)
