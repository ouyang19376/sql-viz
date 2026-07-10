"""数据探查 - 探查规则库（PRD-dataprofile F-RL-01~08）。

两部分：
- 内置指标目录（F-RL-01/02）：PRD §5.3 的 10 项，只读，按 5 分类。
- 自定义规则 JSON 文件 CRUD（F-RL-03/06）：单文件 rules.json + threading.Lock，
  跨会话共享；模板渲染归 PG 模块，此处仅元数据。

校验（F-RL-04/05）：{table} 必填；{column} 视 needsColumn（由 exampleSql 自动推断）；
示例 SQL 占位符替换后过 analyzer.analyze，须为只读 SELECT，防污染 few-shot。
"""
from __future__ import annotations

import json
import threading
import time
import uuid
from pathlib import Path

from pydantic import ValidationError

from app.core.config import PROFILE_RULES_FILE
from app.services.dataprofile_analyzer import analyze
from app.services.dataprofile_models import (
    BuiltInMetric,
    CustomRule,
    CustomRuleInput,
    MetricCategory,
    ProfileDialect,
    RuleExportPayload,
    RuleImportPayload,
    RuleImportResult,
)

# ─── 内置指标目录（PRD §5.3，P0 共 10 项） ──────────────
# needsColumn: 行数/无需列；其余需列。needsParam: 仅 regex_match 需正则参数。
_BUILTIN_METRICS: list[BuiltInMetric] = [
    BuiltInMetric(
        id="row_count", name="行数", category="completeness",
        description="表的总行数 COUNT(*)", needsColumn=False,
    ),
    BuiltInMetric(
        id="null_rate", name="空值率", category="completeness",
        description="指定列的空值占比（%）", needsColumn=True,
    ),
    BuiltInMetric(
        id="distinct_count", name="去重计数", category="uniqueness",
        description="指定列的非空去重值数量", needsColumn=True,
    ),
    BuiltInMetric(
        id="duplicate_count", name="重复行数", category="uniqueness",
        description="指定列重复值对应的行数", needsColumn=True,
    ),
    BuiltInMetric(
        id="value_distribution", name="枚举分布", category="consistency",
        description="指定列各枚举值的计数分布", needsColumn=True,
    ),
    BuiltInMetric(
        id="min_max", name="极值", category="distribution",
        description="指定列的最小值与最大值", needsColumn=True,
    ),
    BuiltInMetric(
        id="numeric_stats", name="数值统计", category="distribution",
        description="指定列的 min/max/avg 等数值统计", needsColumn=True,
    ),
    BuiltInMetric(
        id="type_consistency", name="类型一致性", category="validity",
        description="指定列中含首尾空格等格式不一致的行数", needsColumn=True,
    ),
    BuiltInMetric(
        id="regex_match", name="正则合规率", category="validity",
        description="指定列匹配正则表达式的占比（需提供正则参数）",
        needsColumn=True, needsParam=True,
    ),
    BuiltInMetric(
        id="topn_frequency", name="TopN 高频值", category="distribution",
        description="指定列出现频次最高的前 N 个值", needsColumn=True,
    ),
]


def list_metrics() -> list[BuiltInMetric]:
    """内置指标目录（F-RL-01/02，只读）。"""
    return list(_BUILTIN_METRICS)


class RuleValidationError(ValueError):
    """自定义规则校验失败，承载违规原因列表（路由 422 回传）。"""

    def __init__(self, reasons: list[str]):
        super().__init__("; ".join(reasons))
        self.reasons = reasons


_TABLE_PLACEHOLDER = "{table}"
_COLUMN_PLACEHOLDER = "{column}"


def _infer_needs_column(example_sql: str) -> bool:
    """needsColumn 由 exampleSql 是否含 {column} 占位符推断（F-RL-04）。"""
    return _COLUMN_PLACEHOLDER in example_sql


def _substitute_placeholders(example_sql: str) -> str:
    """占位符 -> 合法标识符，便于 sqlglot 静态分析（F-RL-05）。

    含 {table}/{column} 的原始 SQL 无法被 sqlglot 解析；替换为 _t/_c 后再过 analyze。
    """
    return example_sql.replace(_TABLE_PLACEHOLDER, "_t").replace(_COLUMN_PLACEHOLDER, "_c")


def validate_rule(input_: CustomRuleInput) -> tuple[bool, list[str]]:
    """校验自定义规则（F-RL-04 占位符 + F-RL-05 静态分析）。

    返回 (needsColumn, reasons)：reasons 非空即校验失败。
    """
    reasons: list[str] = []
    if _TABLE_PLACEHOLDER not in input_.exampleSql:
        reasons.append("示例 SQL 必须包含 {table} 占位符")

    needs_column = _infer_needs_column(input_.exampleSql)
    if needs_column and _COLUMN_PLACEHOLDER not in input_.exampleSql:
        # 理论不可达（needs_column 由 {column} 推断），保留为防御
        reasons.append("needsColumn 推断为 True，但示例 SQL 缺少 {column} 占位符")

    # 占位符替换后过静态分析：必须为只读 SELECT
    substituted = _substitute_placeholders(input_.exampleSql)
    analysis = analyze(substituted, input_.dialect)
    if not analysis.allowed:
        reasons.append("示例 SQL 必须为只读 SELECT 查询：" + "；".join(analysis.violations))

    return needs_column, reasons


