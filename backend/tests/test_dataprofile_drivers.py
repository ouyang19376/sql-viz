"""数据探查 - 驱动工厂测试（F-DS-02）。

驱动可能未安装，故 create_conn 用假驱动模块验证分发逻辑；
classify_error 为纯字符串启发式，无需驱动。
"""
import pytest

from app.services import dataprofile_drivers as drv
from app.services.dataprofile_models import DataSourceConfig
from tests._dp_fakes import FakeDriverModule


def _cfg(dialect="mysql", password="pw"):
    return DataSourceConfig(
        name="t", dialect=dialect, host="h", port=3306,
        database="db", username="u", password=password,
    )


class TestClassifyError:
    def test_auth_failed(self):
        assert drv.classify_error(Exception("(1045, 'Access denied for user')")) == "auth_failed"
        assert drv.classify_error(Exception("invalid authorization specification")) == "auth_failed"

    def test_db_not_found(self):
        assert drv.classify_error(Exception("(1049, 'Unknown database')")) == "db_not_found"
        assert drv.classify_error(Exception('database "foo" does not exist')) == "db_not_found"

    def test_host_unreachable(self):
        assert drv.classify_error(Exception("Can't connect to MySQL server")) == "host_unreachable"
        assert drv.classify_error(Exception("Connection refused")) == "host_unreachable"
        assert drv.classify_error(Exception("operation timed out")) == "host_unreachable"

    def test_driver_error_default(self):
        assert drv.classify_error(Exception("some weird internal error")) == "driver_error"


class TestCreateConnDispatch:
    def test_mysql_calls_pymysql_connect(self, monkeypatch):
        fake = FakeDriverModule()
        monkeypatch.setattr(drv, "_PYMYSQL_AVAILABLE", True)
        monkeypatch.setattr(drv, "pymysql", fake)
        conn = drv.create_conn(_cfg("mysql"))
        assert conn is not None
        assert len(fake.connect_calls) == 1
        call = fake.connect_calls[-1]
        assert call["host"] == "h" and call["port"] == 3306
        assert call["user"] == "u" and call["password"] == "pw"
        assert call["database"] == "db"

    def test_postgresql_uses_dbname(self, monkeypatch):
        fake = FakeDriverModule()
        monkeypatch.setattr(drv, "_PSYCOPG_AVAILABLE", True)
        monkeypatch.setattr(drv, "psycopg", fake)
        drv.create_conn(_cfg("postgresql"))
        call = fake.connect_calls[-1]
        assert call["dbname"] == "db"  # psycopg 用 dbname 而非 database
        assert call["user"] == "u"

    def test_hive_auth_depends_on_password(self, monkeypatch):
        captured: list[dict] = []
        fake_module = type("M", (), {})()
        fake_module.Connection = lambda **kw: captured.append(kw) or object()
        monkeypatch.setattr(drv, "_PYHIVE_AVAILABLE", True)
        monkeypatch.setattr(drv, "pyhive_hive", fake_module)
        # 无密码 -> auth NONE
        drv.create_conn(_cfg("hive", password=""))
        assert captured[-1]["auth"] == "NONE"
        # 有密码 -> auth LDAP
        drv.create_conn(_cfg("hive", password="pw"))
        assert captured[-1]["auth"] == "LDAP"

    def test_dialect_not_available(self, monkeypatch):
        monkeypatch.setattr(drv, "_PYMYSQL_AVAILABLE", False)
        monkeypatch.setattr(drv, "_PSYCOPG_AVAILABLE", False)
        monkeypatch.setattr(drv, "_PYHIVE_AVAILABLE", False)
        with pytest.raises(drv.DialectNotAvailableError):
            drv.create_conn(_cfg("mysql"))


class TestPing:
    def test_ping_returns_version(self, monkeypatch):
        # 借 FakeConn：SELECT 1 返回行，version 查询返回行
        from tests._dp_fakes import FakeConn
        def rows_for(sql, params):
            return [("8.0.32",)] if "VERSION" in sql.upper() or "version" in sql.lower() else [(1,)]
        conn = FakeConn(rows_for=rows_for)
        assert drv.ping(conn, "mysql") == "8.0.32"
