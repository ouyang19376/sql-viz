"""数据探查 - 会话态连接池（PRD-dataprofile §5.1 / §8，F-DS-03/06/08/09/10）。

内存级 SessionRegistry：{session_id: {ds_id: _Entry}}，进程重启即失效。
- threading.Lock 保护字典读写；每 datasource 一个 queue.Queue 连接池。
- TTL 惰性清理（难点 1）：访问时检查 last_access，超时降级为 expired 并关池，
  保留配置供「点此重连」（F-DS-05），无需重输密码。
- 凭证隔离（F-DS-08）：Entry 持有含密码的 config，但 list/get 只产出 DataSource（无密码）。
- 多数据源并发（F-DS-10）：session 下多 ds 各自独立池。
"""
from __future__ import annotations

import threading
import time
import uuid
from queue import Empty, Full, Queue
from typing import Any

from app.core.config import PROFILE_POOL_SIZE, PROFILE_SESSION_TTL_SECONDS
from app.services.dataprofile_drivers import (
    DialectNotAvailableError,
    classify_error,
    create_conn,
    is_dialect_available,
    ping,
)
from app.services.dataprofile_models import (
    DataSource,
    DataSourceConfig,
    DataSourceStatus,
    TestResult,
)

# 缓存未命中哨兵（区分「未缓存」与「缓存了空列表」）
CACHE_MISS = object()


class DataSourceConnectError(RuntimeError):
    """注册/重连时连通或认证失败，承载 TestResult 供路由回传。"""

    def __init__(self, result: TestResult):
        super().__init__(result.message or "连接失败")
        self.result = result


class _Entry:
    """单个已注册数据源的运行时态。config 含密码（仅内存）。"""

    __slots__ = ("config", "pool", "status", "last_error", "last_access", "connected_at", "schema_cache")

    def __init__(self, config: DataSourceConfig):
        self.config = config
        self.pool: Queue = Queue(maxsize=PROFILE_POOL_SIZE)
        self.status: DataSourceStatus = "connected"
        self.last_error: str | None = None
        self.last_access: float = time.time()
        self.connected_at: int = int(time.time())
        self.schema_cache: dict = {}  # F-DS-07 会话内反射缓存


def _ds_id() -> str:
    return "ds_" + uuid.uuid4().hex[:8]


