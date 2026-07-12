"""RAG for NL2SQL - 文本块生成（PRD-rag-sql F-CK-02/03/09，API-CK-01）。

两段式（PRD §10 A13）：
1. sqlglot 结构化解析（零 LLM）：抽表名 / 列 / 类型 / 注释 / 可空 / 分区；
2. LLM 仅做语义增强（中文名 / 主题域 / 描述 / 关键列 / 粒度），减幻觉。

可测试性：chunk_ddl 接收 chat_fn（默认 llm_client.chat_json），测试注入 mock。
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Callable, Optional

import sqlglot
from sqlglot import exp

from app.services.rag_sql_models import (
    ChunkResponse,
    TableChunk,
    TableFieldDetail,
    TableSummary,
)

logger = logging.getLogger(__name__)

# sqlglot 解析方言尝试顺序（嗅探优先，余下兜底）。
# 注意：sqlglot 方言名是 "postgres"（非 "postgresql"，后者会触发 Unknown dialect
# ValueError 被吞掉，PG 兜底形同虚设）；与 dataprofile_analyzer._DIALECT_MAP 对齐。
_DIALECT_FALLBACK = ["mysql", "hive", "postgres", None]


@dataclass
class _ParsedField:
    name: str
    type: str
    comment: Optional[str] = None
    nullable: bool = True


@dataclass
class _ParsedTable:
    tableName: str
    tableComment: Optional[str] = None
    fields: list[_ParsedField] = field(default_factory=list)
    partitionFields: list[str] = field(default_factory=list)


def _sniff_dialect(ddl: str) -> Optional[str]:
    """粗嗅探 DDL 方言（plan §6.2 #2）：反引号/ENGINE -> mysql；partition by/STRING -> hive。"""
    upper = ddl.upper()
    if "`" in ddl or "ENGINE=" in upper or "CHARSET=" in upper:
        return "mysql"
    if "PARTITIONED BY" in upper or "STRING" in upper or "ROW FORMAT" in upper:
        return "hive"
    return None


def _extract_table(stmt: exp.Expression) -> Optional[_ParsedTable]:
    """从单条 sqlglot 语句抽 _ParsedTable；非 CREATE TABLE 返回 None。"""
    create = stmt.find(exp.Create)
    if not create or create.args.get("kind") != "TABLE":
        return None
    tbl = create.find(exp.Table)
    if tbl is None or not tbl.name:
        return None

    # 分区列名（Hive PARTITIONED BY）--先收集，字段列表中剔除（归入 partitionField）
    partition_fields: list[str] = []
    for p in create.find_all(exp.PartitionedByProperty):
        for cd in p.find_all(exp.ColumnDef):
            if cd.this and cd.this.name:
                partition_fields.append(cd.this.name)
    part_set = set(partition_fields)

    fields: list[_ParsedField] = []
    for cd in create.find_all(exp.ColumnDef):
        if cd.this is None or not cd.this.name:
            continue
        name = cd.this.name
        if name in part_set:
            continue  # 分区列不进 fields（归 summary.partitionField）
        kind = cd.args.get("kind")
        ctype = str(kind).strip() if kind else ""
        comment: Optional[str] = None
        nullable = True
        for cc in cd.args.get("constraints") or []:
            ck = cc.args.get("kind")
            cn = type(ck).__name__
            if cn == "CommentColumnConstraint":
                lit = ck.this
                comment = lit.this if isinstance(lit, exp.Literal) else (str(lit) if lit else None)
            elif cn == "NotNullColumnConstraint":
                nullable = False
        fields.append(_ParsedField(name=name, type=ctype, comment=comment, nullable=nullable))

    # 表级注释（COMMENT='...'）
    table_comment: Optional[str] = None
    for c in create.find_all(exp.Comment):
        # 表注释直接挂在 Create 下（列注释是 CommentColumnConstraint，非 exp.Comment）
        lit = c.this
        if isinstance(lit, exp.Literal):
            table_comment = lit.this
            break

    return _ParsedTable(
        tableName=tbl.name,
        tableComment=table_comment,
        fields=fields,
        partitionFields=partition_fields,
    )


def parse_ddl(ddl: str) -> list[_ParsedTable]:
    """sqlglot 解析 DDL，支持多表（F-CK-01）；方言嗅探 + 兜底链。

    任一方言解析出 ≥1 张 CREATE TABLE 即采用；全部方言无 Create -> 返回 []（F-CK-09 降级）。
    """
    sniffed = _sniff_dialect(ddl)
    order = [d for d in [sniffed] + _DIALECT_FALLBACK if d is not None]
    # 去重保序（None 放最后作终极兜底）
    seen: set = set()
    ordered: list = []
    for d in order:
        if d not in seen:
            seen.add(d)
            ordered.append(d)
    ordered.append(None)
    for read in ordered:
        try:
            stmts = sqlglot.parse(ddl, read=read)
        except Exception:
            continue
        tables: list[_ParsedTable] = []
        for st in stmts:
            if st is None:
                continue
            t = _extract_table(st)
            if t is not None:
                tables.append(t)
        if tables:
            return tables
    return []


