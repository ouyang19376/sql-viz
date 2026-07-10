"""数据探查 - 探查脚本生成编排（PRD-dataprofile F-PG-05~10，API-PG-01）。

流程（plan §5.2 流 C）：
1. 来源解析：tables 直接用；database 反射全表（≤PROFILE_MAX_TABLES，超限 GenerateError）。
2. 列解析：needsColumn 指标/规则且表未显式给列 -> 反射 list_columns。
3. 渲染：内置走 dataprofile_templates（零 LLM）；自定义走 chat_fn few-shot 仿写
   -> LLMNormalizedSegment 校验 -> 静态分析。
4. 校验：所有段过 analyze；自定义段过 explain_fn（重试≤PROFILE_GENERATE_EXPLAIN_RETRIES，
   仅超时重试，SQL 错误确定性失败不重试）。失败段 -> partialFailures，不阻断其余段。
5. 装配：split -> segments[]；merge -> UNION ALL 子查询为 1 段。
6. 全失败/LLM 拒答 -> refused。

纯编排，不触碰 HTTP/registry：conn 由路由借入（反射用），explain_fn 由路由提供
（每段独立借连接做 EXPLAIN，隔离超时）。chat_fn 默认 llm_client.chat_json，可注入测试。
"""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Callable

from app.core.config import PROFILE_GENERATE_EXPLAIN_RETRIES, PROFILE_MAX_TABLES
from app.services.dataprofile_analyzer import analyze
from app.services.dataprofile_models import (
    BuiltInMetric,
    CustomRule,
    ExplainResult,
    GenerateProfileRequest,
    GenerateProfileResponse,
    LLMNormalizedSegment,
    ProfileDialect,
    ScriptSegment,
    SqlAnalysis,
    ValidationResult,
)
from app.services.dataprofile_prompt import build_system_prompt, build_user_message
from app.services.dataprofile_schema import list_columns, list_tables
from app.services.dataprofile_templates import (
    TemplateRenderError,
    parse_table,
    render_builtin,
    validate_ident,
)
from app.services.llm_client import LLMClientError, chat_json

logger = logging.getLogger(__name__)

# 自定义段 EXPLAIN 重试上限（plan §6 难点 4）
_EXPLAIN_RETRIES = PROFILE_GENERATE_EXPLAIN_RETRIES

# chat_fn 签名：(system_prompt, user_message) -> raw_content(str)
ChatFn = Callable[[str, str], str]
# explain_fn 签名：(sql) -> (ok, error)；None 表示无需 EXPLAIN（无自定义段）
ExplainFn = Callable[[str], tuple[bool, str | None]]


def _audit(req: GenerateProfileRequest, *, refused: bool, ok_count: int, partial_count: int) -> None:
    """§8.3 审计：记录请求 hash + 指标 + 是否 refused。

    仅记录请求身份字段的哈希与指标 id，**不记 SQL 原文与生成内容**。
    """
    payload = json.dumps(
        {
            "datasourceId": req.datasourceId,
            "dialect": req.dialect,
            "sourceType": req.sourceType,
            "tables": req.tables,
            "database": req.database,
            "metricIds": sorted(req.metricIds),
            "customRuleIds": sorted(req.customRuleIds),
            "outputMode": req.outputMode,
        },
        sort_keys=True,
        default=str,
    )
    digest = hashlib.sha256(payload.encode()).hexdigest()[:16]
    logger.info(
        "dataprofile.audit hash=%s dialect=%s metrics=%s custom=%s refused=%s ok=%d partial=%d",
        digest, req.dialect, req.metricIds, req.customRuleIds, refused, ok_count, partial_count,
    )


class GenerateError(ValueError):
    """生成前置校验失败（表数超限 / 非法标识符 / 缺参数 / 缺来源），路由 422。"""


def _strip_trailing_semicolon(sql: str) -> str:
    return sql.strip().rstrip(";").strip()


def _title(table: str, name: str, column: str | None) -> str:
    return f"{table}.{column} / {name}" if column else f"{table} / {name}"


def _resolve_tables(req: GenerateProfileRequest, conn, dialect: ProfileDialect) -> list[str]:
    """来源解析（F-PG-02/04）。source=database 反射全表，超 PROFILE_MAX_TABLES 抛 GenerateError。"""
    if req.sourceType == "tables":
        if not req.tables:
            raise GenerateError("来源为表时 tables 不能为空")
        return list(req.tables)
    # database
    if not req.database:
        raise GenerateError("来源为库时 database 不能为空")
    if conn is None:
        raise GenerateError("来源为库需要数据源连接")
    tables = list_tables(conn, dialect, req.database)
    names = [t.name if t.schema is None else f"{t.schema}.{t.name}" for t in tables]
    if len(names) > PROFILE_MAX_TABLES:
        raise GenerateError(
            f"该库含 {len(names)} 张表，超过 {PROFILE_MAX_TABLES} 上限，请收窄来源"
        )
    return names