class SessionRegistry:
    """会话级数据源注册表（模块单例 registry）。"""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sessions: dict[str, dict[str, _Entry]] = {}

    # ─── 测试（不入池） ───────────────────────────────────
    def test_only(self, config: DataSourceConfig) -> TestResult:
        """临时连接 + ping，结束即关。返回 TestResult（API-DS-02）。"""
        if not config.password:
            return TestResult(
                ok=False, dialect=config.dialect,
                errorType="auth_failed", message="密码不能为空",
            )
        if not is_dialect_available(config.dialect):
            return TestResult(
                ok=False, dialect=config.dialect,
                errorType="driver_missing",
                message=f"{config.dialect} 驱动未安装，请先安装依赖",
            )
        conn: Any = None
        try:
            conn = create_conn(config)
            version = ping(conn, config.dialect)
            return TestResult(ok=True, dialect=config.dialect, version=version)
        except Exception as exc:  # noqa: BLE001 - 驱动异常归一化为 error_type
            return TestResult(
                ok=False, dialect=config.dialect,
                errorType=classify_error(exc),
                message=str(exc)[:300],
            )
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:  # noqa: BLE001
                    pass

    # ─── 注册（建池） ─────────────────────────────────────
    def register(self, session_id: str, config: DataSourceConfig) -> DataSource:
        if not config.password:
            raise ValueError("password required")
        result = self.test_only(config)
        if not result.ok:
            raise DataSourceConnectError(result)
        entry = _Entry(config)
        ds_id = _ds_id()
        with self._lock:
            self._sessions.setdefault(session_id, {})[ds_id] = entry
        return self._to_data_source(ds_id, entry)

    # ─── 列表（含惰性 TTL） ───────────────────────────────
    def list_sources(self, session_id: str) -> list[DataSource]:
        with self._lock:
            sess = self._sessions.get(session_id, {})
            now = time.time()
            out: list[DataSource] = []
            for ds_id, entry in sess.items():
                self._maybe_expire(entry, now)
                out.append(self._to_data_source(ds_id, entry))
            return out

    # ─── 取方言（供 schema 层，轻量） ───────────────────
    def get_dialect(self, session_id: str, ds_id: str) -> str:
        with self._lock:
            entry = self._require_locked(session_id, ds_id)
            return entry.config.dialect

    # ─── 借连接（供 schema/query；自动重连 expired） ──────
    def get_conn(self, session_id: str, ds_id: str) -> Any:
        entry = self._require(session_id, ds_id)
        with self._lock:
            self._maybe_expire(entry, time.time())
            if entry.status in ("expired", "error", "disconnected"):
                self._reconnect_locked(entry)  # 失败抛 DataSourceConnectError
            entry.last_access = time.time()
            pool = entry.pool
        try:
            return pool.get_nowait()
        except Empty:
            return create_conn(entry.config)

    def release_conn(self, session_id: str, ds_id: str, conn: Any, *, broken: bool = False) -> None:
        """归还连接；broken=True 表示该连接已不可用，直接关闭不入池。"""
        if broken:
            self._close_quietly(conn)
            return
        entry = self._find(session_id, ds_id)
        if entry is None:
            self._close_quietly(conn)
            return
        try:
            entry.pool.put_nowait(conn)
        except Full:
            self._close_quietly(conn)

    # ─── Schema 反射缓存（F-DS-07 会话内缓存） ───────────
    def cache_get(self, session_id: str, ds_id: str, key: Any) -> Any:
        """取反射缓存；未命中返回 CACHE_MISS（区分「未缓存」与「缓存空列表」）。"""
        with self._lock:
            entry = self._sessions.get(session_id, {}).get(ds_id)
            if entry is None:
                return CACHE_MISS
            return entry.schema_cache.get(key, CACHE_MISS)

    def cache_set(self, session_id: str, ds_id: str, key: Any, value: Any) -> None:
        """写反射缓存（已 model_dump 的可序列化载荷）。"""
        with self._lock:
            entry = self._sessions.get(session_id, {}).get(ds_id)
            if entry is not None:
                entry.schema_cache[key] = value

    # ─── 断开（销毁池） ───────────────────────────────────
    def disconnect(self, session_id: str, ds_id: str) -> bool:
        with self._lock:
            sess = self._sessions.get(session_id)
            if not sess or ds_id not in sess:
                return False
            entry = sess.pop(ds_id)
        self._drain_pool(entry)
        return True

    # ─── 编辑（断旧建新，同 id） ─────────────────────────
    def edit(self, session_id: str, ds_id: str, config: DataSourceConfig) -> DataSource:
        # password 留空 = 复用旧密码（F-DS-06）
        with self._lock:
            sess = self._sessions.get(session_id)
            if not sess or ds_id not in sess:
                raise KeyError(ds_id)
            old = sess[ds_id]
            if not config.password:
                config = config.model_copy(update={"password": old.config.password})
        # 先测新配置：失败则旧连接原样保留，不破坏可用性
        result = self.test_only(config)
        if not result.ok:
            raise DataSourceConnectError(result)
        with self._lock:
            entry = sess.get(ds_id)
            if entry is None:
                raise KeyError(ds_id)
            self._drain_pool(entry)
            entry.schema_cache = {}  # 配置变更 -> 元数据可能不同，清缓存
            entry.config = config
            entry.pool = Queue(maxsize=PROFILE_POOL_SIZE)
            entry.status = "connected"
            entry.last_error = None
            entry.last_access = time.time()
            entry.connected_at = int(time.time())
            return self._to_data_source(ds_id, entry)

    # ─── 重连（expired/error -> connected） ───────────────
    def reconnect(self, session_id: str, ds_id: str) -> DataSource:
        with self._lock:
            entry = self._require_locked(session_id, ds_id)
            self._reconnect_locked(entry)
            return self._to_data_source(ds_id, entry)

    # ─── 惰性 TTL（难点 1）：调用方持锁 ─────────────────
    def gc(self, session_id: str) -> None:
        """路由每次访问调用：将该 session 下超时 ds 降级 expired 并关池。"""
        with self._lock:
            sess = self._sessions.get(session_id)
            if not sess:
                return
            now = time.time()
            for entry in sess.values():
                self._maybe_expire(entry, now)

    # ─── 内部 ───────────────────────────────────────────
    def _maybe_expire(self, entry: _Entry, now: float) -> None:
        if entry.status == "connected" and now - entry.last_access > PROFILE_SESSION_TTL_SECONDS:
            entry.status = "expired"
            self._drain_pool(entry)

    def _reconnect_locked(self, entry: _Entry) -> None:
        """重测 + 重建池（调用方持锁）。失败抛 DataSourceConnectError 并标 error。"""
        result = self.test_only(entry.config)
        if not result.ok:
            entry.status = "error"
            entry.last_error = result.message
            raise DataSourceConnectError(result)
        entry.schema_cache = {}  # 重连提供「刷新元数据」语义
        entry.pool = Queue(maxsize=PROFILE_POOL_SIZE)
        entry.status = "connected"
        entry.last_error = None
        entry.last_access = time.time()
        entry.connected_at = int(time.time())

    def _require(self, session_id: str, ds_id: str) -> _Entry:
        with self._lock:
            return self._require_locked(session_id, ds_id)

    def _require_locked(self, session_id: str, ds_id: str) -> _Entry:
        sess = self._sessions.get(session_id)
        if not sess or ds_id not in sess:
            raise KeyError(ds_id)
        return sess[ds_id]

    def _find(self, session_id: str, ds_id: str) -> _Entry | None:
        with self._lock:
            sess = self._sessions.get(session_id)
            if not sess:
                return None
            return sess.get(ds_id)

    @staticmethod
    def _drain_pool(entry: _Entry) -> None:
        while True:
            try:
                conn = entry.pool.get_nowait()
            except Empty:
                break
            SessionRegistry._close_quietly(conn)

    @staticmethod
    def _close_quietly(conn: Any) -> None:
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            pass

    @staticmethod
    def _to_data_source(ds_id: str, entry: _Entry) -> DataSource:
        # DataSource 模型本身无 password 字段 -> 凭证隔离由模型收口（F-DS-08）
        return DataSource(
            id=ds_id,
            name=entry.config.name,
            dialect=entry.config.dialect,
            host=entry.config.host,
            port=entry.config.port,
            database=entry.config.database,
            username=entry.config.username,
            status=entry.status,
            lastError=entry.last_error,
            connectedAt=entry.connected_at,
        )


# 模块级单例（uvicorn 单进程多线程共享）
registry = SessionRegistry()
