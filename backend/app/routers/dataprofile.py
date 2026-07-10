"""数据探查 - 数据源路由（PRD-dataprofile DS 子模块，API-DS-01~07）。

会话标识：请求头 X-Session-Id（前端 uuid + localStorage）。
凭证安全（F-DS-08）：DataSource 模型无 password 字段，列表/详情永不下发。
惰性 TTL（F-DS-09）：每次访问 registry.gc(session_id) 降级超时数据源。
"""
import logging

from fastapi import APIRouter, Header
from fastapi.responses import JSONResponse

from app.core.response import fail, ok
from app.services.dataprofile_analyzer import analyze, format_sql
from app.services.dataprofile_executor import QueryTimeout, execute_query, explain_sql
from app.services.dataprofile_generate import GenerateError, generate
from app.services.dataprofile_models import (
    AnalyzeRequest,
    CustomRuleInput,
    DataSourceConfig,
    ExplainRequest,
    ExplainResult,
    FormatRequest,
    FormatResult,
    GenerateProfileRequest,
    QueryRequest,
    RuleImportPayload,
)
from app.services.dataprofile_rules import RuleValidationError, list_metrics, store
from app.services.dataprofile_schema import list_columns, list_schemas, list_tables
from app.services.dataprofile_session import (
    CACHE_MISS,
    DataSourceConnectError,
    registry,
)
from app.services.llm_client import LLMClientError, chat_json

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/dataprofile", tags=["dataprofile"])


def _require_session(x_session_id: str | None) -> str | JSONResponse:
    """校验会话标识；缺失返回 400 响应。"""
    if not x_session_id:
        return JSONResponse(status_code=400, content=fail(-1, "缺少会话标识（X-Session-Id）"))
    return x_session_id


# ─── API-DS-02：测试连接（不入池） ─────────────────────
@router.post("/sources/test")
def test_source(req: DataSourceConfig, x_session_id: str | None = Header(None)):
    sess = _require_session(x_session_id)
    if isinstance(sess, JSONResponse):
        return sess
    result = registry.test_only(req)
    return ok(result.model_dump())


# ─── API-DS-01：注册数据源（建池） ─────────────────────
@router.post("/sources")
def register_source(req: DataSourceConfig, x_session_id: str | None = Header(None)):
    sess = _require_session(x_session_id)
    if isinstance(sess, JSONResponse):
        return sess
    try:
        ds = registry.register(sess, req)
    except DataSourceConnectError as exc:
        # 注册时连通/认证失败：回传 TestResult 供前端展示具体 error_type
        return JSONResponse(
            status_code=422,
            content=fail(-1, exc.result.message or "连接失败", exc.result.model_dump()),
        )
    return ok(ds.model_dump(), message="已连接")


# ─── API-DS-03：列表 / 断开 ──────────────────────────
@router.get("/sources")
def list_sources(x_session_id: str | None = Header(None)):
    sess = _require_session(x_session_id)
    if isinstance(sess, JSONResponse):
        return sess
    registry.gc(sess)  # 惰性 TTL
    sources = registry.list_sources(sess)
    return ok([s.model_dump() for s in sources])


@router.delete("/sources/{ds_id}")
def delete_source(ds_id: str, x_session_id: str | None = Header(None)):
    sess = _require_session(x_session_id)
    if isinstance(sess, JSONResponse):
        return sess
    if not registry.disconnect(sess, ds_id):
        return JSONResponse(status_code=404, content=fail(-1, "数据源不存在"))
    return ok(None, message="已断开")


# ─── 编辑（F-DS-06：断旧建新，密码留空=不改） ─────────
@router.put("/sources/{ds_id}")
def edit_source(ds_id: str, req: DataSourceConfig, x_session_id: str | None = Header(None)):
    sess = _require_session(x_session_id)
    if isinstance(sess, JSONResponse):
        return sess
    try:
        ds = registry.edit(sess, ds_id, req)
    except KeyError:
        return JSONResponse(status_code=404, content=fail(-1, "数据源不存在"))
    except DataSourceConnectError as exc:
        return JSONResponse(
            status_code=422,
            content=fail(-1, exc.result.message or "连接失败", exc.result.model_dump()),
        )
    return ok(ds.model_dump(), message="已更新")


