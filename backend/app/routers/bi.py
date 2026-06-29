"""BI 报表路由 — 数据源管理 + 明细预览 + 聚合（F-BK-01~05，prefix=/api/bi）。

统一 ApiResponse 外壳；错误码对齐 PRD-bi §6.3。
"""
import logging

from fastapi import APIRouter, UploadFile
from fastapi.responses import JSONResponse

from app.core.config import BI_MAX_UPLOAD_MB
from app.core.response import fail, ok
from app.services import bi_geo, bi_service
from app.services.bi_models import AggregateRequest, PreviewRequest
from app.services.bi_parser import BiParseError, parse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/bi", tags=["bi"])

_ALLOWED_EXTS = (".xlsx", ".csv")
_MAX_BYTES = BI_MAX_UPLOAD_MB * 1024 * 1024


@router.post("/datasets/upload")
async def upload_dataset(file: UploadFile):
    """API-BI-01：上传 + pandas 解析 + 落盘，返回 DatasetMeta。"""
    filename = file.filename or ""
    lower = filename.lower()
    if not lower.endswith(_ALLOWED_EXTS):
        return JSONResponse(status_code=422, content=fail(-1, "仅支持 .xlsx 和 .csv 文件"))

    content = await file.read()
    if len(content) > _MAX_BYTES:
        return JSONResponse(
            status_code=422, content=fail(-1, f"文件大小不得超过 {BI_MAX_UPLOAD_MB}MB")
        )
    if not content:
        return JSONResponse(status_code=422, content=fail(-1, "文件解析失败，请检查文件内容"))

    try:
        columns, df = parse(filename, content)
    except BiParseError as exc:
        return JSONResponse(status_code=422, content=fail(-1, str(exc)))
    except Exception:  # noqa: BLE001 — pandas/openpyxl 异常兜底，避免 500 泄漏栈
        logger.exception("bi upload parse failed: %s", filename)
        return JSONResponse(status_code=422, content=fail(-1, "文件解析失败，请检查文件内容"))

    # 数据集名取文件名（去后缀）
    name = filename.rsplit(".", 1)[0] or filename
    meta = bi_service.create_dataset(name, filename, columns, df)
    return ok(meta.model_dump(), message=f"解析成功，共 {meta.rowCount} 行")


@router.get("/datasets")
def list_datasets():
    """API-BI-02：返回所有已存数据集元信息。"""
    metas = bi_service.list_datasets()
    return ok([m.model_dump() for m in metas])


@router.delete("/datasets/{dataset_id}")
def delete_dataset(dataset_id: str):
    """API-BI-03：删除数据集磁盘目录。不存在 → 404。"""
    if not bi_service.delete_dataset(dataset_id):
        return JSONResponse(status_code=404, content=fail(-1, "数据集不存在"))
    return ok(None, message="已删除")


@router.post("/datasets/{dataset_id}/preview")
def preview_dataset(dataset_id: str, req: PreviewRequest):
    """API-BI-04：分页 + 筛选明细，返回 PreviewResponse。不存在 → 404。"""
    if not bi_service.dataset_exists(dataset_id):
        return JSONResponse(status_code=404, content=fail(-1, "数据集不存在"))
    try:
        columns, rows, total = bi_service.preview(
            dataset_id, req.page, req.pageSize, req.filters, req.sort
        )
    except Exception:  # noqa: BLE001 — pandas 读取/筛选异常兜底，避免 500 泄漏栈
        logger.exception("bi preview failed: %s", dataset_id)
        return JSONResponse(status_code=500, content=fail(-2, "明细加载失败"))
    return ok(
        {
            "columns": columns,
            "rows": rows,
            "total": total,
            "page": req.page,
            "pageSize": req.pageSize,
        }
    )


@router.post("/datasets/{dataset_id}/aggregate")
def aggregate_dataset(dataset_id: str, req: AggregateRequest):
    """API-BI-05：groupBy + metrics + filters 聚合，返回 AggregateResponse。不存在 → 404。"""
    if not bi_service.dataset_exists(dataset_id):
        return JSONResponse(status_code=404, content=fail(-1, "数据集不存在"))
    try:
        columns, rows = bi_service.aggregate(
            dataset_id, req.groupBy, req.metrics, req.filters, req.sort
        )
    except Exception:  # noqa: BLE001 — pandas 聚合异常兜底，避免 500 泄漏栈
        logger.exception("bi aggregate failed: %s", dataset_id)
        return JSONResponse(status_code=500, content=fail(-2, "聚合失败"))
    return ok({"columns": columns, "rows": rows})


@router.get("/geo/city/{adcode}")
def get_city_geo(adcode: str):
    """城市级地图 GeoJSON 代理（F-VZ-07 降级）：前端直连 DataV 被 403，由后端转发 + 磁盘缓存。
    成功透传原始 GeoJSON（供前端 echarts.registerMap）；adcode 非法 → 422；下载失败 → 502。
    """
    if not bi_geo.is_valid_adcode(adcode):
        return JSONResponse(status_code=422, content=fail(-1, "adcode 非法"))
    try:
        geo = bi_geo.load_city_geo(adcode)
    except Exception:  # noqa: BLE001 — DataV 不可达 / 非 JSON 兜底，避免 500 泄漏栈
        logger.exception("bi city geo fetch failed: %s", adcode)
        return JSONResponse(status_code=502, content=fail(-2, "城市地图下载失败"))
    return JSONResponse(content=geo)
