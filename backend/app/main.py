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


# F-LM-05：避免第三方 SDK 在调试日志中输出包含 SQL 的请求体。
logging.getLogger("openai").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时加载方言数据到内存
    load_all_data()
    yield


app = FastAPI(title="SQL Viz API", version="1.0.0", lifespan=lifespan)

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
