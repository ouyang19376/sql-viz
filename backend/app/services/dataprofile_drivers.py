"""数据探查 - 驱动工厂（PRD-dataprofile §1.3，F-DS-02 / F-DS-07）。

按方言创建只读 DBAPI 连接。Hive 依赖（pyhive+thrift+sasl）在 Windows 安装
易失败，故 try-import 降级：缺失时该方言不可用而非阻断启动（plan 难点 9）。
"""
from __future__ import annotations

from typing import Any

from app.core.config import PROFILE_CONN_TIMEOUT_SECONDS
from app.services.dataprofile_models import (
    DataSourceConfig,
    ProfileDialect,
    TestErrorType,
)

# ─── 可选驱动探测 ─────────────────────────────────────────
try:  # MySQL（纯 Python，Windows 友好）
    import pymysql  # type: ignore

    _PYMYSQL_AVAILABLE = True
except ImportError:  # pragma: no cover - 依赖未装时降级
    pymysql = None  # type: ignore
    _PYMYSQL_AVAILABLE = False

try:  # PostgreSQL（binary 免编译）
    import psycopg  # type: ignore

    _PSYCOPG_AVAILABLE = True
except ImportError:  # pragma: no cover
    psycopg = None  # type: ignore
    _PSYCOPG_AVAILABLE = False

try:  # Hive（可选，Windows 易失败）
    from pyhive import hive as pyhive_hive  # type: ignore

    _PYHIVE_AVAILABLE = True
except ImportError:  # pragma: no cover
    pyhive_hive = None  # type: ignore
    _PYHIVE_AVAILABLE = False


class DialectNotAvailableError(RuntimeError):
    """目标方言的驱动未安装（需安装依赖后启用）。"""


def available_dialects() -> set[str]:
    """运行时探测可用的方言集合（plan §1.3）。"""
    dialects: set[str] = set()
    if _PYMYSQL_AVAILABLE:
        dialects.add("mysql")
    if _PSYCOPG_AVAILABLE:
        dialects.add("postgresql")
    if _PYHIVE_AVAILABLE:
        dialects.add("hive")
    return dialects


def is_dialect_available(dialect: ProfileDialect) -> bool:
    return dialect in available_dialects()


def create_conn(config: DataSourceConfig) -> Any:
    """按方言创建 DBAPI 连接（不进池，调用方负责关闭/归还）。

    抛 DialectNotAvailableError：驱动未安装。
    抛底层驱动异常：由调用方 classify_error 归类。
    """
    dialect = config.dialect
    if not is_dialect_available(dialect):
        raise DialectNotAvailableError(f"{dialect} 驱动未安装")

    if dialect == "mysql":
        # type: ignore[union-attr]
        return pymysql.connect(  # type: ignore[union-attr]
            host=config.host,
            port=config.port,
            user=config.username,
            password=config.password,
            database=config.database or None,
            connect_timeout=PROFILE_CONN_TIMEOUT_SECONDS,
        )

    if dialect == "postgresql":
        return psycopg.connect(  # type: ignore[union-attr]
            host=config.host,
            port=config.port,
            user=config.username,
            password=config.password,
            dbname=config.database or None,
            connect_timeout=PROFILE_CONN_TIMEOUT_SECONDS,
        )

    if dialect == "hive":
        # Hive 认证方案多样，此处取最通用的本地/开发默认：无密码用 NONE，
        # 带密码用 LDAP（需服务端配置）。Hive 为「可启用」方言，best-effort。
        auth = "NONE" if not config.password else "LDAP"
        return pyhive_hive.Connection(  # type: ignore[union-attr]
            host=config.host,
            port=config.port,
            username=config.username,
            password=config.password or None,
            database=config.database or "default",
            auth=auth,
        )

    # 理论不可达（dialect 由 Pydantic Literal 收口）
    raise DialectNotAvailableError(f"不支持的方言：{dialect}")


def ping(conn: Any, dialect: ProfileDialect) -> str | None:
    """轻量连通性探测 + 取版本。返回 version 字符串（失败返回 None）。

    用 SELECT 1 探活；version 为方言查询，失败静默返回 None。
    """
    cur = conn.cursor()
    try:
        cur.execute("SELECT 1")
        cur.fetchone()
    finally:
        cur.close()

    version: str | None = None
    try:
        cur = conn.cursor()
        try:
            cur.execute(_VERSION_SQL[dialect])
            row = cur.fetchone()
            if row:
                version = str(row[0])
        finally:
            cur.close()
    except Exception:  # noqa: BLE001 - 版本查询失败不影响连通判定
        version = None
    return version


_VERSION_SQL = {
    "mysql": "SELECT VERSION()",
    "postgresql": "SELECT version()",
    "hive": "SELECT version()",
}


def classify_error(exc: BaseException) -> TestErrorType:
    """将底层驱动异常归一化为前端 error_type（plan §6.2 API-DS-02）。

    优先匹配驱动特定错误码（pymysql/psycopg），退化为字符串启发式，
    保证驱动未安装时也能正常分类（只接收已抛出的异常）。
    """
    msg = str(exc).lower()
    code = _exc_code(exc)

    # 认证失败
    auth_codes = {"1045", "28000", "28p01", "28p0c"}
    auth_hints = ("access denied", "authentication", "password", "login failed", "invalid authorization")
    if code in auth_codes or any(h in msg for h in auth_hints):
        return "auth_failed"

    # 库不存在
    db_codes = {"1049", "3d000"}
    db_hints = ("unknown database", "does not exist", "invalid catalog name")
    if code in db_codes or any(h in msg for h in db_hints):
        return "db_not_found"

    # 主机不可达 / 连接拒绝 / 超时
    host_codes = {"2002", "2003", "2005", "08001", "08006"}
    host_hints = (
        "can't connect", "cannot connect", "connection refused",
        "could not connect", "timed out", "timeout", "unreachable",
        "no route", "name or service not known",
    )
    if code in host_codes or any(h in msg for h in host_hints):
        return "host_unreachable"

    return "driver_error"


def _exc_code(exc: BaseException) -> str:
    """从异常 args[0] 取错误码（pymysql/psycopg 约定为 (code, message)）。"""
    args = getattr(exc, "args", None)
    if args and isinstance(args[0], (int, str)):
        return str(args[0])
    return ""
