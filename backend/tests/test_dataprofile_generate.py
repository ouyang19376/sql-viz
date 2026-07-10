"""数据探查 - 生成编排测试（F-PG-05~10）。

无实库/实 LLM：FakeConn 反射 + 注入 chat_fn / explain_fn。
"""
import json

import pytest

from app.services.dataprofile_generate import GenerateError, generate
from app.services.dataprofile_models import (
    CustomRule,
    GenerateProfileRequest,
)
from app.services.dataprofile_rules import list_metrics
from tests._dp_fakes import FakeConn


def _rule(
    id="rule_test1", name="空值检查", dialect="mysql", needs_column=True,
    sql="SELECT COUNT(*) FROM {table} WHERE {column} IS NULL",
):
    return CustomRule(
        id=id, name=name, description="检查空值", exampleSql=sql,
        dialect=dialect, needsColumn=needs_column, createdAt=1, updatedAt=1,
    )


def _req(**over):
    base = dict(
        datasourceId="ds_1", dialect="mysql", sourceType="tables",
        tables=["db1.users"], metricIds=["null_rate"], customRuleIds=[],
        columns={"db1.users": ["email"]}, outputMode="split",
    )
    base.update(over)
    return GenerateProfileRequest(**base)


def _chat_ok(system, user):
    """返回一条合法归一化 SELECT。"""
    return json.dumps({
        "sql": (
            "SELECT 'db1.users' AS table_name, 'email' AS column_name, "
            "'myrule' AS metric, CAST(COUNT(*) AS CHAR) AS value FROM db1.users"
        )
    })


def _explain_ok(sql):
    return True, None


METRICS = list_metrics()


# ─── 内置指标（零 LLM） ─────────────────────────────────
class TestBuiltin:
    def test_split_single_segment(self):
        resp = generate(_req(metricIds=["null_rate"]), None, "mysql", METRICS, [])
        assert resp.refused is False
        assert len(resp.segments) == 1
        seg = resp.segments[0]
        assert seg.source == "builtin"
        assert seg.metricId == "null_rate"
        assert "db1.users" in seg.sql
        assert "email" in seg.sql
        assert resp.validation.passed is True
        assert resp.validation.explain is None  # 无自定义段

    def test_row_count_no_column_no_reflection(self):
        # row_count 不需列 -> 无反射，conn=None 也可
        resp = generate(
            _req(metricIds=["row_count"], tables=["db1.users"], columns=None),
            None, "mysql", METRICS, [],
        )
        assert len(resp.segments) == 1
        assert "'' AS column_name" in resp.segments[0].sql

    def test_merge_unions_segments(self):
        req = _req(
            metricIds=["row_count"], tables=["db1.users", "db1.orders"],
            columns=None, outputMode="merge",
        )
        resp = generate(req, None, "mysql", METRICS, [])
        assert len(resp.segments) == 1  # 合并为 1 段
        assert "UNION ALL" in resp.segments[0].sql
        assert "SELECT table_name, column_name, metric, value FROM (" in resp.segments[0].sql

    def test_multi_metric_multi_column_split(self):
        req = _req(
            metricIds=["null_rate", "distinct_count"],
            columns={"db1.users": ["email", "id"]},
        )
        resp = generate(req, None, "mysql", METRICS, [])
        # 2 指标 × 2 列 = 4 段
        assert len(resp.segments) == 4
        titles = [s.title for s in resp.segments]
        # title 用指标 name（空值率 / 去重计数）
        assert any("空值率" in t for t in titles)
        assert any("去重计数" in t for t in titles)


# ─── 列反射（source=tables 未给列） ─────────────────────
class TestColumnReflection:
    def test_reflects_columns_when_not_provided(self):
        conn = FakeConn(rows_for=lambda sql, p: [
            ("id", "int", "NO"), ("email", "varchar", "YES"),
        ] if "information_schema.columns" in sql.lower() else [])
        req = _req(metricIds=["null_rate"], tables=["db1.users"], columns=None)
        resp = generate(req, conn, "mysql", METRICS, [])
        # 反射到 2 列 -> 2 段
        assert len(resp.segments) == 2
        cols = {s.sql.split("'email' AS column_name")[0] for s in resp.segments if "email" in s.sql}
        assert any("email" in s.sql for s in resp.segments)
        assert any("id" in s.sql for s in resp.segments)


# ─── source=database 反射 ────────────────────────────────
class TestDatabaseSource:
    def _refl_conn(self, tables):
        def rows_for(sql, p):
            if "information_schema.tables" in sql.lower():
                return [(t,) for t in tables]
            return []
        return FakeConn(rows_for=rows_for)

    def test_reflects_all_tables(self):
        conn = self._refl_conn(["users", "orders"])
        req = _req(
            sourceType="database", database="db1", tables=None,
            metricIds=["row_count"], columns=None,
        )
        resp = generate(req, conn, "mysql", METRICS, [])
        assert len(resp.segments) == 2  # 每表一段

    def test_too_many_tables_raises(self, monkeypatch):
        from app.services import dataprofile_generate as gen_mod
        monkeypatch.setattr(gen_mod, "PROFILE_MAX_TABLES", 5)
        conn = self._refl_conn([f"t{i}" for i in range(6)])
        req = _req(
            sourceType="database", database="db1", tables=None,
            metricIds=["row_count"], columns=None,
        )
        with pytest.raises(GenerateError):
            generate(req, conn, "mysql", METRICS, [])


