"""数据探查 - 会话态连接池测试（F-DS-03/05/06/08/09/10）。

无实库：monkeypatch session 模块引用的 create_conn/ping/is_dialect_available。
每用例用独立 SessionRegistry() 实例，避免跨用例污染。
"""
import time

import pytest

from app.services import dataprofile_session as sess_mod
from app.services.dataprofile_session import DataSourceConnectError, SessionRegistry
from app.services.dataprofile_models import DataSourceConfig
from tests._dp_fakes import FakeConn


def _cfg(name="ds", password="pw", dialect="mysql"):
    return DataSourceConfig(
        name=name, dialect=dialect, host="h", port=3306,
        database="db", username="u", password=password,
    )


@pytest.fixture
def drivers(monkeypatch):
    """桩驱动：记录每次 create_conn 入参与返回，可注入异常。"""
    state = {"exc": None, "version": "8.0.32", "created": []}

    def fake_create(config):
        if state["exc"] is not None:
            exc = state["exc"]
            state["exc"] = None  # 一次性，避免影响后续步骤
            raise exc
        c = FakeConn()
        c.config = config
        state["created"].append(c)
        return c

    monkeypatch.setattr(sess_mod, "create_conn", fake_create)
    monkeypatch.setattr(sess_mod, "ping", lambda conn, dialect: state["version"])
    monkeypatch.setattr(sess_mod, "is_dialect_available", lambda d: True)
    return state


class TestRegister:
    def test_returns_datasource_without_password(self, drivers):  # F-DS-08
        reg = SessionRegistry()
        ds = reg.register("s1", _cfg())
        assert "password" not in ds.model_dump()
        assert ds.status == "connected"

    def test_temp_conn_closed_after_register(self, drivers):  # 无连接泄漏
        reg = SessionRegistry()
        reg.register("s1", _cfg())
        assert drivers["created"][-1].closed is True

    def test_register_failure_raises_and_no_entry(self, drivers):  # F-DS-02/03
        drivers["exc"] = Exception("(1045, 'Access denied for user')")
        reg = SessionRegistry()
        with pytest.raises(DataSourceConnectError) as ei:
            reg.register("s1", _cfg())
        assert ei.value.result.errorType == "auth_failed"
        assert reg.list_sources("s1") == []  # 失败不留痕


class TestListAndMultiDatasource:
    def test_list_empty(self, drivers):
        assert SessionRegistry().list_sources("s1") == []

    def test_multi_datasource_independent(self, drivers):  # F-DS-10
        reg = SessionRegistry()
        a = reg.register("s1", _cfg(name="a"))
        b = reg.register("s1", _cfg(name="b"))
        ids = {d.id for d in reg.list_sources("s1")}
        assert ids == {a.id, b.id}
        # 断开一个，另一个仍在
        assert reg.disconnect("s1", a.id) is True
        remaining = {d.id for d in reg.list_sources("s1")}
        assert remaining == {b.id}

    def test_disconnect_unknown_returns_false(self, drivers):
        assert SessionRegistry().disconnect("s1", "ds_nope") is False


class TestPoolBorrow:
    def test_get_conn_creates_then_pools(self, drivers):  # 池复用
        reg = SessionRegistry()
        ds = reg.register("s1", _cfg())
        before = len(drivers["created"])
        c1 = reg.get_conn("s1", ds.id)
        assert len(drivers["created"]) == before + 1  # 新建 1
        reg.release_conn("s1", ds.id, c1)
        c2 = reg.get_conn("s1", ds.id)
        assert c2 is c1  # 复用池中连接，未新建
        assert len(drivers["created"]) == before + 1

    def test_release_broken_closes_conn(self, drivers):
        reg = SessionRegistry()
        ds = reg.register("s1", _cfg())
        c1 = reg.get_conn("s1", ds.id)
        reg.release_conn("s1", ds.id, c1, broken=True)
        assert c1.closed is True
        # 池应空：下次 get_conn 会新建
        c2 = reg.get_conn("s1", ds.id)
        assert c2 is not c1


