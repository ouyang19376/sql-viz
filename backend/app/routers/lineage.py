"""SQL 血缘分析路由（F-BK-01）。"""
import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.response import fail, ok
from app.services.lineage_models import LineageAnalyzeRequest, LineageNeo4jPushRequest
from app.services.lineage_neo4j_service import Neo4jNotConfiguredError, Neo4jPushError, push_lineage_to_neo4j
from app.services.lineage_service import analyze_lineage
from app.services.llm_client import LLMClientError
from app.services.llm_usage import get_llm_usage_stats

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/lineage", tags=["lineage"])


@router.post("/analyze")
def analyze_endpoint(req: LineageAnalyzeRequest):
    """API-LN-01：分析 SQL 表级血缘。"""
    try:
        result = analyze_lineage(req)
    except LLMClientError as exc:
        msg = str(exc)
        if "Timeout" in msg or "timeout" in msg or "timed out" in msg:
            logger.warning("lineage llm timeout: %s", msg)
            return JSONResponse(
                status_code=504,
                content=fail(-1, "分析超时，请缩短脚本后重试"),
            )
        logger.warning("lineage llm upstream error: %s", msg)
        return JSONResponse(
            status_code=500,
            content=fail(-2, "血缘分析服务暂不可用"),
        )
    except Exception as exc:
        logger.warning("lineage parser/service error: %s", exc)
        return JSONResponse(
            status_code=500,
            content=fail(-3, "解析失败，请稍后重试"),
        )
    return ok(result.model_dump())


@router.get("/usage")
def usage_endpoint():
    """F-LM-07：返回当前进程内 LLM 聚合用量统计（不含 SQL 原文）。"""
    return ok(get_llm_usage_stats())


@router.post("/push-neo4j")
def push_neo4j_endpoint(req: LineageNeo4jPushRequest):
    """API-EX-07：将表级血缘直接推送到 Neo4j。"""
    try:
        result = push_lineage_to_neo4j(req.result)
    except Neo4jNotConfiguredError as exc:
        return JSONResponse(
            status_code=400,
            content=fail(-4, str(exc)),
        )
    except Neo4jPushError as exc:
        logger.warning("lineage neo4j push error: %s", exc)
        return JSONResponse(
            status_code=502,
            content=fail(-5, "Neo4j 写入失败，请检查连接配置和服务状态"),
        )

    return ok(result.model_dump())
