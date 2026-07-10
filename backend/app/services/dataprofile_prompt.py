"""数据探查 - 自定义规则 LLM 提示词（PRD-dataprofile F-PG-06）。

系统提示词锁定归一化四列形状 + CAST value 为方言字符串（与内置模板对齐，
保证 merge 模式 UNION ALL 类型一致）+ 仅产出只读 SELECT + 强制 JSON 输出。
自定义规则示例 SQL 作为 few-shot（已在保存时过静态分析，不会污染）。
"""
from __future__ import annotations

from app.services.dataprofile_models import CustomRule, ProfileDialect
from app.services.dataprofile_templates import string_type


def build_system_prompt(dialect: ProfileDialect) -> str:
    """锁定归一化形状与输出契约的系统提示词。"""
    st = string_type(dialect)
    dialect_name = {"mysql": "MySQL", "postgresql": "PostgreSQL", "hive": "Hive"}[dialect]
    return (
        "你是数据质量探查 SQL 生成助手。用户给出一条自定义探查规则（描述 + 示例查询），"
        "你需要仿写示例查询的逻辑，为目标表/列产出一条归一化探查查询。\n\n"
        f"目标方言：{dialect_name}。\n\n"
        "【归一化形状契约（必须严格遵守）】\n"
        "产出的 SQL 必须是单条只读 SELECT，且列形状固定为四列：\n"
        "  SELECT '<table>' AS table_name,\n"
        "         '<column>' AS column_name,\n"
        "         '<metric>' AS metric,\n"
        f"         CAST(<value_expr> AS {st}) AS value\n"
        "  FROM <table>\n"
        "其中：\n"
        "- table_name / column_name / metric 为字符串字面量（列名/表名/规则标识）。\n"
        "- value 必须用 CAST(... AS " + st + ") 强制为字符串类型（与内置模板一致，"
        "便于合并模式 UNION ALL）。\n"
        "- <value_expr> 为仿写示例查询逻辑得到的探查表达式（如占比、计数、聚合等）。\n"
        "- 若规则针对列（示例含 {column}），column_name 填该列名；否则填空串 ''。\n"
        "- 禁止任何写操作（INSERT/UPDATE/DELETE/DDL）；禁止多语句；禁止危险函数。\n\n"
        "【输出格式】仅输出 JSON 对象，不要任何解释：\n"
        '{"sql": "完整的归一化 SELECT 语句"}\n\n'
        "若无法生成合法只读探查查询，返回 {\"sql\": \"\"}。"
    )


def build_user_message(rule: CustomRule, table: str, column: str | None) -> str:
    """构造用户消息：规则元信息 + 示例 SQL（few-shot）+ 目标表/列。"""
    col_desc = column if column else "（本规则不针对特定列，column_name 请填空串）"
    return (
        f"规则名称：{rule.name}\n"
        f"规则描述：{rule.description or '（无）'}\n"
        f"方言：{rule.dialect}\n"
        f"示例查询（仿写其逻辑，勿照抄表名/列名）：\n"
        f"{rule.exampleSql}\n\n"
        f"目标表：{table}\n"
        f"目标列：{col_desc}\n\n"
        "请仿写示例查询的探查逻辑，把 {table} 替换为目标表、{column} 替换为目标列，"
        "产出符合归一化形状的单条只读 SELECT，仅输出 JSON。"
    )