# ─── 重连（F-DS-05：expired/error -> connected） ─────
@router.post("/sources/{ds_id}/reconnect")
def reconnect_source(ds_id: str, x_session_id: str | None = Header(None)):
    sess = _require_session(x_session_id)
    if isinstance(sess, JSONResponse):
        return sess
    try:
        ds = registry.reconnect(sess, ds_id)
    except KeyError:
        return JSONResponse(status_code=404, content=fail(-1, "数据源不存在"))
    except DataSourceConnectError as exc:
        return JSONResponse(
            status_code=422,
            content=fail(-1, exc.result.message or "重连失败", exc.result.model_dump()),
        )
    return ok(ds.model_dump(), message="已重连")


# ─── API-DS-05/06/07：Schema 反射 ─────────────────────
@router.get("/sources/{ds_id}/schemas")
def get_schemas(ds_id: str, x_session_id: str | None = Header(None)):
    sess = _require_session(x_session_id)
    if isinstance(sess, JSONResponse):
        return sess
    key = ("schemas",)
    cached = registry.cache_get(sess, ds_id, key)
    if cached is not CACHE_MISS:
        return ok(cached)
    conn = None
    broken = False
    try:
        conn = registry.get_conn(sess, ds_id)
        schemas = list_schemas(conn, registry.get_dialect(sess, ds_id))
    except KeyError:
        return JSONResponse(status_code=404, content=fail(-1, "数据源不存在"))
    except DataSourceConnectError as exc:
        return JSONResponse(
            status_code=422,
            content=fail(-1, exc.result.message or "连接失败", exc.result.model_dump()),
        )
    except Exception:  # noqa: BLE001 - 反射异常兜底，避免 500 泄漏栈
        broken = True
        logger.exception("list_schemas failed: %s", ds_id)
        return JSONResponse(status_code=500, content=fail(-2, "反射失败"))
    finally:
        if conn is not None:
            registry.release_conn(sess, ds_id, conn, broken=broken)
    registry.cache_set(sess, ds_id, key, schemas)
    return ok(schemas)


@router.get("/sources/{ds_id}/tables")
def get_tables(
    ds_id: str,
    schema: str | None = None,
    x_session_id: str | None = Header(None),
):
    sess = _require_session(x_session_id)
    if isinstance(sess, JSONResponse):
        return sess
    key = ("tables", schema)
    cached = registry.cache_get(sess, ds_id, key)
    if cached is not CACHE_MISS:
        return ok(cached)
    conn = None
    broken = False
    try:
        conn = registry.get_conn(sess, ds_id)
        tables = list_tables(conn, registry.get_dialect(sess, ds_id), schema)
    except KeyError:
        return JSONResponse(status_code=404, content=fail(-1, "数据源不存在"))
    except DataSourceConnectError as exc:
        return JSONResponse(
            status_code=422,
            content=fail(-1, exc.result.message or "连接失败", exc.result.model_dump()),
        )
    except ValueError as exc:  # 非法标识符
        return JSONResponse(status_code=422, content=fail(-1, str(exc)))
    except Exception:  # noqa: BLE001 - 反射异常兜底，避免 500 泄漏栈
        broken = True
        logger.exception("list_tables failed: %s", ds_id)
        return JSONResponse(status_code=500, content=fail(-2, "反射失败"))
    finally:
        if conn is not None:
            registry.release_conn(sess, ds_id, conn, broken=broken)
    payload = [t.model_dump() for t in tables]
    registry.cache_set(sess, ds_id, key, payload)
    return ok(payload)


