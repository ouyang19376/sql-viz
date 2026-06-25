"""SQL 血缘分析服务（F-BK-02 / F-BK-03 / F-BK-05 / F-BK-06）。"""
from __future__ import annotations

import json
import logging

from pydantic import ValidationError

from app.services.lineage_models import (
    LineageAnalysisResult,
    LineageAnalyzeRefused,
    LineageAnalyzeRequest,
    LineageAnalyzeResponse,
    LineageAnalyzeSuccess,
    LineageDependency,
    LineageTableNode,
    fallback_refused,
)
from app.services.lineage_parser import ParserLineageDraft, normalize_table_name, parse_sql, split_table_parts
from app.services.lineage_prompt import SYSTEM_PROMPT, build_user_message
from app.services.llm_client import LLMClientError, chat_json

logger = logging.getLogger(__name__)


def analyze_lineage(req: LineageAnalyzeRequest) -> LineageAnalyzeResponse:
    """主入口：Parser 初步解析 + LLM 归并；LLM 失败时返回 parser-only 部分成功。"""
    draft = parse_sql(req.sql, req.dialect)
    parser_result = _result_from_parser(req, draft)

    if _looks_non_sql(req.sql) and not parser_result.tables:
        return fallback_refused()

    # user_message 含 SQL 原文（仅作为数据）；F-LM-05 要求禁止记录该内容。
    user_message = build_user_message(req, draft)
    try:
        raw = chat_json(SYSTEM_PROMPT, user_message)
    except LLMClientError:
        raise
    except Exception as exc:
        logger.warning("lineage llm unexpected error: %s", exc)
        parser_result.warnings.append("LLM 结构归并失败，当前结果仅基于基础 parser，需人工复核。")
        return LineageAnalyzeSuccess(result=parser_result)

    parsed = _parse_llm_output(raw)
    if isinstance(parsed, LineageAnalyzeRefused):
        if parser_result.tables:
            parser_result.warnings.append("LLM 拒绝或未能归并，当前结果仅基于基础 parser，需人工复核。")
            return LineageAnalyzeSuccess(result=parser_result)
        return parsed

    valid = _normalize_result(parsed.result, req.dialect)
    if not valid.tables and parser_result.tables:
        parser_result.warnings.append("LLM 输出为空，当前结果仅基于基础 parser，需人工复核。")
        return LineageAnalyzeSuccess(result=parser_result)
    return LineageAnalyzeSuccess(result=valid)


def _parse_llm_output(raw: str) -> LineageAnalyzeResponse:
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError:
        return fallback_refused()
    if not isinstance(obj, dict):
        return fallback_refused()
    if obj.get("refused") is True:
        return fallback_refused()
    if obj.get("refused") is False:
        try:
            return LineageAnalyzeSuccess.model_validate(obj)
        except ValidationError as exc:
            logger.info("lineage llm schema invalid: %s", exc)
            return fallback_refused()
    return fallback_refused()


def _result_from_parser(req: LineageAnalyzeRequest, draft: ParserLineageDraft) -> LineageAnalysisResult:
    tables = []
    for item in draft.tables.values():
        database, schema = split_table_parts(item.name)
        tables.append(
            LineageTableNode(
                id=item.id,
                name=item.name,
                type=item.type,  # type: ignore[arg-type]
                database=database,
                schema=schema,
                statementIndexes=sorted(item.statement_indexes),
            )
        )

    dependencies = [
        LineageDependency(
            id=f"dep-{idx}",
            source=dep.source,
            target=dep.target,
            kind=dep.kind,  # type: ignore[arg-type]
            statementIndex=dep.statement_index,
            lineStart=dep.line_start,
            lineEnd=dep.line_end,
            description=f"目标表 {dep.target} 读取 {dep.source}",
            confidence=0.72,
        )
        for idx, dep in enumerate(draft.dependencies, start=1)
    ]
    unique_warnings = list(dict.fromkeys(draft.warnings))
    return _normalize_result(
        LineageAnalysisResult(
            summary=_build_summary(tables, dependencies),
            dialect=req.dialect,
            tables=tables,
            dependencies=dependencies,
            warnings=unique_warnings,
        ),
        req.dialect,
    )


def _normalize_result(result: LineageAnalysisResult, dialect: str) -> LineageAnalysisResult:
    table_map: dict[str, LineageTableNode] = {}
    warnings = list(result.warnings)
    for table in result.tables:
        table_id = _normalized_id(table.id)
        table_name = _normalized_id(table.name)
        database, schema = split_table_parts(table_name)
        table_map[table_id] = LineageTableNode(
            id=table_id,
            name=table_name,
            type=table.type,
            database=table.database if table.database is not None else database,
            schema=table.schema if table.schema is not None else schema,
            alias=table.alias,
            statementIndexes=sorted(set(table.statementIndexes)),
        )

    dependencies: list[LineageDependency] = []
    seen_deps: set[tuple[str, str, str, int | None]] = set()
    for dep in result.dependencies:
        source = _normalized_id(dep.source)
        target = _normalized_id(dep.target)
        for node_id in (source, target):
            if node_id not in table_map:
                table_map[node_id] = LineageTableNode(id=node_id, name=node_id, type="unknown")
                warnings.append(f"依赖中出现未在表清单声明的表 {node_id}，已标记为 unknown。")
        key = (source, target, dep.kind, dep.statementIndex)
        if key in seen_deps:
            continue
        seen_deps.add(key)
        dependencies.append(dep.model_copy(update={"source": source, "target": target}))

    tables = sorted(table_map.values(), key=lambda item: item.name)
    dependencies = [dep.model_copy(update={"id": f"dep-{idx}"}) for idx, dep in enumerate(dependencies, start=1)]
    return LineageAnalysisResult(
        summary=result.summary or _build_summary(tables, dependencies),
        dialect=dialect,  # type: ignore[arg-type]
        tables=tables,
        dependencies=dependencies,
        warnings=list(dict.fromkeys(warnings)),
    )


def _normalized_id(value: str) -> str:
    return normalize_table_name(value)


def _build_summary(tables: list[LineageTableNode], deps: list[LineageDependency]) -> str:
    targets = {dep.target for dep in deps}
    sources = {dep.source for dep in deps}
    if deps:
        return f"从 {len(sources)} 张源表生成 {len(targets)} 张目标表，共识别 {len(deps)} 条依赖关系。"
    return f"识别出 {len(tables)} 张表，暂未识别到明确依赖关系。"


def _looks_non_sql(sql: str) -> bool:
    lower = sql.lower()
    return not any(token in lower for token in ("select", "insert", "create", "from", "join", "with"))