# ─── 自定义规则 LLM 仿写 ────────────────────────────────
class TestCustomRule:
    def test_custom_success(self):
        rule = _rule()
        req = _req(metricIds=[], customRuleIds=[rule.id])
        resp = generate(req, None, "mysql", METRICS, [rule], chat_fn=_chat_ok, explain_fn=_explain_ok)
        assert resp.refused is False
        assert len(resp.segments) == 1
        assert resp.segments[0].source == "custom"
        assert resp.validation.explain.ok is True

    def test_dialect_mismatch_partial(self):
        rule = _rule(dialect="hive")
        req = _req(metricIds=[], customRuleIds=[rule.id])
        resp = generate(req, None, "mysql", METRICS, [rule], chat_fn=_chat_ok, explain_fn=_explain_ok)
        assert len(resp.segments) == 0
        assert len(resp.partialFailures) == 1
        assert "不匹配" in resp.partialFailures[0].error

    def test_llm_parse_failure_refused(self):
        rule = _rule()
        req = _req(metricIds=[], customRuleIds=[rule.id])

        def bad_chat(s, u):
            return "not json"

        resp = generate(req, None, "mysql", METRICS, [rule], chat_fn=bad_chat, explain_fn=_explain_ok)
        assert resp.refused is True  # 全失败
        assert len(resp.segments) == 0

    def test_llm_refusal_empty_sql_refused(self):
        rule = _rule()
        req = _req(metricIds=[], customRuleIds=[rule.id])

        def refuse_chat(s, u):
            return json.dumps({"sql": ""})

        resp = generate(req, None, "mysql", METRICS, [rule], chat_fn=refuse_chat, explain_fn=_explain_ok)
        assert resp.refused is True

    def test_analyze_failure_partial(self):
        rule = _rule()
        req = _req(metricIds=[], customRuleIds=[rule.id])

        def delete_chat(s, u):
            return json.dumps({"sql": "DELETE FROM db1.users"})

        resp = generate(req, None, "mysql", METRICS, [rule], chat_fn=delete_chat, explain_fn=_explain_ok)
        assert len(resp.partialFailures) == 1
        assert "静态分析" in resp.partialFailures[0].error

    def test_explain_failure_partial(self):
        rule = _rule()
        req = _req(metricIds=[], customRuleIds=[rule.id])

        def fail_explain(sql):
            return False, "syntax error near ..."

        resp = generate(req, None, "mysql", METRICS, [rule], chat_fn=_chat_ok, explain_fn=fail_explain)
        assert len(resp.segments) == 0
        assert len(resp.partialFailures) == 1
        assert "EXPLAIN" in resp.partialFailures[0].error

    def test_llm_client_error_propagates(self):
        from app.services.llm_client import LLMClientError

        rule = _rule()
        req = _req(metricIds=[], customRuleIds=[rule.id])

        def err_chat(s, u):
            raise LLMClientError("LLM 调用失败：APITimeoutError: timed out")

        with pytest.raises(LLMClientError):
            generate(req, None, "mysql", METRICS, [rule], chat_fn=err_chat, explain_fn=_explain_ok)


# ─── 混合：内置 + 自定义 ────────────────────────────────
class TestMixed:
    def test_builtin_plus_custom_merge(self):
        rule = _rule()
        req = _req(
            metricIds=["row_count"], customRuleIds=[rule.id],
            columns={"db1.users": ["email"]}, outputMode="merge",
        )
        resp = generate(req, None, "mysql", METRICS, [rule], chat_fn=_chat_ok, explain_fn=_explain_ok)
        assert len(resp.segments) == 1  # 合并
        assert "UNION ALL" in resp.segments[0].sql
        assert resp.segments[0].source == "custom"  # 含自定义

    def test_builtin_delivers_when_custom_partial(self):
        # 自定义失败但内置成功 -> 非 refused，内置段交付
        rule = _rule()
        req = _req(metricIds=["null_rate"], customRuleIds=[rule.id])

        def bad_chat(s, u):
            return "not json"

        resp = generate(req, None, "mysql", METRICS, [rule], chat_fn=bad_chat, explain_fn=_explain_ok)
        assert resp.refused is False
        assert len(resp.segments) == 1  # 内置 null_rate 交付
        assert len(resp.partialFailures) == 1  # 自定义失败
        assert resp.validation.passed is False