@router.get("/sources/{ds_id}/tables/{table}/columns")
def get_columns(
    ds_id: str,
    table: str,
    schema: str | None = None,
    x_session_id: str | None = Header(None),
):
    sess = _require_session(x_session_id)
    if isinstance(sess, JSONResponse):
        return sess
    key = ("columns", schema, table)
    cached = registry.cache_get(sess, ds_id, key)
    if cached is not CACHE_MISS:
        return ok(cached)
    conn = None
    broken = False
    try:
        conn = registry.get_conn(sess, ds_id)
        columns = list_columns(conn, registry.get_dialect(sess, ds_id), schema, table)
    except KeyError:
        return JSONResponse(status_code=404, content=fail(-1, "数据源不存在"))
    except DataSourceConnectError as exc:
        return JSONResponse(
            status_code=422,
            content=fail(-1, exc.result.message or "连接失败", exc.result.model_dump()),
        )
    except ValueError as exc:
        return JSONResponse(status_code=422, content=fail(-1, str(exc)))
    except Exception:  # noqa: BLE001 - 反射异常兜底，避免 500 泄漏栈
        broken = True
        logger.exception("list_columns failed: %s/%s", ds_id, table)
        return JSONResponse(status_code=500, content=fail(-2, "反射失败"))
    finally:
        if conn is not None:
            registry.release_conn(sess, ds_id, conn, broken=broken)
    payload = [c.model_dump() for c in columns]
    registry.cache_set(sess, ds_id, key, payload)
    return ok(payload)


# ─── API-QB-02：独立静态分析（F-QB-03） ─────────────────
@router.post("/analyze")
def analyze_sql(req: AnalyzeRequest, x_session_id: str | None = Header(None)):
    sess = _require_session(x_session_id)
    if isinstance(sess, JSONResponse):
        return sess
    result = analyze(req.sql, req.dialect)
    return ok(result.model_dump())


# ─── F-QB-11：SQL 格式化 ──────────────────────────────
@router.post("/format")
def format_sql_endpoint(req: FormatRequest, x_session_id: str | None = Header(None)):
    sess = _require_session(x_session_id)
    if isinstance(sess, JSONResponse):
        return sess
    return ok(FormatResult(sql=format_sql(req.sql, req.dialect)).model_dump())


# ─── API-QB-01：查询执行（静态分析 + LIMIT 注入 + 超时） ─
@router.post("/query")
def run_query(req: QueryRequest, x_session_id: str | None = Header(None)):
    sess = _require_session(x_session_id)
    if isinstance(sess, JSONResponse):
        return sess

    # 1. 静态分析（纯函数，不借连接）：拦截即返回 analysis，省一次 DB 往返
    try:
        dialect = registry.get_dialect(sess, req.datasourceId)
    except KeyError:
        return JSONResponse(status_code=404, content=fail(-1, "数据源不存在"))

    analysis = analyze(req.sql, dialect)
    if not analysis.allowed:
        return ok({"analysis": analysis.model_dump()})

    # 2. 借连接执行
    conn = None
    broken = False
    try:
        conn = registry.get_conn(sess, req.datasourceId)
    except KeyError:
        return JSONResponse(status_code=404, content=fail(-1, "数据源不存在"))
    except DataSourceConnectError as exc:
        return JSONResponse(
            status_code=422,
            content=fail(-1, exc.result.message or "连接失败", exc.result.model_dump()),
        )

    try:
        result, broken = execute_query(conn, dialect, req.sql, req.page, req.pageSize)
    except QueryTimeout:
        registry.release_conn(sess, req.datasourceId, conn, broken=True)
        return JSONResponse(status_code=504, content=fail(-1, "查询超时（>30s），已取消"))
    except ValueError as exc:  # hive offset 超限（_wrap_limit 抛，未触连接）
        registry.release_conn(sess, req.datasourceId, conn, broken=False)
        return JSONResponse(status_code=422, content=fail(-1, str(exc)))
    except Exception as exc:  # noqa: BLE001 - 执行异常兜底，避免 500 泄漏栈
        logger.exception("query failed: %s", req.datasourceId)
        registry.release_conn(sess, req.datasourceId, conn, broken=True)
        return JSONResponse(
            status_code=500, content=fail(-2, f"查询执行失败：{str(exc)[:200]}")
        )

    registry.release_conn(sess, req.datasourceId, conn, broken=broken)
    return ok(result.model_dump())


