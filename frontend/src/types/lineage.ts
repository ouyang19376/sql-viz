// SQL 血缘分析类型定义（PRD-ana F-LN-01 ~ F-LN-14）

export type SqlDialect = 'auto' | 'hive' | 'sparksql' | 'mysql' | 'postgresql' | 'generic'
export type LineageInputSource = 'paste' | 'upload' | 'batch'
export type TableType = 'entity' | 'temporary' | 'unknown'
export type DependencyKind = 'read' | 'write' | 'cte' | 'join' | 'union' | 'subquery' | 'unknown'
export type ResultViewMode = 'graph' | 'table'

export interface LineageUploadedFileInfo {
  fileName: string
  fileSize: number
}

export interface LineageTableNode {
  id: string
  name: string
  type: TableType
  database?: string | null
  schema?: string | null
  alias?: string | null
  statementIndexes: number[]
}

export interface LineageDependency {
  id: string
  source: string
  target: string
  kind: DependencyKind
  statementIndex?: number | null
  lineStart?: number | null
  lineEnd?: number | null
  description?: string | null
  confidence?: number | null
}

export interface LineageAnalysisResult {
  summary: string
  dialect: SqlDialect
  tables: LineageTableNode[]
  dependencies: LineageDependency[]
  warnings: string[]
}

export interface LineageAnalyzeRequest {
  sql: string
  dialect?: SqlDialect
}

export type LineageAnalyzeResponse =
  | { refused: false; result: LineageAnalysisResult }
  | { refused: true; message: string }

export interface LineageNeo4jPushRequest {
  result: LineageAnalysisResult
}

export interface LineageNeo4jPushResult {
  tables: number
  dependencies: number
  database?: string | null
}

export interface DependencyRow {
  index: number
  targetTable: string
  targetType: TableType
  sourceTable: string
  sourceType: TableType
  dependencyKind: DependencyKind
  statementIndex?: number | null
  lineRange: string
  description?: string | null
  confidence?: number | null
}

// 输入侧上限（与 PRD-ana §6.5 对齐，前端首层校验）
export const LINEAGE_LIMITS = {
  SQL_MAX_CHARS: 50_000,
  UPLOAD_SIZE_MAX: 2 * 1024 * 1024, // 2MB
  BATCH_UPLOAD_SIZE_MAX: 5 * 1024 * 1024, // 5MB
  ALLOWED_EXTENSIONS: ['.sql', '.hql', '.txt'] as const,
} as const

export const LINEAGE_DIALECT_OPTIONS: Array<{ value: SqlDialect; label: string }> = [
  { value: 'auto', label: '自动识别' },
  { value: 'hive', label: 'Hive' },
  { value: 'sparksql', label: 'SparkSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'generic', label: '通用 SQL' },
]
