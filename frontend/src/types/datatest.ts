// 测试数据集工具类型定义（PRD §5.2，与 backend/app/services/datatest_models.py 对齐）

export type DataTestMode = 'natural_language' | 'schema'
export type ExportFormat = 'xlsx' | 'json' | 'csv'

/** 9 种字段类型（F-DT-03） */
export type FieldType =
  | 'string'
  | 'int'
  | 'float'
  | 'date'
  | 'datetime'
  | 'bool'
  | 'email'
  | 'phone'
  | 'enum'

/** 字段类型下拉的展示文案（中文） */
export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  string: '文本',
  int: '整数',
  float: '小数',
  date: '日期',
  datetime: '日期时间',
  bool: '布尔',
  email: '邮箱',
  phone: '手机号',
  enum: '枚举',
}

export const FIELD_TYPES: FieldType[] = [
  'string',
  'int',
  'float',
  'date',
  'datetime',
  'bool',
  'email',
  'phone',
  'enum',
]

export interface FieldDef {
  name: string
  type: FieldType
  description?: string
  enumValues?: string[]
}

export interface GenerateRequest {
  mode: DataTestMode
  prompt?: string
  fields?: FieldDef[]
  rowCount: number
  format: ExportFormat
}

export interface GenerateResponseSuccess {
  refused: false
  columns: string[]
  rows: (string | number | boolean | null)[][]
}

export interface GenerateResponseRefused {
  refused: true
  message: string
}

export type GenerateResponse = GenerateResponseSuccess | GenerateResponseRefused

// 输入侧上限（与后端 DATATEST_MAX_* 对齐，前端首层校验）
export const DT_LIMITS = {
  ROW_COUNT_MIN: 1,
  ROW_COUNT_MAX: 1000,
  ROW_COUNT_DEFAULT: 50,
  PROMPT_MAX: 2000,
  FIELDS_MAX: 50,
  FIELD_NAME_MAX: 64,
  FIELD_DESC_MAX: 200,
  ENUM_VALUE_MAX: 64,
  ENUM_COUNT_MAX: 50,
  UPLOAD_SIZE_MAX: 2 * 1024 * 1024, // 2MB
  PREVIEW_ROWS: 50,
} as const