# ─── API-RL-01：内置指标目录（F-RL-01/02，只读） ───────
# 规则接口不校验 X-Session-Id：自定义规则跨会话共享（F-RL-06）。
@router.get("/metrics")
def get_metrics():
    return ok([m.model_dump() for m in list_metrics()])


# ─── API-RL-02~05：自定义规则 CRUD（F-RL-03/06） ───────
@router.get("/rules")
def list_rules_endpoint():
    return ok([r.model_dump(mode="json") for r in store.list_rules()])


@router.post("/rules")
def create_rule_endpoint(req: CustomRuleInput):
    try:
        rule = store.create_rule(req)
    except RuleValidationError as exc:
        return JSONResponse(
            status_code=422, content=fail(-1, "规则校验失败", {"reasons": exc.reasons})
        )
    return ok(rule.model_dump(mode="json"), message="已保存")


@router.put("/rules/{rule_id}")
def update_rule_endpoint(rule_id: str, req: CustomRuleInput):
    try:
        rule = store.update_rule(rule_id, req)
    except KeyError:
        return JSONResponse(status_code=404, content=fail(-1, "规则不存在"))
    except RuleValidationError as exc:
        return JSONResponse(
            status_code=422, content=fail(-1, "规则校验失败", {"reasons": exc.reasons})
        )
    return ok(rule.model_dump(mode="json"), message="已更新")


@router.delete("/rules/{rule_id}")
def delete_rule_endpoint(rule_id: str):
    if not store.delete_rule(rule_id):
        return JSONResponse(status_code=404, content=fail(-1, "规则不存在"))
    return ok(None, message="已删除")


# ─── F-RL-08：规则集导入导出（P2） ─────────────────────
@router.get("/rules/export")
def export_rules_endpoint():
    payload = store.export_rules()
    return ok(payload.model_dump(mode="json"))


@router.post("/rules/import")
def import_rules_endpoint(req: RuleImportPayload):
    result = store.import_rules(req)
    return ok(result.model_dump(), message=f"导入完成：新增 {result.created}，更新 {result.updated}，跳过 {result.skipped}")


# ─── API-PG-02：EXPLAIN 试运行（F-PG-08） ──────────────────
@router.post("/explain")
def explain_endpoint(req: ExplainRequest, x_session_id: str | None = Header(None)):
    sess = _require_session(x_session_id)
    if isinstance(sess, JSONResponse):
        return sess
    try:  # 校验数据源存在（轻量，不借连接）
        registry.get_dialect(sess, req.datasourceId)
    except KeyError:
        return JSONResponse(status_code=404, content=fail(-1, "数据源不存在"))

    conn = None
    broken = False
    try:
        conn = registry.get_conn(sess, req.datasourceId)
    except KeyError:
        return JSONResponse(status_code=404, content=fail(-1, "数据源不存在"))
    except DataSourceConnectError as exc:
        return JSONResponse(
            status_code=422,
            content=fail(-1, exc.result.message or "连接失败", exc.result.model_dump()),
        )

    try:
        explain_ok, err = explain_sql(conn, req.sql)
        broken = (not explain_ok and bool(err) and "超时" in err)  # 超时已关连接
    except Exception:  # noqa: BLE001 - 驱动异常兜底
        logger.exception("explain failed: %s", req.datasourceId)
        broken = True
        return JSONResponse(status_code=500, content=fail(-2, "EXPLAIN 执行失败"))
    finally:
        if conn is not None:
            registry.release_conn(sess, req.datasourceId, conn, broken=broken)
    return ok(ExplainResult(ok=explain_ok, error=err).model_dump())


