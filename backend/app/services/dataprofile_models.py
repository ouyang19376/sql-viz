"""数据探查 - Pydantic 模型（PRD-dataprofile §5.4，DS 子模块）。

字段命名沿用既有代码库 camelCase 范式（与 datatest_models / bi_models 对齐），
TS 接口（前端 types/dataprofile.ts）与本文件一一对应。
"""
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, conint, conlist, constr

ProfileDialect = Literal["mysql", "hive", "postgresql"]
DataSourceStatus = Literal["connected", "disconnected", "expired", "error"]
TestErrorType = Literal[
    "host_unreachable",
    "auth_failed",
    "db_not_found",
    "driver_error",
    "driver_missing",
]


class DataSourceConfig(BaseModel):
    """数据源连接配置（前端 -> 后端，create / test / edit 入参）。

    password 始终为字符串：create/test 必填非空（由 service 层校验），
    edit 时留空（""）表示不改密码、复用旧凭证（F-DS-06）。
    """

    model_config = ConfigDict(extra="forbid")

    name: constr(min_length=1, max_length=64)
    dialect: ProfileDialect
    host: constr(min_length=1, max_length=255)
    port: conint(ge=1, le=65535)
    database: Optional[constr(max_length=128)] = None
    username: constr(min_length=1, max_length=64)
    password: constr(max_length=128)


class DataSource(BaseModel):
    """已注册数据源视图（后端 -> 前端）。

    故意不含 password（F-DS-08 凭证安全）：列表/详情永不下发密码。
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    dialect: ProfileDialect
    host: str
    port: int
    database: Optional[str] = None
    username: str
    status: DataSourceStatus
    lastError: Optional[str] = None
    connectedAt: int  # epoch 秒


class TestResult(BaseModel):
    """测试连接结果（API-DS-02）。ok=True 带 version；ok=False 带 errorType+message。"""

    model_config = ConfigDict(extra="forbid")
    __test__ = False  # 避免 pytest 把名为 Test* 的模型误当测试类收集

    ok: bool
    dialect: ProfileDialect
    version: Optional[str] = None
    errorType: Optional[TestErrorType] = None
    message: Optional[str] = None


class ColumnInfo(BaseModel):
    """单列结构（F-DS-07 反射）。"""

    model_config = ConfigDict(extra="forbid")

    name: str
    type: str
    nullable: bool


class TableInfo(BaseModel):
    """单表结构（F-DS-07 反射）。schema 为所属库（MySQL/PG），Hive 可空。"""

    model_config = ConfigDict(extra="forbid")

    name: str
    schema: Optional[str] = None


# schemas 接口直接返回 list[str]（库名），无需独立模型


# ─── 查询工作台（QB，PRD §5.4） ─────────────────────────
class SqlAnalysis(BaseModel):
    """静态分析结果（API-QB-02 / F-QB-03）。

    allowed=False 时 violations 给出具体违规项，前端红字展示。
    """

    model_config = ConfigDict(extra="forbid")

    allowed: bool
    violations: list[str]
    statementCount: int


class QueryRequest(BaseModel):
    """查询执行请求（API-QB-01）。

    dialect 不入参（PRD §5.4），由 datasource 派生，避免前后端不一致。
    page/pageSize 上限与 config.PROFILE_MAX_ROWS 对齐（200）。
    """

    model_config = ConfigDict(extra="forbid")

    datasourceId: constr(min_length=1)
    sql: constr(min_length=1, max_length=20000)
    page: conint(ge=1, le=100000)
    pageSize: conint(ge=1, le=200)


class QueryResult(BaseModel):
    """查询执行结果（API-QB-01 成功时）。

    rows 已在 service 层归一化为 JSON 安全类型（str/int/float/bool/None），
    单元格超 5000 字符已截断（F-QB-04）。Hive totalRows=None（计数昂贵）。
    truncated=True 表示当前页已满，可能还有更多行（可翻页/下载）。
    """

    model_config = ConfigDict(extra="forbid")

    columns: list[str]
    rows: list[list[Any]]
    page: int
    pageSize: int
    totalRows: Optional[int] = None
    truncated: bool
    elapsedMs: int


class AnalyzeRequest(BaseModel):
    """独立静态分析入参（API-QB-02）。"""

    model_config = ConfigDict(extra="forbid")

    sql: constr(min_length=1, max_length=20000)
    dialect: ProfileDialect


class FormatRequest(BaseModel):
    """SQL 格式化入参（F-QB-11）。"""

    model_config = ConfigDict(extra="forbid")

    sql: constr(min_length=1, max_length=20000)
    dialect: ProfileDialect


class FormatResult(BaseModel):
    """SQL 格式化结果（F-QB-11）。"""

    model_config = ConfigDict(extra="forbid")

    sql: str


# ─── 探查规则库（RL，PRD §5.3 / §5.4） ─────────────────
MetricCategory = Literal[
    "completeness",
    "uniqueness",
    "validity",
    "consistency",
    "distribution",
]


class BuiltInMetric(BaseModel):
    """内置探查指标（F-RL-01/02，只读目录）。

    模板渲染归 PG 模块；此处仅元数据。needsParam=True 表示需额外参数
    （如 regex_match 需正则），由 PG 配置面板收集。
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    category: MetricCategory
    description: str
    needsColumn: bool
    needsParam: bool = False


