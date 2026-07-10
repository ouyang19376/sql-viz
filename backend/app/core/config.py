"""应用配置常量。"""
import os
from pathlib import Path

from dotenv import load_dotenv

# 项目根：backend/
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# 启动时加载 .env（不存在则静默跳过；测试环境下用不到 LLM 时也不影响导入）
load_dotenv(BASE_DIR / ".env")

# 方言 JSON 数据目录
DATA_DIR = BASE_DIR / "app" / "data" / "sql"

# ─── BI 报表落盘配置（PRD-bi §5.4） ───────────────────────
# 数据集落本地磁盘；首次访问自动创建。gitignore 已忽略该目录。
BI_DATA_DIR = BASE_DIR / "app" / "data" / "bi_datasets"
BI_MAX_UPLOAD_MB = int(os.environ.get("BI_MAX_UPLOAD_MB", "10"))

# CORS 允许来源：优先读环境变量 CORS_ORIGINS（逗号分隔，用于生产部署），
# 未设置时回退到开发阶段前端 Vite 默认端口。
_default_cors_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
_env_cors_origins = os.environ.get("CORS_ORIGINS", "")
CORS_ORIGINS = (
    # 逐项去空白并剥离误带的引号（粘贴到 Render 时偶发包裹 " 或 '），避免来源比对失败
    [o.strip().strip('"').strip("'") for o in _env_cors_origins.split(",") if o.strip()]
    if _env_cors_origins
    else _default_cors_origins
)

# ─── LLM 调用配置（F-BK-DT-03） ───────────────────────────
# 读取使用 os.environ.get；空字符串视作未配置，由 llm_client 在首次调用时校验
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.deepseek.com/v1")
LLM_MODEL = os.environ.get("LLM_MODEL", "deepseek-chat")
LLM_TIMEOUT_SECONDS = int(os.environ.get("LLM_TIMEOUT_SECONDS", "60"))
LLM_MAX_TOKENS = int(os.environ.get("LLM_MAX_TOKENS", "8192"))

# ─── 测试数据集输入侧限制（F-LM-03） ─────────────────────
# 与 Pydantic 模型常量保持一致（datatest_models.py 引用）
DATATEST_MAX_ROWS = int(os.environ.get("DATATEST_MAX_ROWS", "1000"))
DATATEST_MAX_PROMPT_LEN = int(os.environ.get("DATATEST_MAX_PROMPT_LEN", "2000"))
DATATEST_MAX_FIELDS = int(os.environ.get("DATATEST_MAX_FIELDS", "50"))

# ─── SQL 血缘分析输入侧限制（PRD-ana §6.5） ───────────────
LINEAGE_SQL_MAX_CHARS = int(os.environ.get("LINEAGE_SQL_MAX_CHARS", "50000"))

# ─── Neo4j 推送配置（F-EX-07） ──────────────────────────
NEO4J_URI = os.environ.get("NEO4J_URI", "")
NEO4J_USERNAME = os.environ.get("NEO4J_USERNAME", "")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "")
NEO4J_DATABASE = os.environ.get("NEO4J_DATABASE", "")

# ─── 数据探查（PRD-dataprofile §1.5） ───────────────────
# 会话态连接池，内存驻留不落盘；Hive 驱动按方言可选 import，缺失时降级。
PROFILE_SESSION_TTL_SECONDS = int(os.environ.get("PROFILE_SESSION_TTL_SECONDS", "1800"))
PROFILE_CONN_TIMEOUT_SECONDS = int(os.environ.get("PROFILE_CONN_TIMEOUT_SECONDS", "10"))
PROFILE_POOL_SIZE = int(os.environ.get("PROFILE_POOL_SIZE", "3"))
PROFILE_MAX_TABLES = int(os.environ.get("PROFILE_MAX_TABLES", "200"))
# 查询工作台资源护栏（PRD-dataprofile §8.2 / F-QB-04）
PROFILE_QUERY_TIMEOUT_SECONDS = int(os.environ.get("PROFILE_QUERY_TIMEOUT_SECONDS", "30"))
PROFILE_MAX_ROWS = int(os.environ.get("PROFILE_MAX_ROWS", "200"))  # 每页行数上限
PROFILE_MAX_CELL_CHARS = int(os.environ.get("PROFILE_MAX_CELL_CHARS", "5000"))  # 单元格截断
PROFILE_HIVE_MAX_OFFSET = int(os.environ.get("PROFILE_HIVE_MAX_OFFSET", "10000"))  # F-QB-08
# 自定义规则持久化（PRD-dataprofile F-RL-06，JSON 文件跨会话共享）
PROFILE_RULES_DIR = BASE_DIR / "app" / "data" / "profile_rules"
PROFILE_RULES_FILE = PROFILE_RULES_DIR / "rules.json"
# 探查脚本生成（PRD-dataprofile F-PG-08/09，§8.4）
PROFILE_GENERATE_EXPLAIN_RETRIES = int(os.environ.get("PROFILE_GENERATE_EXPLAIN_RETRIES", "2"))
PROFILE_GENERATE_TOPN = int(os.environ.get("PROFILE_GENERATE_TOPN", "10"))  # topn_frequency 默认 N
