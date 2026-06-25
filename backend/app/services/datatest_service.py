"""测试数据集核心服务（F-BK-DT-01 业务逻辑 + F-LM-05 兜底）。

调用链：
  router → generate(req) → build_user_message → llm_client.chat_json
        → JSON.parse → Pydantic 输出 Schema → 长度一致性 → 下发或兜底
"""
from __future__ import annotations

import json
import logging

from pydantic import ValidationError

from app.services.datatest_models import (
    GenerateRequest,
    GenerateResponse,
    GenerateResponseRefused,
    GenerateResponseSuccess,
    _LLMOutputRefused,
    _LLMOutputSuccess,
    fallback_refused,
)
from app.services.datatest_prompt import SYSTEM_PROMPT, build_user_message
from app.services.llm_client import LLMClientError, chat_json

logger = logging.getLogger(__name__)


def generate(req: GenerateRequest) -> GenerateResponse:
    """主入口：返回 GenerateResponse（成功或拒答）。

    任何异常路径（LLM 错误 / 解析失败 / Schema 不符 / 长度不一致）
    都收敛为 fallback_refused()——F-LM-05 输出兜底，不暴露 LLM 原文。
    """
    user_message = build_user_message(req)

    # 1. 调 LLM
    try:
        raw = chat_json(SYSTEM_PROMPT, user_message)
    except LLMClientError as exc:
        logger.warning("llm call failed: %s", exc)
        # 调用层错误（超时、密钥缺失、上游 5xx）→ 上抛由 router 转 504/500
        raise

    # 2. 解析 + 校验
    return _parse_and_validate(raw, req.rowCount)


def _parse_and_validate(raw: str, expected_rows: int) -> GenerateResponse:
    """LLM 原始字符串 → 校验 → 下发结构。

    任何不符合都返回兜底 refused，不返回错误码也不暴露 raw。
    """
    # JSON 解析
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError:
        logger.info("llm output not valid json, falling back to refused")
        return fallback_refused()

    if not isinstance(obj, dict):
        return fallback_refused()

    # refused 分支
    if obj.get("refused") is True:
        try:
            _LLMOutputRefused.model_validate(obj)
        except ValidationError:
            return fallback_refused()
        # 不沿用 LLM 给的 message（避免 PII / 注入回显）；统一兜底文案
        return fallback_refused()

    # success 分支
    if obj.get("refused") is False:
        try:
            valid = _LLMOutputSuccess.model_validate(obj)
        except ValidationError as e:
            logger.info("llm success schema invalid: %s", e)
            return fallback_refused()

        cols_n = len(valid.columns)
        # 行数一致：rows.length 必须等于 rowCount
        if len(valid.rows) != expected_rows:
            logger.info(
                "row count mismatch: got %d, expected %d", len(valid.rows), expected_rows
            )
            return fallback_refused()
        # 每行宽度一致：等于 columns.length
        for i, row in enumerate(valid.rows):
            if not isinstance(row, list) or len(row) != cols_n:
                logger.info("row width mismatch at index %d", i)
                return fallback_refused()

        return GenerateResponseSuccess(
            refused=False, columns=valid.columns, rows=valid.rows
        )

    # refused 既非 True 也非 False（缺失或非 bool）
    return fallback_refused()
