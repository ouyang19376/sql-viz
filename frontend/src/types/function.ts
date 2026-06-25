import type { Animation } from './animation'

/** 参数类型（PRD §5.2 ParamType + 数据中实际出现的扩展值如 expr/type_name） */
export type ParamType =
  | 'any'
  | 'string'
  | 'numeric'
  | 'int'
  | 'table_name'
  | 'column_name'
  | 'expr'
  | 'type_name'

/** 函数参数 */
export interface Param {
  name: string
  type: ParamType | string
  required: boolean
  desc: string
  default_value?: string
}

/** 动画数据（详情页消费，AN/SC 模块进一步使用；此处仅承载结构） */
export type { Animation }

/** 函数完整定义（详情页使用，含 animation/params） */
export interface FunctionDef {
  id: string
  name: string
  category_id: string
  signature: string
  description: string
  params: Param[]
  return_type: string
  example_code: string
  example_description?: string
  compatible_dialects?: string[]
  note?: string
  animation?: Animation
}
