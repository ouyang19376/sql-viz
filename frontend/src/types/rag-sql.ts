// RAG for NL2SQL 类型定义（PRD-rag-sql §5.3，与 backend rag_sql_models.py 对齐，camelCase）
// CK 子模块类型；KB / AS 子模块类型待相应模块追加到本文件。

export type RagSqlTab = 'chunk' | 'kb' | 'ask'

/** 表概要（F-CK-03 LLM 语义增强；结构由 sqlglot 解析给定） */
export interface TableSummary {
  tableName: string
  chineseName?: string
  topic?: string
  description?: string
  keyFields?: string[]
  partitionField?: string
  granularity?: string
}

/** 表结构详情单字段；extra 为 LLM 补充的业务含义 */
export interface TableFieldDetail {
  name: string
  type: string
  comment?: string
  nullable: boolean
  extra?: string
}

/** 文本块：表概要 + 表结构详情 + 拼接的可入 RAG 原文 */
export interface TableChunk {
  tableName: string
  summary: TableSummary
  fields: TableFieldDetail[]
  rawText: string
}

/** DDL -> 结构化文本块入参（API-CK-01 / F-CK-10 长度护栏 ≤ 20000） */
export interface ChunkRequest {
  ddl: string
}

/** 生成文本块响应（API-CK-01，支持多表；refused=整段未识别到 CREATE TABLE） */
export interface ChunkResponse {
  chunks: TableChunk[]
  refused: boolean
  message?: string
}

/** 表文本块入 RAG 入参（API-CK-02 / F-CK-07）；overwrite 控制覆盖确认流（F-CK-08） */
export interface IngestTableChunkRequest {
  tableName: string
  rawText: string
  summary: TableSummary
  fields: TableFieldDetail[]
  overwrite: boolean
}

/** 表文本块入库结果（API-CK-02）；ingested=false && alreadyExists=true 待前端确认覆盖 */
export interface IngestResult {
  ingested: boolean
  tableName: string
  alreadyExists: boolean
  overwritten: boolean
  ingestedAt?: number
}

/** 表元数据列表项（API-CK-03 / KB 栏目「SQL数据表元数据」展示）。
 *  与 KbDocRef 并列：table_meta 由「文本块生成」入库，非文档上传流。
 *  rawText 为解析后文本块原文，供点击预览。 */
export interface TableMetaRef {
  tableName: string
  topic?: string | null
  rawText: string
  createdAt: number
}

// ============================================================
// 知识管理（KB 子模块，PRD-rag-sql §5.3，F-KB-01~08）
// ============================================================
export type KbCategory =
  | 'sql_standard'
  | 'modeling_standard'
  | 'quality_sla'
  | 'best_code'
  | 'model_design'

/** 类别 -> 中文标签（F-KB-02 类别必选，5 类） */
export const KB_CATEGORY_LABELS: Record<KbCategory, string> = {
  sql_standard: 'SQL 编码规范',
  modeling_standard: '建模规范',
  quality_sla: '质量 SLA',
  best_code: '优秀代码',
  model_design: '模型设计',
}

/** 文档入 RAG 入参（API-KB-01 / F-KB-01/02/03/08）；overwrite 控制覆盖确认流（F-KB-07） */
export interface KbDocInput {
  title: string
  category: KbCategory
  content: string
  sourceName?: string
  overwrite: boolean
}

/** 知识列表项（API-KB-02 / F-KB-04）；扁平数组，前端按 category 分组 */
export interface KbDocRef {
  id: string
  title: string
  category: KbCategory
  chunkCount: number
  sourceName?: string
  createdAt: number
}

/** 文档分片（预览用，F-KB-05） */
export interface KbChunk {
  index: number
  text: string
}

/** 文档详情（含全部分片原文，API-KB-03 / F-KB-05） */
export interface KbDocDetail extends KbDocRef {
  chunks: KbChunk[]
}

/** 文档入库结果（API-KB-01）；形状镜像 IngestResult 便于复用确认流 */
export interface KbIngestResult {
  ingested: boolean
  title: string
  id?: string
  chunkCount: number
  alreadyExists: boolean
  overwritten: boolean
  ingestedAt?: number
}

// ============================================================
// NL2SQL 问答（AS 子模块，PRD-rag-sql §5.3，F-AS-01~15）
// ============================================================
export type RagDialect = 'mysql' | 'hive' | 'postgresql'

/** 方言 -> 中文标签（F-AS-01 方言选择） */
export const RAG_DIALECT_LABELS: Record<RagDialect, string> = {
  mysql: 'MySQL',
  hive: 'Hive',
  postgresql: 'PostgreSQL',
}

/** 多轮会话单轮（F-AS-02/13） */
export interface AskTurn {
  role: 'user' | 'assistant'
  content: string
}

/** NL2SQL 生成入参（API-AS-01 / F-AS-03/06）；conversationId/history 仅多轮开时携带 */
export interface AskRequest {
  question: string
  dialect: RagDialect
  topK?: number
  conversationId?: string
  history?: AskTurn[]
}

/** 命中来源（F-AS-09 来源追溯） */
export interface AskSource {
  type: 'table' | 'doc'
  title: string
  collection: 'table_meta' | 'kb_docs'
  score: number
  chunkText: string
}

/** sqlglot 静态校验结果（F-AS-07） */
export interface AskValidation {
  allowed: boolean
  violations: string[]
}

/** NL2SQL 生成响应（API-AS-01） */
export interface AskResponse {
  sql?: string
  dialect: RagDialect
  validation?: AskValidation
  sources: AskSource[]
  degraded: boolean
  degradeReason?: string
  refused?: boolean
  message?: string
}

// ============================================================
// 知识库规模（CM 子模块，PRD-rag-sql §4.1，F-BK-CM-01 stats）
// ============================================================
/** 知识库规模（API-CM-01 / F-BK-CM-01）：表数 / 文档数 / 分片数 */
export interface RagSqlStats {
  tableCount: number
  docCount: number
  chunkCount: number
}
