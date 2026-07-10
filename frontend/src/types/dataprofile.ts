// 数据探查类型定义（PRD-dataprofile §5.2，与 backend dataprofile_models.py 对齐，camelCase）

export type ProfileDialect = 'mysql' | 'hive' | 'postgresql'
export type DataSourceStatus = 'connected' | 'disconnected' | 'expired' | 'error'
export type TestErrorType =
  | 'host_unreachable'
  | 'auth_failed'
  | 'db_not_found'
  | 'driver_error'
  | 'driver_missing'

/** 数据源连接配置（前端 -> 后端，create/test/edit 入参）。
 *  password write-only：仅 create/test 上行，永不下发回显；
 *  编辑时留空（''）表示不改密码（F-DS-06）。 */
export interface DataSourceConfig {
  name: string
  dialect: ProfileDialect
  host: string
  port: number
  database?: string
  username: string
  password: string
}

/** 已注册数据源视图（后端 -> 前端，不含 password - F-DS-08） */
export interface DataSource {
  id: string
  name: string
  dialect: ProfileDialect
  host: string
  port: number
  database?: string
  username: string
  status: DataSourceStatus
  lastError?: string
  connectedAt: number
}

/** 测试连接结果（API-DS-02） */
export interface TestResult {
  ok: boolean
  dialect: ProfileDialect
  version?: string
  errorType?: TestErrorType
  message?: string
}

/** 单列结构（F-DS-07 反射） */
export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
}

/** 单表结构（F-DS-07 反射） */
export interface TableInfo {
  name: string
  schema?: string
}

/** 脚本段（PRD §5.2，生成->工作台导入中转；PG 模块后续接入，store 先预留） */
export interface ScriptSegment {
  title: string
  sql: string
  metricId?: string
  tableName: string
  source: 'builtin' | 'custom'
  /** partialFailures 段携带失败原因；成功段留空 */
  error?: string
}

// ─── 查询工作台（QB，PRD §5.2） ────────────────────────
/** 静态分析结果（API-QB-02 / F-QB-03） */
export interface SqlAnalysis {
  allowed: boolean
  violations: string[]
  statementCount: number
}

/** 查询执行请求（API-QB-01）。dialect 由 datasource 派生，不入参。 */
export interface QueryRequest {
  datasourceId: string
  sql: string
  page: number
  pageSize: number
}

/** 查询执行结果（API-QB-01 成功时）。Hive totalRows=null（计数昂贵）。 */
export interface QueryResult {
  columns: string[]
  rows: (string | number | boolean | null)[][]
  page: number
  pageSize: number
  totalRows: number | null
  truncated: boolean
  elapsedMs: number
}

/** 查询被静态拦截时的响应 data（PRD §6.2 拦截响应：仅含 analysis） */
export interface BlockedQueryResult {
  analysis: SqlAnalysis
}

/** /query 响应：成功为 QueryResult，拦截为 { analysis }（判别联合） */
export type QueryResponse = QueryResult | BlockedQueryResult

/** 类型守卫：拦截分支（无 columns，有 analysis） */
export function isBlockedResult(d: QueryResponse): d is BlockedQueryResult {
  return d != null && typeof d === 'object' && 'analysis' in d && !('columns' in d)
}

export interface AnalyzeRequest {
  sql: string
  dialect: ProfileDialect
}
export interface FormatRequest {
  sql: string
  dialect: ProfileDialect
}
export interface FormatResult {
  sql: string
}

/** 执行历史条目（F-QB-10，会话内最近 20 条，可回填代码区） */
export interface QueryHistoryEntry {
  id: string
  sql: string
  datasourceId: string
  dialect: ProfileDialect
  createdAt: number
  status: 'ok' | 'blocked' | 'error'
  rows?: number
  violations?: string[]
}

// ─── 探查规则库（RL，PRD §5.2/§5.3） ───────────────────
export type MetricCategory =
  | 'completeness'
  | 'uniqueness'
  | 'validity'
  | 'consistency'
  | 'distribution'

/** 内置探查指标（F-RL-01/02，只读目录） */
export interface BuiltInMetric {
  id: string
  name: string
  category: MetricCategory
  description: string
  needsColumn: boolean
  needsParam?: boolean
}

/** 自定义规则 create/update 入参（F-RL-03）。
 *  needsColumn 不入参：由 exampleSql 含 {column} 占位符后端自动推断。 */
