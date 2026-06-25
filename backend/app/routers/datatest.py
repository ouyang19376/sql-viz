"""测试数据集路由（F-BK-DT-01）。"""
import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.response import fail, ok
from app.services.datatest_models import GenerateRequest
from app.services.datatest_service import generate
from app.services.llm_client import LLMClientError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/datatest", tags=["datatest"])


@router.post("/generate")
def generate_endpoint(req: GenerateRequest):
    """API-DT-01：调用 LLM 生成测试数据集。

    请求体由 Pydantic 校验（F-LM-03 输入侧防护）；响应统一 ApiResponse 包装。
    错误码：504 = LLM 超时；500 = LLM 上游异常；其余按 Pydantic 422 自动返回。
    """
    try:
        result = generate(req)
    except LLMClientError as exc:
        # 区分超时 vs 其他上游错误（按 PRD §6.2 错误码表）
        msg = str(exc)
        if "Timeout" in msg or "timeout" in msg or "timed out" in msg:
            logger.warning("llm timeout: %s", msg)
            return JSONResponse(
                status_code=504,
                content=fail(-1, "LLM 调用超时，请稍后重试或缩减规模"),
            )
        logger.warning("llm upstream error: %s", msg)
        return JSONResponse(
            status_code=500,
            content=fail(-2, "LLM 服务暂不可用"),
        )

    # success / refused 共用 ok() 外壳；前端按 data.refused 分流（PRD §6.2）
    return ok(result.model_dump())
