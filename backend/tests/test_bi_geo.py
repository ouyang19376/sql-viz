"""BI 城市级地图 GeoJSON 代理测试（F-VZ-07 降级方案）。

不依赖外网：校验 adcode 合法性 + 磁盘缓存命中不再触网。
真实下载（httpx → DataV）由部署后手测验证（curl 已确认服务端可达）。
"""
import json

from fastapi.testclient import TestClient

from app.main import app
from app.services import bi_geo


def test_geo_invalid_adcode_422():
    """非 6 位数字 adcode → 422，不触网。"""
    with TestClient(app) as c:
        for bad in ("abc", "42", "42000", "4200000"):
            resp = c.get(f"/api/bi/geo/city/{bad}")
            assert resp.status_code == 422, bad


def test_geo_cache_hit_no_network(tmp_path, monkeypatch):
    """缓存命中：直接读磁盘，不发起 httpx 请求。"""
    monkeypatch.setattr(bi_geo, "_CACHE_DIR", tmp_path)
    geo = {"type": "FeatureCollection", "features": []}
    (tmp_path / "420000.json").write_text(json.dumps(geo), encoding="utf-8")
    assert bi_geo.load_city_geo("420000") == geo


def test_adcode_validation():
    assert bi_geo.is_valid_adcode("420000") is True
    assert bi_geo.is_valid_adcode("110000") is True
    assert bi_geo.is_valid_adcode("abc") is False
    assert bi_geo.is_valid_adcode("42") is False
