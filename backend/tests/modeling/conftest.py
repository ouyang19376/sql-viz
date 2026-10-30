"""数据建模平台（/modeling 子应用）测试套件的隔离配置。

**为什么需要单独一个 conftest**：`app.modeling.config.settings` 是导入时读取
环境变量的模块级单例，`app.modeling.db.engine` 也在导入时按该 DATABASE_URL 建连。
本套件的测试模块必须在导入 `app.modeling.*` 之前把库指到一次性临时目录，
否则会跑在宿主开发的 `backend/data/platform.db` 上。pytest 先加载 conftest、
后加载测试模块，所以环境变量在此设好即可生效。

用**赋值**而非 `setdefault`：父级 `tests/conftest.py` 已为宿主测试设过
`DATABASE_URL`，这里必须覆盖，否则建模平台的 207 个测试会落到宿主的临时库上。

与宿主测试分开跑（两套的数据库隔离方式不同，混跑会互相干扰）：

    python -m pytest tests/modeling/ -v    # 建模平台 207 个
    python -m pytest tests/ -v             # 宿主 416 个
"""

import os
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="sqlviz_modeling_suite_"))

os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP / 'platform.db'}"
os.environ["DATA_DIR"] = str(_TMP)
os.environ["AUTO_MIGRATE"] = "true"
os.environ["SEED_DEMO_DATA"] = "false"
os.environ["LOG_LEVEL"] = "WARNING"
