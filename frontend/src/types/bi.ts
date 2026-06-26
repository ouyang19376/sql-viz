// BI 报表模块类型（PRD-bi §5.2）。CM 已落地 Tab 标识；DS 模块落地 DatasetMeta；
// PV 模块落地 FilterClause / Preview 请求响应；MD 模块落地 AggFunc / ChartType /
// MetricDef / DashboardModel；VZ 模块落地 Aggregate 请求响应 + DrillLevel。

/** 右侧三 Tab 标识：明细预览 | 建模配置 | 大屏可视化。 */
export type BiTab = 'preview' | 'model' | 'dashboard'

/** 列推断类型。 */
export type InferredType = 'string' | 'number' | 'date' | 'boolean'

/** 列角色：维度 | 指标（默认按类型推断，用户可改）。 */
export type FieldRole = 'dimension' | 'measure'

/** 单列结构：拍平后的列名（如 "销售/Q1"）+ 类型 + 角色。 */
export interface ColumnSchema {
  name: string
  type: InferredType
  role: FieldRole
}

/** 数据集元信息（与后端 DatasetMeta 对齐）。 */
export interface DatasetMeta {
  id: string
  name: string
  sourceFilename: string
  rowCount: number
  columns: ColumnSchema[]
  createdAt: string
  sizeBytes: number
}

/** 筛选算子：维度用 eq/neq/in/contains，数值用 gt/gte/lt/lte。 */
export type FilterOp = 'eq' | 'neq' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains'

/** 单元格值（后端已转为 JSON 安全标量）。 */
export type CellValue = string | number | boolean | null

/** 单条筛选条件（与后端 FilterClause 对齐）。 */
export interface FilterClause {
  field: string
  op: FilterOp
  value: string | number | string[]
}

/** 明细预览请求（API-BI-04）。 */
export interface PreviewRequest {
  page: number
  pageSize: number
  filters: FilterClause[]
}

/** 明细预览响应（API-BI-04）。 */
export interface PreviewResponse {
  columns: string[]
  rows: CellValue[][]
  total: number
  page: number
  pageSize: number
}

// ─── MD 建模配置（F-MD-01/02/03/04） ────────────────────────────

/** 聚合函数（F-MD-02）。 */
export type AggFunc = 'sum' | 'avg' | 'count' | 'count_distinct' | 'max' | 'min'

/** 聚合函数中文标签（指标编辑 + 别名默认值共用）。 */
export const AGG_LABELS: Record<AggFunc, string> = {
  sum: '求和',
  avg: '平均',
  count: '计数',
  count_distinct: '去重计数',
  max: '最大',
  min: '最小',
}

/** 图表类型（F-MD-04）。 */
export type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'table'

/** 图表类型中文标签。 */
export const CHART_LABELS: Record<ChartType, string> = {
  bar: '柱状图',
  line: '折线图',
  pie: '饼图',
  scatter: '散点图',
  table: '表格',
}

/** 指标定义（F-MD-02）：字段 + 聚合 + 展示别名。 */
export interface MetricDef {
  id: string
  field: string
  agg: AggFunc
  alias: string
}

/** 当前数据集建模态（可导出 / 导入复现，PRD §5.2）。
 *  MD 模块配置 metrics / drillPath / chartType；dimensions / filters 由 VZ 下钻时派生。 */
export interface DashboardModel {
  datasetId: string
  dimensions: string[]
  metrics: MetricDef[]
  drillPath: string[]
  chartType: ChartType
  filters: FilterClause[]
}

// ─── VZ 大屏可视化（F-VZ-01~05，API-BI-05） ─────────────────────

/** 聚合请求（API-BI-05）：groupBy + metrics + filters。
 *  groupBy 为空 → 全量总览（卡片）；非空 → 分组聚合（主图表）。 */
export interface AggregateRequest {
  groupBy: string[]
  metrics: { field: string; agg: AggFunc; alias: string }[]
  filters: FilterClause[]
}

/** 聚合响应（API-BI-05）：列名 + 行（列顺序 = groupBy + 各别名）。 */
export interface AggregateResponse {
  columns: string[]
  rows: CellValue[][]
}

/** 下钻栈单层：记录被点维度字段与值，用于面包屑回退与筛选回滚。 */
export interface DrillLevel {
  field: string
  value: string
}
