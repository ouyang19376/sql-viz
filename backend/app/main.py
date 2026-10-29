"""FastAPI 入口 — CORS + 启动加载 + 路由注册。"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import CORS_ORIGINS
from app.core.loader import load_all_data
from app.routers.dialects import router as dialects_router
from app.routers.functions import router as functions_router
from app.routers.search import router as search_router
from app.routers.datatest import router as datatest_router
from app.routers.lineage import router as lineage_router
from app.routers.bi import router as bi_router
from app.routers.dataprofile import router as dataprofile_router
from app.routers.rag_sql import router as rag_sql_router
from app.routers.kbqa import router as kbqa_router

# 数据建模平台（原独立项目，整体并入）：自带 SQLAlchemy/Alembic、静态前端与
# 独立迁移链，路由与主应用零重叠，故作为子应用挂在 /modeling 子路径下。
from app.modeling.main import app as modeling_app
from app.modeling.main import startup as modeling_startup


# F-LM-05：避免第三方 SDK 在调试日志中输出包含 SQL 的请求体。
logging.getLogger("openai").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时加载方言数据到内存
    load_all_data()
    # Starlette 挂载子应用不会自动运行它的 lifespan，这里显式驱动其启动流程
    # （Alembic 迁移 + 演示数据播种 + 图谱基线补建）。调用 startup() 而非子应用
    # 的 lifespan：日志格式由本应用掌管。
    await modeling_startup()
    yield


app = FastAPI(title="SQL Viz API", version="1.0.0", lifespan=lifespan)

# 启动时打印生效的 CORS 白名单，便于在 Render 日志里核对环境变量是否被正确解析。
logging.getLogger(__name__).info("CORS allowed origins: %s", CORS_ORIGINS)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dialects_router)
app.include_router(functions_router)
app.include_router(search_router)
app.include_router(datatest_router)
app.include_router(lineage_router)
app.include_router(bi_router)
app.include_router(dataprofile_router)
app.include_router(rag_sql_router)
app.include_router(kbqa_router)

# 数据建模平台：/modeling 前缀下的完整子系统（/modeling/ 为其工作台页面，
# /modeling/api/* 为其 REST 接口）。前端经 iframe 嵌入首页「数据建模平台」入口。
app.mount("/modeling", modeling_app)


if __name__ == "__main__":
    # 直接以 `python -m app.main` 启动时，从环境变量 PORT 自取端口（默认 10000，
    # 对齐 Render 默认）。避免依赖启动命令里 `--port $PORT` 的 shell 展开——
    # 当 $PORT 未展开/为空时 uvicorn 会因 "--port requires an argument" 退出。
    import os

    import uvicorn

    port = int(os.environ.get("PORT", "10000"))
    uvicorn.run(app, host="0.0.0.0", port=port)

