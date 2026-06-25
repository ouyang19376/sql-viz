import type { DialectDetail, DialectId, DialectSummary } from './dialect'
import type { FunctionDef } from './function'

/** 统一响应包装 */
export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

/** API-01 方言列表响应 */
export interface DialectListResponse {
  dialects: DialectSummary[]
}

/** API-02 方言详情响应 */
export interface DialectDetailResponse {
  dialect: DialectDetail
}

/** API-03 函数详情响应（含 animation） */
export interface FunctionDetailResponse {
  function: FunctionDef
  dialect: Pick<DialectSummary, 'id' | 'name' | 'color'>
}

/** API-05 跨方言对照单项 */
export interface CompatibleMapping {
  dialect_id: string
  name: string
  signature: string
  note: string | null
}

/** API-05 跨方言对照响应 */
export interface CompatibleResponse {
  function_id: string
  name: string
  source_dialect: string
  mappings: CompatibleMapping[]
}

/** API-04 单条搜索结果 */
export interface SearchResultItem {
  function: {
    id: string
    name: string
    signature: string
    description: string
  }
  dialect: {
    id: DialectId
    name: string
    color: string
  }
  category_id: string
  match_field: 'name' | 'signature' | 'description'
}

/** API-04 搜索响应 */
export interface SearchResponse {
  results: SearchResultItem[]
  total: number
}

/** 业务错误（code !== 0）抛出的异常 */
export class ApiError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.code = code
    this.name = 'ApiError'
  }
}
