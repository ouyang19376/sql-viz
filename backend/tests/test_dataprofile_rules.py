"""数据探查 - 探查规则库测试（F-RL-01~08）。

无实库：纯函数 + tmp_path 隔离 _RuleStore 路径（避免污染真实 rules.json）。
每用例用独立 _RuleStore 实例 + tmp 路径，避免跨用例污染。
"""
import json

import pytest

from app.services.dataprofile_models import (
    BuiltInMetric,
    CustomRule,
    CustomRuleInput,
    RuleImportPayload,
)
from app.services.dataprofile_rules import (
    RuleValidationError,
    _RuleStore,
    list_metrics,
    validate_rule,
)


def _input(name="空值率规则", sql="SELECT COUNT(*) FROM {table} WHERE {column} IS NULL", dialect="mysql"):
    return CustomRuleInput(
        name=name,
        description="检查列空值",
        exampleSql=sql,
        dialect=dialect,
    )


def _store(tmp_path):
    """tmp 路径隔离的 store，避免污染真实 rules.json。"""
    return _RuleStore(path=tmp_path / "rules.json")


# ─── 内置指标目录（F-RL-01/02） ─────────────────────────
class TestBuiltinMetrics:
    def test_ten_metrics(self):
        metrics = list_metrics()
        assert len(metrics) == 10

    def test_five_categories_covered(self):
        cats = {m.category for m in list_metrics()}
        assert cats == {"completeness", "uniqueness", "validity", "consistency", "distribution"}

    def test_needs_column_flags(self):
        by_id = {m.id: m for m in list_metrics()}
        assert by_id["row_count"].needsColumn is False
        assert by_id["null_rate"].needsColumn is True

    def test_regex_match_needs_param(self):
        by_id = {m.id: m for m in list_metrics()}
        assert by_id["regex_match"].needsParam is True
        # 其余均不需要参数
        assert all(m.needsParam is False for m in list_metrics() if m.id != "regex_match")

    def test_ids_unique(self):
        ids = [m.id for m in list_metrics()]
        assert len(ids) == len(set(ids))


# ─── 校验（F-RL-04 占位符 / F-RL-05 静态分析） ──────────
class TestValidateRule:
    def test_valid_select_passes(self):
        needs, reasons = validate_rule(_input())
        assert reasons == []
        assert needs is True  # 含 {column}

    def test_missing_table_placeholder_rejected(self):
        needs, reasons = validate_rule(_input(sql="SELECT COUNT(*) FROM users"))
        assert any("{table}" in r for r in reasons)

    def test_needs_column_inferred_false_without_column(self):
        needs, reasons = validate_rule(
            _input(sql="SELECT COUNT(*) FROM {table}")
        )
        assert reasons == []
        assert needs is False

    def test_dml_example_rejected(self):
        # F-RL-05：示例含 DELETE 须拒，防污染 few-shot
        needs, reasons = validate_rule(
            _input(sql="DELETE FROM {table} WHERE {column} IS NULL")
        )
        assert len(reasons) > 0
        assert any("只读 SELECT" in r or "DELETE" in r for r in reasons)

    def test_dialect_specific_valid(self):
        # hive 方言的合法示例
        needs, reasons = validate_rule(
            _input(sql="SELECT COUNT(*) FROM {table} WHERE {column} IS NULL", dialect="hive")
        )
        assert reasons == []


# ─── CRUD + 持久化（F-RL-03/06） ────────────────────────
class TestRuleStoreCRUD:
    def test_create_and_list(self, tmp_path):
        s = _store(tmp_path)
        rule = s.create_rule(_input())
        assert rule.id.startswith("rule_")
        assert rule.createdAt == rule.updatedAt
        assert rule.needsColumn is True
        listed = s.list_rules()
        assert len(listed) == 1 and listed[0].id == rule.id

    def test_create_invalid_raises(self, tmp_path):
        s = _store(tmp_path)
        with pytest.raises(RuleValidationError) as ei:
            s.create_rule(_input(sql="DELETE FROM {table}"))
        assert ei.value.reasons  # 带原因

    def test_update_preserves_createdAt(self, tmp_path):
        s = _store(tmp_path)
        rule = s.create_rule(_input(name="旧名"))
        updated = s.update_rule(rule.id, _input(name="新名"))
        assert updated.name == "新名"
        assert updated.createdAt == rule.createdAt  # 创建时间不变
        assert updated.updatedAt >= rule.updatedAt

    def test_update_unknown_raises_keyerror(self, tmp_path):
        with pytest.raises(KeyError):
            _store(tmp_path).update_rule("rule_nope", _input())

    def test_update_invalid_raises_validation(self, tmp_path):
        s = _store(tmp_path)
        rule = s.create_rule(_input())
        with pytest.raises(RuleValidationError):
            s.update_rule(rule.id, _input(sql="DROP TABLE {table}"))

    def test_delete(self, tmp_path):
        s = _store(tmp_path)
        rule = s.create_rule(_input())
        assert s.delete_rule(rule.id) is True
        assert s.list_rules() == []
        assert s.delete_rule(rule.id) is False  # 再删返回 False