def build_raw_text(summary: TableSummary, fields: list[TableFieldDetail]) -> str:
    """拼接可入 RAG 的文本块原文（PRD §6.2 示例形状：表概要 + 表结构详情）。"""
    lines: list[str] = ["### 表概要"]
    lines.append(f"表名：{summary.tableName}")
    lines.append(f"中文名：{summary.chineseName or '—'}")
    lines.append(f"主题域：{summary.topic or '—'}")
    lines.append(f"描述：{summary.description or '—'}")
    kf = summary.keyFields
    lines.append(f"关键列：{', '.join(kf) if kf else '—'}")
    lines.append(f"分区字段：{summary.partitionField or '—'}")
    lines.append(f"数据粒度：{summary.granularity or '—'}")
    lines.append("")
    lines.append("### 表结构详情")
    lines.append("| 字段 | 类型 | 可空 | 注释 |")
    lines.append("| --- | --- | --- | --- |")
    for f in fields:
        lines.append(f"| {f.name} | {f.type} | {'是' if f.nullable else '否'} | {f.comment or ''} |")
    return "\n".join(lines)


_ENHANCE_SYSTEM = """你是数据仓库建模专家。给定建表语句的结构化解析结果（表名/表注释/字段/分区），
请推断并补充中文语义信息，用于 RAG 检索。仅返回 JSON 对象，不要任何解释或 markdown。

JSON 字段：
- chineseName: 表的中文名
- topic: 主题域（如 交易域/用户域/营销域/流量域）
- description: 表用途的一句话描述
- keyFields: 关键字段名数组（业务主键/常用维度/度量，必须从给定字段名中选取，不可杜撰）
- partitionField: 分区字段名（给定分区字段则原样回填，否则 null）
- granularity: 数据粒度（一行代表什么，如「一行代表一个订单中的一个 SKU」）
- fieldExtras: 对象，键为给定字段名，值为该字段的业务含义补充（如「可关联用户维度表」），无补充则不写该键"""


def _build_enhance_user(t: _ParsedTable) -> str:
    flds = "\n".join(
        f"- {f.name}（{f.type}，{'可空' if f.nullable else '非空'}）{f.comment or ''}"
        for f in t.fields
    )
    return (
        f"表名：{t.tableName}\n"
        f"表注释：{t.tableComment or '无'}\n"
        f"字段：\n{flds}\n"
        f"分区字段：{', '.join(t.partitionFields) if t.partitionFields else '无'}\n"
        "请输出 JSON。"
    )


def _enhance_one(
    t: _ParsedTable, chat_fn: Callable[[str, str], str]
) -> tuple[TableSummary, list[TableFieldDetail]]:
    """LLM 语义增强单表；失败降级为最小 summary（仅 tableName + partitionField，缺字段手补）。"""
    partition_field = ", ".join(t.partitionFields) if t.partitionFields else None
    fields = [
        TableFieldDetail(name=f.name, type=f.type, comment=f.comment, nullable=f.nullable)
        for f in t.fields
    ]
    fallback_summary = TableSummary(
        tableName=t.tableName, partitionField=partition_field
    )
    valid_names = {f.name for f in t.fields}

    try:
        raw = chat_fn(_ENHANCE_SYSTEM, _build_enhance_user(t))
        data = json.loads(raw)
    except Exception as exc:  # noqa: BLE001 - LLM 失败/JSON 不符统一降级
        logger.warning("enhance LLM failed for %s: %s", t.tableName, exc)
        return fallback_summary, fields

    if not isinstance(data, dict):
        return fallback_summary, fields

    key_fields = data.get("keyFields")
    if isinstance(key_fields, list):
        key_fields = [k for k in key_fields if isinstance(k, str) and k in valid_names]
        if not key_fields:
            key_fields = None
    else:
        key_fields = None

    summary = TableSummary(
        tableName=t.tableName,
        chineseName=_opt_str(data.get("chineseName")),
        topic=_opt_str(data.get("topic")),
        description=_opt_str(data.get("description")) or t.tableComment,
        keyFields=key_fields,
        partitionField=_opt_str(data.get("partitionField")) or partition_field,
        granularity=_opt_str(data.get("granularity")),
    )

    extras = data.get("fieldExtras")
    if isinstance(extras, dict):
        for f in fields:
            extra = _opt_str(extras.get(f.name))
            if extra:
                f.extra = extra
    return summary, fields


def _opt_str(v) -> Optional[str]:
    if isinstance(v, str) and v.strip():
        return v.strip()
    return None