# ─── 前置校验 ──────────────────────────────────────────
class TestValidation:
    def test_no_metric_no_rule_raises(self):
        with pytest.raises(GenerateError):
            generate(_req(metricIds=[], customRuleIds=[]), None, "mysql", METRICS, [])

    def test_tables_source_empty_tables_raises(self):
        with pytest.raises(GenerateError):
            generate(_req(sourceType="tables", tables=None, metricIds=["row_count"]), None, "mysql", METRICS, [])


# ─── 回归修复（审计发现） ──────────────────────────────
class TestAuditFixes:
    def test_regex_match_missing_param_is_partial_not_500(self):
        # PG #12: metricParams=None（字段默认值）+ regex_match 应归 partialFailure，
        # 而非 AttributeError 上抛 -> 路由 500。混一个成功指标以便观察为 partial。
        req = _req(metricIds=["null_rate", "regex_match"], columns={"db1.users": ["email"]})
        assert req.metricParams is None  # 默认 None，复现崩溃路径
        resp = generate(req, None, "mysql", METRICS, [])
        assert resp.refused is False  # null_rate 成功，非全失败
        assert len(resp.segments) == 1  # null_rate 段交付
        assert len(resp.partialFailures) == 1  # regex_match 缺参 -> partial
        err = resp.partialFailures[0].error
        assert "正则" in err or "regex" in err

    def test_regex_match_with_param_succeeds(self):
        req = _req(
            metricIds=["regex_match"],
            columns={"db1.users": ["email"]},
            metricParams={"regex_match": "^[0-9]+$"},
        )
        resp = generate(req, None, "mysql", METRICS, [])
        assert resp.refused is False
        assert len(resp.segments) == 1
        assert "REGEXP" in resp.segments[0].sql

    def test_audit_log_records_hash_metrics_no_sql_leak(self, caplog):
        # PG #7: §8.3 审计记录请求 hash + 指标 + 是否 refused；不记 SQL 原文。
        import logging

        req = _req(metricIds=["null_rate"])
        with caplog.at_level(logging.INFO, logger="app.services.dataprofile_generate"):
            resp = generate(req, None, "mysql", METRICS, [])
        assert resp.refused is False
        audit = [r for r in caplog.records if "dataprofile.audit" in r.getMessage()]
        assert len(audit) == 1
        msg = audit[0].getMessage()
        assert "hash=" in msg
        assert "null_rate" in msg  # 指标 id（非 SQL）
        assert "refused=False" in msg
        # 不记 SQL 原文与生成内容
        assert "SELECT" not in msg
        assert "CAST" not in msg

    def test_audit_log_refused_path(self, caplog):
        import logging

        rule = _rule()
        req = _req(metricIds=[], customRuleIds=[rule.id])

        def bad_chat(s, u):
            return "not json"  # 解析失败 -> partialFailure；但仅自定义且全失败 -> refused

        with caplog.at_level(logging.INFO, logger="app.services.dataprofile_generate"):
            resp = generate(req, None, "mysql", METRICS, [rule], chat_fn=bad_chat, explain_fn=_explain_ok)
        assert resp.refused is True
        audit = [r for r in caplog.records if "dataprofile.audit" in r.getMessage()]
        assert len(audit) == 1
        assert "refused=True" in audit[0].getMessage()

    def test_audit_log_llm_upstream_error(self, caplog):
        # §8.3：LLM 上游不可用（LLMClientError）raise 前须审计整体失败，路由映射 500/504。
        import logging

        from app.services.llm_client import LLMClientError

        rule = _rule()
        req = _req(metricIds=[], customRuleIds=[rule.id])

        def unreachable(s, u):
            raise LLMClientError("upstream timeout")

        with caplog.at_level(logging.INFO, logger="app.services.dataprofile_generate"):
            with pytest.raises(LLMClientError):
                generate(req, None, "mysql", METRICS, [rule], chat_fn=unreachable)
        audit = [r for r in caplog.records if "dataprofile.audit" in r.getMessage()]
        assert len(audit) == 1
        assert "refused=True" in audit[0].getMessage()
        assert "rule_test1" in audit[0].getMessage()  # 自定义规则 id 入审计

    def test_merge_preserves_topn_limit(self):
        # PG #11: merge 刻意保留各段 ORDER BY/LIMIT（子查询包裹使其对 UNION ALL
        # 语法安全；剥离 topn_frequency 的 LIMIT 会把 TopN 退化为全量分布）。
        req = _req(
            metricIds=["topn_frequency"],
            tables=["db1.users", "db1.orders"],
            columns={"db1.users": ["email"], "db1.orders": ["status"]},
            outputMode="merge",
        )
        resp = generate(req, None, "mysql", METRICS, [])
        assert len(resp.segments) == 1
        sql = resp.segments[0].sql
        assert "UNION ALL" in sql
        assert "LIMIT" in sql  # topn 的 LIMIT 保留在子查询内