class TestPersistence:
    def test_persisted_across_instances(self, tmp_path):
        """F-RL-06：跨实例（会话）共享同一文件。"""
        path = tmp_path / "rules.json"
        s1 = _RuleStore(path=path)
        s1.create_rule(_input(name="规则A"))
        # 新实例读同一文件 -> 规则在
        s2 = _RuleStore(path=path)
        names = [r.name for r in s2.list_rules()]
        assert "规则A" in names

    def test_corrupt_file_degrades_to_empty(self, tmp_path):
        """损坏文件降级 []，不阻塞列表（对齐 bi_service 健壮性）。"""
        path = tmp_path / "rules.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("{not valid json", encoding="utf-8")
        s = _RuleStore(path=path)
        assert s.list_rules() == []
        # 写入后应恢复正常
        s.create_rule(_input())
        assert len(s.list_rules()) == 1

    def test_atomic_write(self, tmp_path):
        """原子写：保存后无 .tmp 残留，且文件为合法 JSON。"""
        path = tmp_path / "rules.json"
        s = _RuleStore(path=path)
        s.create_rule(_input())
        assert not path.with_suffix(".json.tmp").exists()  # 无残留
        data = json.loads(path.read_text(encoding="utf-8"))
        assert len(data) == 1


# ─── 导入导出（F-RL-08） ────────────────────────────────
class TestImportExport:
    def test_export_round_trip(self, tmp_path):
        s = _store(tmp_path)
        s.create_rule(_input(name="A"))
        s.create_rule(_input(name="B"))
        payload = s.export_rules()
        assert payload.version == 1
        assert len(payload.rules) == 2

    def test_import_upsert_by_id(self, tmp_path):
        s = _store(tmp_path)
        existing = s.create_rule(_input(name="原名"))
        # 构造导入：1 个同 id（更新）+ 1 个新 id（新增）
        incoming_same = existing.model_copy(update={"name": "改名"})
        incoming_new = CustomRule(
            id="rule_new1111", name="新规则", description="d",
            exampleSql="SELECT COUNT(*) FROM {table} WHERE {column} IS NULL",
            dialect="mysql", needsColumn=True, createdAt=1, updatedAt=1,
        )
        result = s.import_rules(RuleImportPayload(rules=[incoming_same, incoming_new]))
        assert result.created == 1
        assert result.updated == 1
        assert result.skipped == 0
        names = {r.name for r in s.list_rules()}
        assert "改名" in names and "新规则" in names

    def test_import_empty_payload(self, tmp_path):
        s = _store(tmp_path)
        s.create_rule(_input())
        result = s.import_rules(RuleImportPayload(rules=[]))
        assert result.created == 0 and result.updated == 0
        assert len(s.list_rules()) == 1  # 原有不受影响

    def test_import_skips_dangerous_sql(self, tmp_path):
        # RL #10 / §8.3：导入路径同样过静态分析，含 DELETE 的规则计 skipped 不入库，
        # 避免污染生成 few-shot。
        s = _store(tmp_path)
        dangerous = CustomRule(
            id="rule_evil111", name="坏规则", description="d",
            exampleSql="DELETE FROM {table} WHERE {column} IS NULL",
            dialect="mysql", needsColumn=True, createdAt=1, updatedAt=1,
        )
        good = CustomRule(
            id="rule_ok00001", name="好规则", description="d",
            exampleSql="SELECT COUNT(*) FROM {table} WHERE {column} IS NULL",
            dialect="mysql", needsColumn=True, createdAt=1, updatedAt=1,
        )
        result = s.import_rules(RuleImportPayload(rules=[dangerous, good]))
        assert result.created == 1  # 仅好规则入库
        assert result.skipped == 1  # 坏规则被跳过
        names = {r.name for r in s.list_rules()}
        assert "好规则" in names
        assert "坏规则" not in names

    def test_import_skips_missing_table_placeholder(self, tmp_path):
        # RL #10：缺 {table} 占位符的规则也被跳过
        s = _store(tmp_path)
        no_placeholder = CustomRule(
            id="rule_no_tbl11", name="无占位", description="d",
            exampleSql="SELECT COUNT(*) FROM users",  # 缺 {table}
            dialect="mysql", needsColumn=False, createdAt=1, updatedAt=1,
        )
        result = s.import_rules(RuleImportPayload(rules=[no_placeholder]))
        assert result.skipped == 1
        assert result.created == 0
        assert s.list_rules() == []