class _RuleStore:
    """自定义规则 JSON 文件存储（模块单例 store）。

    单文件 rules.json + threading.Lock 保护并发写；原子写（.tmp -> replace）。
    损坏文件降级为空列表，不阻塞启动与列表（对齐 bi_service._read_meta 健壮性）。
    """

    def __init__(self, path: Path = PROFILE_RULES_FILE) -> None:
        self._path = path
        self._lock = threading.Lock()

    def list_rules(self) -> list[CustomRule]:
        return self._load()

    def create_rule(self, input_: CustomRuleInput) -> CustomRule:
        needs_column, reasons = validate_rule(input_)
        if reasons:
            raise RuleValidationError(reasons)
        now = int(time.time())
        rule = CustomRule(
            id="rule_" + uuid.uuid4().hex[:8],
            name=input_.name,
            description=input_.description,
            exampleSql=input_.exampleSql,
            dialect=input_.dialect,
            needsColumn=needs_column,
            createdAt=now,
            updatedAt=now,
        )
        with self._lock:
            rules = self._load()
            rules.append(rule)
            self._save(rules)
        return rule

    def update_rule(self, rule_id: str, input_: CustomRuleInput) -> CustomRule:
        needs_column, reasons = validate_rule(input_)
        if reasons:
            raise RuleValidationError(reasons)
        with self._lock:
            rules = self._load()
            for i, r in enumerate(rules):
                if r.id == rule_id:
                    updated = r.model_copy(
                        update={
                            "name": input_.name,
                            "description": input_.description,
                            "exampleSql": input_.exampleSql,
                            "dialect": input_.dialect,
                            "needsColumn": needs_column,
                            "updatedAt": int(time.time()),
                        }
                    )
                    rules[i] = updated
                    self._save(rules)
                    return updated
            raise KeyError(rule_id)

    def delete_rule(self, rule_id: str) -> bool:
        with self._lock:
            rules = self._load()
            for i, r in enumerate(rules):
                if r.id == rule_id:
                    del rules[i]
                    self._save(rules)
                    return True
            return False

    def export_rules(self) -> RuleExportPayload:
        """F-RL-08：导出全部规则集。"""
        return RuleExportPayload(
            version=1,
            rules=self._load(),
            exportedAt=int(time.time()),
        )

    def import_rules(self, payload: RuleImportPayload) -> RuleImportResult:
        """F-RL-08：upsert by id。同 id 覆盖(updated)，新 id 追加(created)，非法跳过(skipped)。

        导入路径同样过 validate_rule（F-RL-05 / §8.3 few-shot 污染防护）：
        含危险 SQL 的规则计 skipped 不入库，避免污染生成 few-shot。
        """
        created = updated = skipped = 0
        with self._lock:
            rules = self._load()
            index = {r.id: i for i, r in enumerate(rules)}
            for incoming in payload.rules:
                if not isinstance(incoming, CustomRule):
                    skipped += 1
                    continue
                # 复用入参模型校验（长度约束）+ 占位符/只读静态分析
                try:
                    input_ = CustomRuleInput(
                        name=incoming.name,
                        description=incoming.description,
                        exampleSql=incoming.exampleSql,
                        dialect=incoming.dialect,
                    )
                except ValidationError:
                    skipped += 1
                    continue
                _, reasons = validate_rule(input_)
                if reasons:
                    skipped += 1
                    continue
                if incoming.id in index:
                    rules[index[incoming.id]] = incoming
                    updated += 1
                else:
                    rules.append(incoming)
                    index[incoming.id] = len(rules) - 1
                    created += 1
            self._save(rules)
        return RuleImportResult(created=created, updated=updated, skipped=skipped)

    # ─── 文件读写（调用方持锁） ───────────────────────────
    def _load(self) -> list[CustomRule]:
        if not self._path.exists():
            return []
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
            return [CustomRule.model_validate(item) for item in data]
        except (json.JSONDecodeError, ValueError, TypeError):
            # 损坏文件降级为空，不阻塞列表/启动
            return []

    def _save(self, rules: list[CustomRule]) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        # 原子写：先写 .tmp 再 rename，避免并发读半截 JSON
        tmp = self._path.with_suffix(".json.tmp")
        tmp.write_text(
            json.dumps([r.model_dump(mode="json") for r in rules], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        tmp.replace(self._path)


# 模块级单例
store = _RuleStore()