# sqlglot 解析失败的 LLM 兜底系统词（plan §6.2 #3：整段交 LLM 自由解析）
_LLM_PARSE_SYSTEM = """你是数据仓库建模专家。给定一段建表语句文本（可能含语法瑕疵或非标准方言），
请尽力解析出其中所有表的结构化信息，用于 RAG 检索。仅返回 JSON 对象，不要任何解释或 markdown。

JSON 格式：
{"tables": [{
  "tableName": "表名",
  "chineseName": "表中文名（可选）",
  "topic": "主题域（可选，如交易域/用户域）",
  "description": "表用途一句话描述（可选）",
  "keyFields": ["关键字段名数组，必须从下方 fields 的 name 中选取，不可杜撰"],
  "partitionField": "分区字段名（可选）",
  "granularity": "数据粒度（可选）",
  "fields": [{"name": "字段名", "type": "类型", "comment": "注释（可选）", "nullable": true}]
}]}"""


def _parse_with_llm(
    ddl: str, chat_fn: Callable[[str, str], str]
) -> Optional[list[TableChunk]]:
    """sqlglot 失败时的 LLM 兜底（plan §6.2 #3）：整段交 LLM 自由解析为结构化表。

    best-effort：LLM 一次性返回表结构 + 语义信息，不再二次增强。失败/格式不符/无有效表
    -> 返回 None（交 chunk_ddl 置 refused）。keyFields 仍按 fields 名过滤减幻觉。
    """
    try:
        raw = chat_fn(_LLM_PARSE_SYSTEM, f"建表语句：\n{ddl}\n请输出 JSON。")
        data = json.loads(raw)
    except Exception as exc:  # noqa: BLE001 - LLM 失败/JSON 不符统一兜底
        logger.warning("LLM parse fallback failed: %s", exc)
        return None
    if not isinstance(data, dict):
        return None
    tables = data.get("tables")
    if not isinstance(tables, list):
        return None

    chunks: list[TableChunk] = []
    for t in tables:
        if not isinstance(t, dict):
            continue
        name = _opt_str(t.get("tableName"))
        if not name:
            continue
        raw_fields = t.get("fields")
        if not isinstance(raw_fields, list):
            continue
        fields: list[TableFieldDetail] = []
        for f in raw_fields:
            if not isinstance(f, dict):
                continue
            fname = _opt_str(f.get("name"))
            if not fname:
                continue
            fields.append(
                TableFieldDetail(
                    name=fname,
                    type=_opt_str(f.get("type")) or "",
                    comment=_opt_str(f.get("comment")),
                    nullable=bool(f.get("nullable", True)),
                )
            )
        if not fields:
            continue
        valid_names = {f.name for f in fields}
        key_fields = t.get("keyFields")
        if isinstance(key_fields, list):
            key_fields = [k for k in key_fields if isinstance(k, str) and k in valid_names]
            if not key_fields:
                key_fields = None
        else:
            key_fields = None
        summary = TableSummary(
            tableName=name,
            chineseName=_opt_str(t.get("chineseName")),
            topic=_opt_str(t.get("topic")),
            description=_opt_str(t.get("description")),
            keyFields=key_fields,
            partitionField=_opt_str(t.get("partitionField")),
            granularity=_opt_str(t.get("granularity")),
        )
        chunks.append(
            TableChunk(
                tableName=name,
                summary=summary,
                fields=fields,
                rawText=build_raw_text(summary, fields),
            )
        )
    return chunks if chunks else None


def chunk_ddl(
    ddl: str, chat_fn: Callable[[str, str], str] = None  # type: ignore[assignment]
) -> ChunkResponse:
    """DDL -> 结构化文本块（API-CK-01）。

    chat_fn 默认 llm_client.chat_json（惰性 import 避免循环）；测试可注入 mock。
    """
    if chat_fn is None:
        from app.services.llm_client import chat_json

        chat_fn = chat_json

    tables = parse_ddl(ddl)
    if not tables:
        # sqlglot 失败 -> LLM 自由解析兜底（plan §6.2 #3）；LLM 仍无效才 refused
        llm_chunks = _parse_with_llm(ddl, chat_fn)
        if not llm_chunks:
            return ChunkResponse(
                refused=True,
                message="DDL 解析失败：sqlglot 与 LLM 均未识别到 CREATE TABLE 语句，请检查语法后重试。",
            )
        return ChunkResponse(chunks=llm_chunks)

    chunks: list[TableChunk] = []
    for t in tables:
        summary, fields = _enhance_one(t, chat_fn)
        raw = build_raw_text(summary, fields)
        chunks.append(
            TableChunk(
                tableName=t.tableName, summary=summary, fields=fields, rawText=raw
            )
        )
    return ChunkResponse(chunks=chunks)