class TestTTLAndReconnect:
    def test_ttl_lazily_expires_then_reconnect(self, drivers, monkeypatch):  # F-DS-09/05
        # 缩短 TTL 便于断言
        monkeypatch.setattr(sess_mod, "PROFILE_SESSION_TTL_SECONDS", 0.01)
        reg = SessionRegistry()
        ds = reg.register("s1", _cfg())
        time.sleep(0.02)
        reg.gc("s1")
        assert reg.list_sources("s1")[0].status == "expired"
        # 重连：用内存中存的密码（无需重输）
        seen_pw = []
        orig = sess_mod.create_conn
        monkeypatch.setattr(sess_mod, "create_conn",
                            lambda config: seen_pw.append(config.password) or orig(config))
        ds2 = reg.reconnect("s1", ds.id)
        assert ds2.status == "connected"
        assert seen_pw[-1] == "pw"  # 复用了存储的凭证

    def test_reconnect_unknown_raises_keyerror(self, drivers):
        with pytest.raises(KeyError):
            SessionRegistry().reconnect("s1", "ds_nope")


class TestEdit:
    def test_edit_reuses_password_when_empty(self, drivers, monkeypatch):  # F-DS-06
        reg = SessionRegistry()
        ds = reg.register("s1", _cfg(password="pw1"))
        seen: list[str] = []
        orig = sess_mod.create_conn
        monkeypatch.setattr(
            sess_mod, "create_conn",
            lambda config: seen.append(config.password) or orig(config),
        )
        reg.edit("s1", ds.id, _cfg(name="ds", password=""))
        assert seen[-1] == "pw1"  # 留空复用了旧密码

    def test_edit_failure_keeps_old_connected(self, drivers):  # 不破坏可用性
        reg = SessionRegistry()
        ds = reg.register("s1", _cfg())
        drivers["exc"] = Exception("(1045, 'Access denied')")
        with pytest.raises(DataSourceConnectError):
            reg.edit("s1", ds.id, _cfg(password="bad"))
        # 旧连接原样可用
        assert reg.list_sources("s1")[0].status == "connected"

    def test_edit_unknown_raises_keyerror(self, drivers):
        with pytest.raises(KeyError):
            SessionRegistry().edit("s1", "ds_nope", _cfg())


class TestSchemaCache:  # F-DS-07 会话内反射缓存
    def test_miss_then_hit(self, drivers):
        reg = SessionRegistry()
        ds = reg.register("s1", _cfg())
        key = ("schemas",)
        assert reg.cache_get("s1", ds.id, key) is sess_mod.CACHE_MISS  # 未缓存
        reg.cache_set("s1", ds.id, key, ["db1", "db2"])
        assert reg.cache_get("s1", ds.id, key) == ["db1", "db2"]  # 命中

    def test_empty_list_cached_distinct_from_miss(self, drivers):
        # 区分「未缓存」与「缓存了空列表」：空列表应命中而非 miss
        reg = SessionRegistry()
        ds = reg.register("s1", _cfg())
        key = ("tables", "db1")
        reg.cache_set("s1", ds.id, key, [])
        got = reg.cache_get("s1", ds.id, key)
        assert got is not sess_mod.CACHE_MISS
        assert got == []

    def test_edit_clears_cache(self, drivers):
        reg = SessionRegistry()
        ds = reg.register("s1", _cfg())
        reg.cache_set("s1", ds.id, ("schemas",), ["db1"])
        reg.edit("s1", ds.id, _cfg(name="new", password="pw"))  # 配置变更 -> 清缓存
        assert reg.cache_get("s1", ds.id, ("schemas",)) is sess_mod.CACHE_MISS

    def test_reconnect_clears_cache(self, drivers):
        # 重连提供「刷新元数据」语义
        reg = SessionRegistry()
        ds = reg.register("s1", _cfg())
        reg.cache_set("s1", ds.id, ("tables", "db1"), ["users"])
        reg.reconnect("s1", ds.id)
        assert reg.cache_get("s1", ds.id, ("tables", "db1")) is sess_mod.CACHE_MISS

    def test_cache_missing_datasource(self, drivers):
        # 不存在的数据源 -> miss（不抛错）
        reg = SessionRegistry()
        assert reg.cache_get("s1", "ds_nope", ("schemas",)) is sess_mod.CACHE_MISS
        reg.cache_set("s1", "ds_nope", ("schemas",), ["x"])  # 静默丢弃
        assert reg.cache_get("s1", "ds_nope", ("schemas",)) is sess_mod.CACHE_MISS