class CustomRuleInput(BaseModel):
    """自定义规则 create/update 入参（F-RL-03）。

    needsColumn 不入参：由 exampleSql 是否含 {column} 占位符自动推断
    （F-RL-04 收口在后端，避免前后端不一致）。
    """

    model_config = ConfigDict(extra="forbid")

    name: constr(min_length=1, max_length=64)
    description: constr(max_length=500)
    exampleSql: constr(min_length=1, max_length=4000)
    dialect: ProfileDialect


class CustomRule(BaseModel):
    """已持久化的自定义规则（后端 -> 前端，跨会话共享，F-RL-06）。"""

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    description: str
    exampleSql: str
    dialect: ProfileDialect
    needsColumn: bool
    createdAt: int  # epoch 秒
    updatedAt: int


class RuleExportPayload(BaseModel):
    """规则集导出（F-RL-08）：便于团队共享的 JSON 文件结构。"""

    model_config = ConfigDict(extra="forbid")

    version: int = 1
    rules: list[CustomRule]
    exportedAt: int  # epoch 秒


class RuleImportPayload(BaseModel):
    """规则集导入入参（F-RL-08）。"""

    model_config = ConfigDict(extra="forbid")

    rules: list[CustomRule]


class RuleImportResult(BaseModel):
    """规则集导入结果（F-RL-08）：upsert by id 的计数。"""

    model_config = ConfigDict(extra="forbid")

    created: int
    updated: int
    skipped: int


# ─── 探查脚本生成（PG，PRD §5.4 / §6.1） ────────────────
SourceType = Literal["tables", "database"]
OutputMode = Literal["split", "merge"]


class ScriptSegment(BaseModel):
    """单段探查脚本（PRD §5.2）。

    归一化四列形状：SELECT '<table>' AS table_name, '<column>' AS column_name,
    '<metric>' AS metric, CAST(<expr> AS <方言字符串>) AS value FROM <table>。
    error 仅 partialFailures 段携带（校验失败原因）；成功段留空。
    """

    model_config = ConfigDict(extra="forbid")

    title: str
    sql: str
    metricId: Optional[str] = None
    tableName: str
    source: Literal["builtin", "custom"]
    error: Optional[str] = None


class GenerateProfileRequest(BaseModel):
    """生成探查脚本请求（API-PG-01）。

    dialect 由所选数据源派生（生成需连接做反射/EXPLAIN），前端不单独选；
    模型仍带该字段（=派生值）。metricParams 当前仅 regex_match 用正则
    （needsParam 指标必需，缺失则该段 partialFailure）。
    """

    model_config = ConfigDict(extra="forbid")

    datasourceId: constr(min_length=1)
    dialect: ProfileDialect
    sourceType: SourceType
    tables: Optional[list[constr(min_length=1, max_length=128)]] = None
    database: Optional[constr(max_length=128)] = None
    metricIds: conlist(constr(min_length=1, max_length=64), max_length=20)
    customRuleIds: conlist(constr(min_length=1, max_length=64), max_length=20) = []
    columns: Optional[dict[str, list[str]]] = None
    metricParams: Optional[dict[str, str]] = None
    outputMode: OutputMode


class ExplainRequest(BaseModel):
    """EXPLAIN 试运行入参（API-PG-02）。dialect 由 datasource 派生。"""

    model_config = ConfigDict(extra="forbid")

    datasourceId: constr(min_length=1)
    sql: constr(min_length=1, max_length=20000)


class ExplainResult(BaseModel):
    """EXPLAIN 结果（API-PG-02）：ok=False 带 error。"""

    model_config = ConfigDict(extra="forbid")

    ok: bool
    error: Optional[str] = None


class ValidationResult(BaseModel):
    """生成校验聚合结果（PRD §5.2）。

    staticAnalysis 为代表性分析：merge 取合并 SQL，split 取首段；
    各段静态分析在生成内部逐段做过（失败段进 partialFailures）。
    """

    model_config = ConfigDict(extra="forbid")

    passed: bool
    staticAnalysis: SqlAnalysis
    explain: Optional[ExplainResult] = None
    retries: int


class GenerateProfileResponse(BaseModel):
    """生成结果（API-PG-01）：refused=True 表示全部失败/LLM 拒答，segments 为空。"""

    model_config = ConfigDict(extra="forbid")

    refused: bool
    dialect: ProfileDialect
    segments: list[ScriptSegment] = []
    validation: Optional[ValidationResult] = None
    partialFailures: list[ScriptSegment] = []
    message: Optional[str] = None


class LLMNormalizedSegment(BaseModel):
    """LLM 仿写输出强约束（F-PG-06）：仅 sql 字段，须为归一化形状只读 SELECT。"""

    model_config = ConfigDict(extra="forbid")

    sql: constr(min_length=1, max_length=10000)
