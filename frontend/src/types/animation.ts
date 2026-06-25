/**
 * 动画数据类型（PRD §5.2 + animation-engine-design.md §3/4）
 *
 * 后端 JSON 中 payload 字段直接挂在 step 上（非嵌套 payload），
 * 故 AnimationStep 用 operation 作为判别符的联合类型，TS 可自动收窄。
 */

/** 操作类型（前后端契约，完整声明；未实现的渲染器走 fallback） */
export type Operation =
  | 'show_source'
  | 'show_result'
  | 'highlight_rows'
  | 'filter_rows'
  | 'sort_rows'
  | 'group_rows'
  | 'limit_rows'
  | 'select_columns'
  | 'add_column'
  | 'rename_column'
  | 'transform_values'
  | 'aggregate_values'
  | 'join_tables'
  | 'union_tables'
  | 'show_graph'
  | 'highlight_path'

/** 通用表格结构（单元格可为 null，如 COUNT(city) 中 city 为 NULL 的行） */
export interface TableData {
  columns: string[]
  rows: (string | null)[][]
  caption?: string
}

// ─── 各 Operation 的 Payload（字段直接挂在 step 上）───

export interface ShowSourcePayload {
  table: TableData
}

export interface ShowResultPayload {
  table: TableData
  highlight_columns?: number[]
  highlight_rows?: number[]
}

export interface FilterRowsPayload {
  source_table: TableData
  kept_indices: number[]
  removed_indices: number[]
  condition_description?: string
}

export interface SortRowsPayload {
  source_table: TableData
  order_mapping: number[] // 新位置 → 旧索引
  sort_column: string
  sort_direction: 'asc' | 'desc'
}

export interface GroupRow {
  key: string
  rows: (string | null)[][]
  aggregated: (string | null)[]
}

export interface GroupRowsPayload {
  /** 真实数据中通常不提供 source_table，需从 groups[].rows 重建 */
  source_table?: TableData
  group_column: string
  group_key?: string
  groups: GroupRow[]
}

export interface SelectColumnsPayload {
  source_table: TableData
  selected_indices: number[]
  result_columns: string[]
  result_rows: (string | null)[][]
}

export interface TransformValuesPayload {
  source_table: TableData
  target_column: number
  transform_description: string
  transform_fn: string
  before_values: (string | null)[]
  after_values: (string | null)[]
}

export interface AggregateValuesPayload {
  source_table: TableData
  aggregate_info: {
    function: string
    target: string
    result_label: string
    result_value: string
  }
  result_table: TableData
}

export interface AddColumnPayload {
  /** 注：PRD §5.2 写作 source_table，实际后端 JSON 与渲染器统一用 table，以实现为准 */
  table: TableData
  new_column: { name: string; values: (string | null)[] }
  insert_index: number
}

export interface JoinMatchPair {
  left_idx: number
  right_idx: number
}

export interface JoinTablesPayload {
  left_table: TableData
  right_table: TableData
  join_column: string
  join_type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL'
  match_pairs: JoinMatchPair[]
  result_table: TableData
}

/** 动画步骤基础字段 */
interface AnimationStepBase {
  title: string
  sql_hint?: string
  highlight_lines?: number[] // 1-based
  duration_scale?: number
}

/** 判别联合：按 operation 收窄到对应 payload */
export type AnimationStep = AnimationStepBase &
  (
    | ({ operation: 'show_source' } & ShowSourcePayload)
    | ({ operation: 'show_result' } & ShowResultPayload)
    | ({ operation: 'highlight_rows' } & { table: TableData; highlight_rows: number[] })
    | ({ operation: 'filter_rows' } & FilterRowsPayload)
    | ({ operation: 'sort_rows' } & SortRowsPayload)
    | ({ operation: 'group_rows' } & GroupRowsPayload)
    | ({ operation: 'select_columns' } & SelectColumnsPayload)
    | ({ operation: 'transform_values' } & TransformValuesPayload)
    | ({ operation: 'aggregate_values' } & AggregateValuesPayload)
    | ({ operation: 'add_column' } & AddColumnPayload)
    | ({ operation: 'join_tables' } & JoinTablesPayload)
    // 其余 operation（无专用 payload 或暂未实现渲染器）宽松承载
    | ({ operation: 'limit_rows' | 'rename_column' | 'union_tables' | 'show_graph' | 'highlight_path' } & {
        table?: TableData
        [k: string]: unknown
      })
  )

/** 动画数据（挂在 FunctionDef.animation 上） */
export interface Animation {
  type: string
  steps: AnimationStep[]
}