export interface CustomRuleInput {
  name: string
  description: string
  exampleSql: string
  dialect: ProfileDialect
}

/** 已持久化的自定义规则（后端 -> 前端，跨会话共享，F-RL-06） */
export interface CustomRule extends CustomRuleInput {
  id: string
  needsColumn: boolean
  createdAt: number
  updatedAt: number
}

/** 规则集导出（F-RL-08） */
export interface RuleExportPayload {
  version: number
  rules: CustomRule[]
  exportedAt: number
}

/** 规则集导入入参（F-RL-08，前端 -> 后端 body） */
export interface RuleImportInput {
  rules: CustomRule[]
}

/** 规则集导入结果（F-RL-08，upsert by id 计数） */
export interface RuleImportResult {
  created: number
  updated: number
  skipped: number
}

// ─── 探查脚本生成（PG，PRD §5.2） ────────────────────────
export type SourceType = 'tables' | 'database'
export type OutputMode = 'split' | 'merge'

/** 生成探查脚本请求（API-PG-01）。
 *  dialect 由所选数据源派生；metricParams 当前仅 regex_match 用正则（needsParam）。 */
export interface GenerateProfileRequest {
  datasourceId: string
  dialect: ProfileDialect
  sourceType: SourceType
  tables?: string[]
  database?: string
  metricIds: string[]
  customRuleIds: string[]
  columns?: Record<string, string[]>
  metricParams?: Record<string, string>
  outputMode: OutputMode
}

/** EXPLAIN 试运行入参（API-PG-02）。dialect 由 datasource 派生。 */
export interface ExplainRequest {
  datasourceId: string
  sql: string
}

/** EXPLAIN 结果（API-PG-02） */
export interface ExplainResult {
  ok: boolean
  error?: string
}

/** 生成校验聚合结果（PRD §5.2）。staticAnalysis 为代表性分析。 */
export interface ValidationResult {
  passed: boolean
  staticAnalysis: SqlAnalysis
  explain?: ExplainResult
  retries: number
}

/** 生成结果（API-PG-01）：refused=True 表示全部失败/LLM 拒答 */
export interface GenerateProfileResponse {
  refused: boolean
  dialect: ProfileDialect
  segments: ScriptSegment[]
  validation?: ValidationResult
  partialFailures: ScriptSegment[]
  message?: string
}

/** 生成历史条目（F-PG-14，会话内最近 10 次，可回填） */
export interface GenerateHistoryEntry {
  id: string
  datasourceId: string
  dialect: ProfileDialect
  sourceType: SourceType
  tables?: string[]
  database?: string
  metricIds: string[]
  customRuleIds: string[]
  outputMode: OutputMode
  createdAt: number
  segmentCount: number
}

/** 内置指标分类展示名（F-RL-02 分组） */
export const METRIC_CATEGORY_LABELS: Record<MetricCategory, string> = {
  completeness: '完整性',
  uniqueness: '唯一性',
  validity: '有效性',
  consistency: '一致性',
  distribution: '分布',
}

/** 方言展示名/色（供 DialectBadge 复用：传 {name, color}） */
export const PROFILE_DIALECTS: Record<ProfileDialect, { name: string; color: string }> = {
  mysql: { name: 'MySQL', color: '#4479A1' },
  postgresql: { name: 'PostgreSQL', color: '#336791' },
  hive: { name: 'Hive', color: '#C8860C' },
}

/** 错误类型 -> 中文文案（PRD §6.2） */
export const TEST_ERROR_LABELS: Record<TestErrorType, string> = {
  host_unreachable: '无法连接到主机',
  auth_failed: '认证失败：用户名或密码错误',
  db_not_found: '数据库不存在',
  driver_error: '驱动异常',
  driver_missing: '驱动未安装',
}

/** 方言默认端口（表单便捷填充） */
export const DEFAULT_PORT: Record<ProfileDialect, number> = {
  mysql: 3306,
  postgresql: 5432,
  hive: 10000,
}

/** 前端首层限制（与后端 PROFILE_* 对齐） */
export const DP_LIMITS = {
  PAGE_SIZE_DEFAULT: 50,
  PAGE_SIZE_MAX: 200,
  MAX_TABLES: 200,
  NAME_MAX: 64,
} as const
