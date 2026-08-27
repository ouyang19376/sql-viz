"""知识库问答（kbqa）- Pydantic 模型。

字段命名沿用既有代码库 camelCase 范式（与 rag_sql_models 对齐），
TS 接口（前端 types/kbqa.ts）与本文件一一对应。
命中来源复用 rag_sql_models.AskSource，不重复定义。
"""
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, conint, constr, conlist


class KbqaTurn(BaseModel):
    """多轮会话单轮。history 仅传 question 原文 + assistant 的回答。"""

    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: constr(min_length=1, max_length=4000)


class KbqaChatRequest(BaseModel):
    """知识库问答入参。后端按 RAG_HISTORY_MAX_TURNS 截断 history。"""

    model_config = ConfigDict(extra="forbid")

    question: constr(min_length=1, max_length=2000)
    topK: Optional[conint(ge=1, le=20)] = None
    conversationId: Optional[str] = None
    history: Optional[conlist(KbqaTurn, max_length=40)] = None


__all__ = ["KbqaTurn", "KbqaChatRequest"]
