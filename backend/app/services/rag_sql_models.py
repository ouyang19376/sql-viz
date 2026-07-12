"""RAG for NL2SQL - Pydantic 模型（PRD-rag-sql §5.4，CK + KB 子模块）。

字段命名沿用既有代码库 camelCase 范式（与 dataprofile_models 对齐），
TS 接口（前端 types/rag-sql.ts）与本文件一一对应。
AS 子模块的模型待相应模块开发时追加到本文件。
"""
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, conint, conlist, constr


class TableSummary(BaseModel):
    """表概要（F-CK-03 LLM 语义增强产出；结构由 sqlglot 解析给定）。"""

    model_config = ConfigDict(extra="forbid")

    tableName: constr(min_length=1, max_length=128)
    chineseName: Optional[constr(max_length=128)] = None
    topic: Optional[constr(max_length=64)] = None
    description: Optional[constr(max_length=500)] = None
    keyFields: Optional[conlist(constr(min_length=1, max_length=128), max_length=32)] = None
    partitionField: Optional[constr(max_length=128)] = None
    granularity: Optional[constr(max_length=128)] = None


class TableFieldDetail(BaseModel):
    """表结构详情单字段。extra 为 LLM 补充的业务含义（如「可关联用户维度表」）。"""

    model_config = ConfigDict(extra="forbid")

    name: constr(min_length=1, max_length=128)
    type: constr(max_length=64)
    comment: Optional[constr(max_length=500)] = None
    nullable: bool = True
    extra: Optional[constr(max_length=256)] = None


class TableChunk(BaseModel):
    """文本块：表概要 + 表结构详情 + 拼接的可入 RAG 原文。"""

    model_config = ConfigDict(extra="forbid")

    tableName: str
    summary: TableSummary
    fields: list[TableFieldDetail]
    rawText: constr(min_length=1, max_length=20000)


class ChunkRequest(BaseModel):
    """DDL -> 结构化文本块入参（API-CK-01 / F-CK-10 长度护栏 ≤ 20000）。"""

    model_config = ConfigDict(extra="forbid")

    ddl: constr(min_length=1, max_length=20000)


class ChunkResponse(BaseModel):
    """生成文本块响应（API-CK-01）。

    支持多表（F-CK-01）：chunks 为解析得到的全部表文本块。
    refused=True 表示整段 DDL 未识别到 CREATE TABLE（F-CK-09），
    此时 chunks 为空、message 给出红字提示；单表 LLM 增强失败不置 refused，
    该表以最小 summary（仅 tableName + partitionField）降级返回，缺字段可手补。
    """

    model_config = ConfigDict(extra="forbid")

    chunks: list[TableChunk] = []
    refused: bool = False
    message: Optional[str] = None


class IngestTableChunkRequest(BaseModel):
    """表文本块入 RAG 入参（API-CK-02 / F-CK-07）。

    overwrite（F-CK-08 覆盖确认）：False 时若同名表已入库则只探测不写，
    返回 alreadyExists=True 交前端二次确认；True 时删旧插新（覆盖幂等，§6.6）。
    """

    model_config = ConfigDict(extra="forbid")

    tableName: constr(min_length=1, max_length=128)
    rawText: constr(min_length=1, max_length=20000)
    summary: TableSummary
    fields: list[TableFieldDetail]
    overwrite: bool = False


class IngestResult(BaseModel):
    """表文本块入库结果（API-CK-02）。

    ingested=False && alreadyExists=True 表示仅探测到同名表，待前端确认覆盖；
    ingested=True 时 overwritten 表示本次是否覆盖了既有同名表。
    """

    model_config = ConfigDict(extra="forbid")

    ingested: bool
    tableName: str
    alreadyExists: bool = False
    overwritten: bool = False
    ingestedAt: Optional[int] = None  # epoch 秒；ingested=False 时为 None


class TableMetaRef(BaseModel):
    """表元数据列表项（KB 栏目「SQL数据表元数据」展示，来源 table_meta collection）。

    与 KbDocRef 并列：table_meta 由「文本块生成」入库，非文档上传流，故独立类型。
    rawText 为 build_raw_text 拼接的解析后文本块，供前端点击预览。
    """

    model_config = ConfigDict(extra="forbid")

    tableName: constr(min_length=1, max_length=128)
    topic: Optional[constr(max_length=64)] = None
    rawText: constr(min_length=1, max_length=20000)
    createdAt: int


# ============================================================
# 知识管理（KB 子模块，PRD-rag-sql §5.4，F-KB-01~08）
# ============================================================
KbCategory = Literal[
    "sql_standard",
    "modeling_standard",
    "quality_sla",
    "best_code",
    "model_design",
]