def _resolve_columns(
    table: str, needs_column: bool, req: GenerateProfileRequest, conn, dialect: ProfileDialect
) -> list[str] | None:
    """列解析（F-PG-13 默认全列）。无 needsColumn 指标 -> None。显式给列优先，否则反射。"""
    if not needs_column:
        return None
    explicit = (req.columns or {}).get(table)
    if explicit:
        return list(explicit)
    if conn is None:
        raise GenerateError(f"表 {table} 需反射列但无数据源连接")
    schema, name = parse_table(table)
    cols = list_columns(conn, dialect, schema, name)
    return [c.name for c in cols]


def _parse_llm_sql(raw: str) -> str:
    """解析 LLM 输出为归一化 SQL（F-PG-06 强约束）。失败抛 ValueError。"""
    data = json.loads(raw)
    seg = LLMNormalizedSegment.model_validate(data)
    if not seg.sql.strip():
        raise ValueError("LLM 拒答（返回空 sql）")
    return seg.sql


def _explain_with_retry(explain_fn: ExplainFn, sql: str) -> tuple[bool, str | None, int]:
    """EXPLAIN 重试（F-PG-09）：仅超时重试，SQL 错误确定性失败不重试。返回 (ok, err, retries_used)。"""
    last = (False, None)
    retries = 0
    for attempt in range(1 + _EXPLAIN_RETRIES):
        ok, err = explain_fn(sql)
        last = (ok, err)
        if ok:
            return ok, err, retries
        # SQL 错误（非超时）确定性失败，不重试
        if not (err and "超时" in err):
            return ok, err, retries
        retries += 1  # 超时才计数重试
    return last[0], last[1], retries


def _merge_sql(segments: list[ScriptSegment]) -> str:
    """合并模式（F-PG-10）：各段包成子查询 UNION ALL。

    刻意保留各段内的 GROUP BY/ORDER BY/LIMIT：子查询包裹（FROM (<seg>) _sN）
    已使它们对 UNION ALL 语法安全；而 topn_frequency 的 ORDER BY ... LIMIT N
    是其语义核心，剥离会使 TopN 退化为全量分布。故不按 PRD 字面「去掉各段
    ORDER BY/LIMIT」处理——子查询包裹已达成 UNION ALL 形状一致的目标。
    """
    if len(segments) == 1:
        return segments[0].sql
    parts: list[str] = []
    for i, seg in enumerate(segments):
        inner = _strip_trailing_semicolon(seg.sql)
        parts.append(f"SELECT table_name, column_name, metric, value FROM ({inner}) _s{i}")
    return "\nUNION ALL\n".join(parts)


