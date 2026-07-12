"""RAG for NL2SQL - NL2SQL 生成 + sqlglot 校验（PRD-rag-sql F-AS-06/07，API-AS-01 生成段，plan §5.4/6.9）。

两路生成共享 build_ask_prompt + 检索上下文，仅输出格式分叉：
- generate：chat_json -> JSON {"sql":"..."} -> 解析（失败/空 -> refused，§8.3 兜底）。
- generate_stream：stream_chat -> 裸 SQL token 流式产出（F-AS-15）。
validate_sql 复用 dataprofile_analyzer.analyze（sqlglot 白名单，仅 SELECT + 危险拦截，不执行）。
"""
from __future__ import annotations

import json
import logging
import re
from typing import Callable, Generator, Optional

from app.services.dataprofile_analyzer import analyze as _analyze_sql
from app.services.llm_client import LLMClientError
from app.services.rag_sql_models import AskSource, AskTurn, AskValidation, RagDialect

logger = logging.getLogger(__name__)

# 误带 markdown 围栏兜底（chat_json 强制 json_object，正常不会出现，防御性清理）
_FENCE_RE = re.compile(r"^\s*```(?:sql)?\s*\n?|\n?\s*```\s*$", re.IGNORECASE)


def _strip_fences(sql: str) -> str:
    return _FENCE_RE.sub("", sql).strip()


def generate(
    question: str,
    dialect: RagDialect,
    sources: list[AskSource],
    history: Optional[list[AskTurn]],
    chat_fn: Callable[[str, str], str],
) -> tuple[Optional[str], bool, Optional[str]]:
    """非流式 NL2SQL 生成（F-AS-06）。

    返回 (sql, refused, message)：成功 sql 非空、refused=False；LLM 未产出有效 SQL
    （JSON 解析失败/缺 sql 字段/空串）-> (None, True, 原因)，交路由 refused=true（§8.3 兜底）。
    LLMClientError（上游超时/异常，F-AS-12）不在此捕获，向上抛交路由 504。
    """
    from app.services.rag_sql_prompt import build_ask_prompt

    system, user = build_ask_prompt(question, dialect, sources, history, stream=False)
    try:
        raw = chat_fn(system, user)
    except LLMClientError:
        raise  # 上游失败（超时/异常）交路由 504（F-AS-12），不降级为 refused
    try:
        data = json.loads(raw)
    except Exception as exc:  # noqa: BLE001 - JSON 不符 -> refused（§8.3）
        logger.warning("generate JSON 解析失败：%s", exc)
        return None, True, "生成失败：模型未返回有效 SQL，请重试。"

    if not isinstance(data, dict):
        return None, True, "生成失败：模型返回格式异常，请重试。"
    sql = data.get("sql")
    if not isinstance(sql, str) or not sql.strip():
        return None, True, "生成失败：模型未生成有效 SQL，请重试。"
    return _strip_fences(sql), False, None


def generate_stream(
    question: str,
    dialect: RagDialect,
    sources: list[AskSource],
    history: Optional[list[AskTurn]],
    stream_chat_fn: Callable[[str, str], Generator[str, None, None]],
) -> Generator[str, None, None]:
    """流式 NL2SQL 生成（F-AS-15）：逐 token yield 裸 SQL。

    调用方（路由）负责累积 token、流结束后调 validate_sql 校验。
    stream_chat_fn 异常向上抛（交路由发 error 事件）。
    """
    from app.services.rag_sql_prompt import build_ask_prompt

    system, user = build_ask_prompt(question, dialect, sources, history, stream=True)
    started = False
    for token in stream_chat_fn(system, user):
        if not token:
            continue
        started = True
        yield token
    if not started:
        # 空流视作未生成，交路由处理（yield 一个哨兵让路由判定 refused）
        yield ""


def validate_sql(sql: str, dialect: RagDialect) -> AskValidation:
    """sqlglot 静态校验（F-AS-07，复用 dataprofile_analyzer.analyze，不执行）。

    映射为 AskValidation{allowed, violations}（PRD §5.3 只要这两字段，丢弃 statementCount）。
    """
    result = _analyze_sql(sql, dialect)
    return AskValidation(
        allowed=result.allowed,
        violations=list(result.violations),
    )


def finalize_stream_sql(accumulated: str) -> tuple[Optional[str], bool, Optional[str]]:
    """流式累积完成后的清理（去围栏 + 空判定）。返回 (sql, refused, message)。"""
    sql = _strip_fences(accumulated)
    if not sql:
        return None, True, "生成失败：模型未生成有效 SQL，请重试。"
    return sql, False, None


__all__ = ["generate", "generate_stream", "validate_sql", "finalize_stream_sql"]
