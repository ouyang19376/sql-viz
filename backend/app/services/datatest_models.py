"""测试数据集 Pydantic 模型 — 请求 / 响应 / 内部 LLM 输出 Schema。

F-LM-01：请求模型刻意不含 system 字段；任何前端字段都进不到 system role。
F-LM-03：所有字符长度、列表长度上限通过 Pydantic 约束二次校验（前端是首层）。
"""
from typing import Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, conint, conlist, constr

from app.core.config import (
    DATATEST_MAX_FIELDS,
    DATATEST_MAX_PROMPT_LEN,
    DATATEST_MAX_ROWS,
)

# 9 种字段类型（F-DT-03，PRD §5.2）
FieldType = Literal[
    "string", "int", "float", "date", "datetime", "bool", "email", "phone", "enum"
]

DataTestMode = Literal["natural_language", "schema"]
ExportFormat = Literal["xlsx", "json", "csv"]


class FieldDef(BaseModel):
    """单个字段定义。"""

    # extra='forbid' 防止前端塞额外字段 → 静默忽略
    model_config = ConfigDict(extra="forbid")

    name: constr(min_length=1, max_length=64)
    type: FieldType
    description: Optional[constr(max_length=200)] = None
    enumValues: Optional[conlist(constr(max_length=64), min_length=1, max_length=50)] = None


class GenerateRequest(BaseModel):
    """生成请求体（F-LM-01：刻意不存在 system / system_prompt 字段）。"""

    # extra='forbid'：阻止前端注入 system / messages / response_format 等敏感字段
    model_config = ConfigDict(extra="forbid")

    mode: DataTestMode
    prompt: Optional[constr(max_length=DATATEST_MAX_PROMPT_LEN)] = None
    fields: Optional[conlist(FieldDef, min_length=1, max_length=DATATEST_MAX_FIELDS)] = None
    rowCount: conint(ge=1, le=DATATEST_MAX_ROWS)
    format: ExportFormat


# ─── 响应（联合） ─────────────────────────────────────────
class GenerateResponseSuccess(BaseModel):
    refused: Literal[False] = False
    columns: list[str]
    # rows 元素类型：LLM 可能给字符串/数字/布尔/None；list[list] 接受异构
    rows: list[list]


class GenerateResponseRefused(BaseModel):
    refused: Literal[True] = True
    message: str


GenerateResponse = Union[GenerateResponseSuccess, GenerateResponseRefused]


# ─── LLM 原始输出 Schema（内部用，非对外） ─────────────────
# 用于二次校验 LLM 返回的 JSON 是否满足结构约束；不直接下发前端
class _LLMOutputSuccess(BaseModel):
    refused: Literal[False]
    columns: list[str] = Field(min_length=1)
    rows: list[list]


class _LLMOutputRefused(BaseModel):
    refused: Literal[True]
    message: str = ""


# 兜底拒答常量（F-LM-05 一处来源，不暴露 LLM 原文）
REFUSAL_MESSAGE = "生成目标方向错误，请合理输入测试数据集的指令"


def fallback_refused() -> GenerateResponseRefused:
    """统一兜底：解析失败 / Schema 不符 / 长度不一致 → 同一 refused 文案。"""
    return GenerateResponseRefused(refused=True, message=REFUSAL_MESSAGE)