# ─── API-PG-01：生成探查脚本（F-PG-05~10） ──────────────────
def _needs_reflection_conn(req: GenerateProfileRequest, sel_metrics, sel_rules) -> bool:
    """是否需要借连接做反射（source=database / needsColumn 且表未显式给列）。"""
    if req.sourceType == "database":
        return True
    needs_any_col = any(m.needsColumn for m in sel_metrics) or any(
        r.needsColumn for r in sel_rules
    )
    if not needs_any_col:
        return False
    tables = req.tables or []
    cols = req.columns or {}
    return any(not cols.get(t) for t in tables)


@router.post("/generate")
def generate_profile_endpoint(req: GenerateProfileRequest, x_session_id: str | None = Header(None)):
    sess = _require_session(x_session_id)
    if isinstance(sess, JSONResponse):
        return sess
    try:  # 派生方言 + 校验数据源存在
        dialect = registry.get_dialect(sess, req.datasourceId)
    except KeyError:
        return JSONResponse(status_code=404, content=fail(-1, "数据源不存在"))

    metrics = list_metrics()
    rules = store.list_rules()
    sel_metrics = [m for m in metrics if m.id in req.metricIds]
    sel_rules = [r for r in rules if r.id in req.customRuleIds]

    # 反射连接（source=database / 列反射）；EXPLAIN 由 explain_fn 每段独立借连接
    refl_conn = None
    if _needs_reflection_conn(req, sel_metrics, sel_rules):
        try:
            refl_conn = registry.get_conn(sess, req.datasourceId)
        except KeyError:
            return JSONResponse(status_code=404, content=fail(-1, "数据源不存在"))
        except DataSourceConnectError as exc:
            return JSONResponse(
                status_code=422,
                content=fail(-1, exc.result.message or "连接失败", exc.result.model_dump()),
            )

    # 自定义段 EXPLAIN：每段独立借连接，隔离超时（plan §6 难点 4/7）
    explain_fn = None
    if req.customRuleIds:
        def explain_fn(sql: str) -> tuple[bool, str | None]:
            conn = None
            broken = False
            try:
                conn = registry.get_conn(sess, req.datasourceId)
            except KeyError:
                return False, "数据源不存在"
            except DataSourceConnectError as exc:
                return False, exc.result.message or "连接失败"
            try:
                explain_ok, err = explain_sql(conn, sql)
                broken = (not explain_ok and bool(err) and "超时" in err)
                return explain_ok, err
            finally:
                registry.release_conn(sess, req.datasourceId, conn, broken=broken)

    try:
        resp = generate(
            req, refl_conn, dialect, metrics, rules,
            chat_fn=chat_json, explain_fn=explain_fn,
        )
    except GenerateError as exc:  # 表数超限 / 非法标识符 / 缺来源参数
        return JSONResponse(status_code=422, content=fail(-1, str(exc)))
    except LLMClientError as exc:  # LLM 上游不可用：超时 504，其余 500
        msg = str(exc)
        if "timeout" in msg.lower() or "超时" in msg:
            return JSONResponse(status_code=504, content=fail(-1, "LLM 调用超时"))
        return JSONResponse(status_code=500, content=fail(-2, msg))
    except Exception as exc:  # noqa: BLE001 - 生成异常兜底，避免 500 泄漏栈
        logger.exception("generate failed: %s", req.datasourceId)
        return JSONResponse(status_code=500, content=fail(-2, f"生成失败：{str(exc)[:200]}"))
    finally:
        if refl_conn is not None:
            registry.release_conn(sess, req.datasourceId, refl_conn, broken=False)
    return ok(resp.model_dump(mode="json"))
