"""BI 地图 GeoJSON 代理 — 城市级地图在线懒加载的降级方案（F-VZ-07）。

前端浏览器直连 DataV `geo.datav.aliyun.com` 被其 CDN 以 403 拦截（跨域），
故城市级边界由后端代理转发：服务端请求不受 CORS 限制，并磁盘缓存避免重复下载。
全国省级 GeoJSON 仍离线内置在前端 data/china-provinces.json。
"""
from __future__ import annotations

import json
from pathlib import Path

import httpx

from app.core.config import BI_DATA_DIR

# DataV 省级下钻城市边界：{adcode}_full.json（如 420000=湖北全省下辖市州）
_DATAV_URL = "https://geo.datav.aliyun.com/areas_v3/bound/{adcode}_full.json"
_CACHE_DIR = BI_DATA_DIR.parent / "geo_cache"
_TIMEOUT = 10.0


def is_valid_adcode(adcode: str) -> bool:
    """adcode 为 6 位数字行政代码（省级码如 420000=湖北）。"""
    return adcode.isdigit() and len(adcode) == 6


def _cache_path(adcode: str) -> Path:
    return _CACHE_DIR / f"{adcode}.json"


def load_city_geo(adcode: str) -> dict:
    """返回某省城市边界 GeoJSON（dict）：命中磁盘缓存直接读，否则下载并落盘。

    DataV 不可达 / 非 200 / 非 GeoJSON → 抛 RuntimeError，由路由转 502。
    """
    cache = _cache_path(adcode)
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))

    resp = httpx.get(_DATAV_URL.format(adcode=adcode), timeout=_TIMEOUT)
    if resp.status_code != 200:
        raise RuntimeError(f"DataV 返回 {resp.status_code}")
    geo = resp.json()
    if not isinstance(geo, dict) or "features" not in geo:
        raise RuntimeError("DataV 返回非 GeoJSON")

    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(geo, ensure_ascii=False), encoding="utf-8")
    return geo