def generate(
    req: GenerateProfileRequest,
    conn,
    dialect: ProfileDialect,
    metrics: list[BuiltInMetric],
    rules: list[CustomRule],
    chat_fn: ChatFn = chat_json,
    explain_fn: ExplainFn | None = None,
) -> GenerateProfileResponse:
    """生成探查脚本（API-PG-01）。

    conn 仅用于反射（source=database / 列反射）；explain_fn 由路由提供（每段独立借连接）。
    LLMClientError（上游不可用）向上抛，由路由映射 500/504；解析/校验失败归入 partialFailures。
    """
    if not req.metricIds and not req.customRuleIds:
        raise GenerateError("请至少选择一个内置指标或自定义规则")

    # 1. 选中指标 / 规则
    sel_metrics = [m for m in metrics if m.id in req.metricIds]
    metric_ids_set = {m.id for m in sel_metrics}
    unknown = [mid for mid in req.metricIds if mid not in metric_ids_set]
    if unknown:
        logger.warning("generate: 未知指标 id 已忽略：%s", unknown)
    sel_rules = [r for r in rules if r.id in req.customRuleIds]

    # 2. 来源 / 列解析
    tables = _resolve_tables(req, conn, dialect)
    for t in tables:
        validate_ident(t, "表名")

    needs_any_column = any(m.needsColumn for m in sel_metrics) or any(
        r.needsColumn for r in sel_rules
    )

    # 3. 生成计划：[(kind, item, table, column)]
    plans: list[tuple[str, object, str, str | None]] = []
    for table in tables:
        cols = _resolve_columns(table, needs_any_column, req, conn, dialect)
        for m in sel_metrics:
            if m.needsColumn:
                for c in cols or []:
                    plans.append(("builtin", m, table, c))
            else:
                plans.append(("builtin", m, table, None))
        for r in sel_rules:
            if r.needsColumn:
                for c in cols or []:
                    plans.append(("custom", r, table, c))
            else:
                plans.append(("custom", r, table, None))

    segments_ok: list[ScriptSegment] = []
    partial_failures: list[ScriptSegment] = []
    explain_failures: list[ScriptSegment] = []
    total_retries = 0

    for kind, item, table, column in plans:
        if kind == "builtin":
            metric: BuiltInMetric = item  # type: ignore[assignment]
            # metricParams 可能为 None（字段默认值）；缺 regex 参数时 render_builtin
            # 抛 TemplateRenderError -> 由下方 try 捕获归入 partialFailures，而非 500
            param = (req.metricParams or {}).get(metric.id) if metric.needsParam else None
            try:
                sql = render_builtin(metric.id, dialect, table, column, param)
            except TemplateRenderError as exc:
                partial_failures.append(_seg(_title(table, metric.name, column), "", metric.id, table, "builtin", str(exc)))
                continue
            title = _title(table, metric.name, column)
        else:
            rule: CustomRule = item  # type: ignore[assignment]
            title = _title(table, rule.name, column)
            if rule.dialect != dialect:
                partial_failures.append(_seg(title, "", None, table, "custom", f"规则方言({rule.dialect})与数据源({dialect})不匹配"))
                continue
            try:
                raw = chat_fn(build_system_prompt(dialect), build_user_message(rule, table, column))
                sql = _parse_llm_sql(raw)
            except LLMClientError:
                # 上游不可用（超时/鉴权/配额）-> 审计后上抛，路由映射 500/504。
                # §8.3：LLM 上游失败时整个生成中止（raise 跳出，已生成段不返回），
                # 按 refused 审计整体失败（不记 SQL 原文）。raise 后下方成功审计不可达。
                _audit(req, refused=True, ok_count=len(segments_ok), partial_count=len(partial_failures))
                raise  # 上游不可用 -> 路由 500/504
            except Exception as exc:  # noqa: BLE001 - JSON 解析 / Schema 校验 / 拒答 归入 partial
                partial_failures.append(_seg(title, "", None, table, "custom", f"LLM 仿写失败：{exc}"))
                continue

        # 静态分析（所有段）
        analysis = analyze(sql, dialect)
        if not analysis.allowed:
            partial_failures.append(_seg(title, sql, None if kind == "custom" else metric.id, table, kind, "静态分析拦截：" + "；".join(analysis.violations)))
            continue

        if kind == "custom" and explain_fn is not None:
            ok, err, retries = _explain_with_retry(explain_fn, sql)
            total_retries += retries
            if not ok:
                seg = _seg(title, sql, None, table, "custom", f"EXPLAIN 失败：{err}")
                partial_failures.append(seg)
                explain_failures.append(seg)
                continue

        segments_ok.append(_seg(title, sql, None if kind == "custom" else metric.id, table, kind, None))

    # 4. 装配
    has_custom = any(p[0] == "custom" for p in plans)
    if not segments_ok and plans:
        # 全失败 / LLM 拒答：仍回传失败原因，便于定位
        _audit(req, refused=True, ok_count=0, partial_count=len(partial_failures))
        return GenerateProfileResponse(
            refused=True,
            dialect=dialect,
            partialFailures=partial_failures,
            message="脚本生成失败：所有段均未通过校验或 LLM 拒答，请检查自定义规则或稍后重试",
        )

    if req.outputMode == "merge" and len(segments_ok) > 1:
        merged = _merge_sql(segments_ok)
        out_segments = [
            ScriptSegment(
                title=f"合并脚本（{len(segments_ok)} 段）",
                sql=merged,
                metricId=None,
                tableName="",
                source="custom" if has_custom else "builtin",
            )
        ]
        static = analyze(merged, dialect)
    else:
        out_segments = segments_ok
        static = analyze(segments_ok[0].sql, dialect) if segments_ok else SqlAnalysis(allowed=False, violations=["无可用段"], statementCount=0)

    # 5. 校验聚合
    if has_custom:
        if explain_failures:
            explain = ExplainResult(ok=False, error=explain_failures[0].error)
        else:
            explain = ExplainResult(ok=True)
    else:
        explain = None

    validation = ValidationResult(
        passed=len(partial_failures) == 0,
        staticAnalysis=static,
        explain=explain,
        retries=total_retries,
    )

    _audit(req, refused=False, ok_count=len(out_segments), partial_count=len(partial_failures))
    return GenerateProfileResponse(
        refused=False,
        dialect=dialect,
        segments=out_segments,
        validation=validation,
        partialFailures=partial_failures,
    )


def _seg(
    title: str, sql: str, metric_id: str | None, table: str, source: str, error: str | None
) -> ScriptSegment:
    return ScriptSegment(
        title=title, sql=sql, metricId=metric_id, tableName=table, source=source, error=error
    )