class KbDocInput(BaseModel):
    """规范文档入 RAG 入参（API-KB-01 / F-KB-01/02/03/08）。

    content 上限 200000 字符（与 RAG_DOC_MAX_BYTES=1MB 双重护栏，F-KB-08）；
    overwrite（F-KB-07 覆盖确认）：False 时若同标题已入库仅探测不写，
    返回 alreadyExists=True 交前端二次确认；True 时删旧插新。
    """

    model_config = ConfigDict(extra="forbid")

    title: constr(min_length=1, max_length=128)
    category: KbCategory
    content: constr(min_length=1, max_length=200000)
    sourceName: Optional[constr(max_length=128)] = None
    overwrite: bool = False


class KbDocRef(BaseModel):
    """知识列表项（API-KB-02 / F-KB-04）。后端返回扁平数组，前端按 category 分组。"""

    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    category: KbCategory
    chunkCount: int
    sourceName: Optional[str] = None
    createdAt: int


class KbChunk(BaseModel):
    """文档分片（预览用，API-KB-03 / F-KB-05）。"""

    model_config = ConfigDict(extra="forbid")

    index: int
    text: str


class KbDocDetail(KbDocRef):
    """文档详情（含全部分片原文，API-KB-03 / F-KB-05）。"""

    chunks: list[KbChunk] = []


class KbIngestResult(BaseModel):
    """文档入库结果（API-KB-01）。形状镜像 IngestResult（CK）便于前端复用确认流。

    ingested=False && alreadyExists=True 表示仅探测到同标题，待前端确认覆盖；
    ingested=True 时 overwritten 表示本次是否覆盖了既有同标题文档。
    """

    model_config = ConfigDict(extra="forbid")

    ingested: bool
    title: str
    id: Optional[str] = None  # ingested=False 时为 None
    chunkCount: conint(ge=0) = 0
    alreadyExists: bool = False
    overwritten: bool = False
    ingestedAt: Optional[int] = None  # epoch 秒；ingested=False 时为 None


# ============================================================
# NL2SQL 问答（AS 子模块，PRD-rag-sql §5.4，F-AS-01~15）
# ============================================================
RagDialect = Literal["mysql", "hive", "postgresql"]


class AskTurn(BaseModel):
    """多轮会话单轮（F-AS-02/13）。history 仅传 question 原文 + assistant 的 sql。"""

    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: constr(min_length=1, max_length=4000)


class AskRequest(BaseModel):
    """NL2SQL 生成入参（API-AS-01 / F-AS-03/06，F-AS-10 长度护栏 ≤ 2000）。

    conversationId/history 仅多轮开关开时携带（F-AS-13）；后端按 RAG_HISTORY_MAX_TURNS 截断。
    """

    model_config = ConfigDict(extra="forbid")

    question: constr(min_length=1, max_length=2000)
    dialect: RagDialect
    topK: Optional[conint(ge=1, le=20)] = None
    conversationId: Optional[str] = None
    history: Optional[list[AskTurn]] = None


class AskSource(BaseModel):
    """命中来源（F-AS-09 来源追溯）。type=table 取 table_meta.raw_text；type=doc 取 kb_docs.chunk_text。"""

    model_config = ConfigDict(extra="forbid")

    type: Literal["table", "doc"]
    title: str
    collection: Literal["table_meta", "kb_docs"]
    score: float
    chunkText: str


class AskValidation(BaseModel):
    """sqlglot 静态校验结果（F-AS-07，复用 dataprofile_analyzer.analyze 映射）。"""

    model_config = ConfigDict(extra="forbid")

    allowed: bool
    violations: list[str] = []


class AskResponse(BaseModel):
    """NL2SQL 生成响应（API-AS-01）。

    refused=True 表示 LLM 未产出有效 SQL（解析失败/Schema 不符，§8.3 兜底），sql 为 None；
    degraded=True 表示空库/无命中降级（F-AS-10/11），仍出 sql（纯 LLM）；validation.allowed=False
    表示 sqlglot 拦截危险/非法 SQL（F-AS-07），前端标红但仍展示供用户重试。
    """

    model_config = ConfigDict(extra="forbid")

    sql: Optional[str] = None
    dialect: RagDialect
    validation: Optional[AskValidation] = None
    sources: list[AskSource] = []
    degraded: bool = False
    degradeReason: Optional[str] = None
    refused: bool = False
    message: Optional[str] = None


# ============================================================
# 知识库规模（CM 子模块，PRD-rag-sql §4.1，F-BK-CM-01 stats）
# ============================================================
class RagSqlStats(BaseModel):
    """知识库规模（API-CM-01 / F-BK-CM-01）：表数 / 文档数 / 分片数。

    tableCount=table_meta 向量数（每表一条）；docCount=kb_docs distinct doc_id；
    chunkCount=kb_docs 全部分片数。PageHeader 展示用。
    """

    model_config = ConfigDict(extra="forbid")

    tableCount: int
    docCount: int
    chunkCount: int
