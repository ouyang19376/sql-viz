/** SQL 方言标识 */
export type DialectId =
  | 'mysql'
  | 'pgsql'
  | 'hive'
  | 'impala'
  | 'sparksql'
  | 'flinksql'
  | 'cypher'

/** 分类 */
export interface Category {
  id: string
  name: string
  order: number
}

/** 方言摘要（列表页使用） */
export interface DialectSummary {
  id: DialectId
  name: string
  version: string
  description: string
  homepage: string
  /** 主题色，如 "#00758F" */
  color: string
  /** 图标标识，如 "mysql" */
  icon: string
  function_count: number
}

/** 函数摘要（方言详情页列表用，不含 animation/params） */
export interface FunctionSummary {
  id: string
  name: string
  category_id: string
  signature: string
  description: string
  return_type: string
}

/** 方言详情（方言页使用，含分类+函数列表，不含 animation） */
export interface DialectDetail extends Omit<DialectSummary, 'function_count'> {
  categories: Category[]
  functions: FunctionSummary[]
}
