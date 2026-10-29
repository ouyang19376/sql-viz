"""pytest 共享配置：把数据建模平台（/modeling 子应用）的数据库指到临时目录。

主应用 lifespan 会驱动建模平台的启动流程（Alembic 迁移 + 演示数据播种），
若沿用其默认的 `sqlite:///./data/platform.db`，一跑测试就会在 `backend/data/`
下落一个真实库。这里在**任何 app.* 被导入之前**改环境变量（settings 是导入时
读取环境变量的模块级单例，conftest 先于测试模块加载，故时序可靠），
让测试跑在一次性的临时库上。
"""

import os
import tempfile
from pathlib import Path

_TMP_DB_DIR = Path(tempfile.mkdtemp(prefix="sqlviz_modeling_test_"))

os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TMP_DB_DIR / 'platform.db'}")
# 启动时 _ensure_data_dir() 会 mkdir data_dir，一并指到临时目录，
# 否则跑一次测试就会在 backend/ 下留一个空的 data/。
os.environ.setdefault("DATA_DIR", str(_TMP_DB_DIR))
# 测试不需要演示数据（建模平台的最小演示集与宿主测试无关）
os.environ.setdefault("SEED_DEMO_DATA", "false")
