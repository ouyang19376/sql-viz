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

/** 排序方向。 */
export type SortOrder = 'asc' | 'desc'

/** 单列排序（明细预览 + 大屏聚合共用）：字段 + 方向；null 表示不排序。 */
export interface SortClause {
  field: string
  order: SortOrder
}

/** 明细预览请求（API-BI-04）。 */
export interface PreviewRequest {
  page: number
  pageSize: number
  filters: FilterClause[]
  sort?: SortClause | null
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

/** 图表类型（F-MD-04）。combo=柱+折线组合图，map=中国省级地图。 */
export type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'combo' | 'map' | 'table'

/** 图表类型中文标签。 */
export const CHART_LABELS: Record<ChartType, string> = {
  bar: '柱状图',
  line: '折线图',
  pie: '饼图',
  scatter: '散点图',
  combo: '组合图',
  map: '地图',
  table: '表格',
}

/** 图表配色方案（F-MD 颜色配置）：建模态选择，随 DashboardModel 导出/导入。 */
export type ColorPalette = 'default' | 'warm' | 'cool' | 'contrast'

/** 各配色方案：
 *  - colors：离散系列色（bar/line/pie/scatter/combo 按系列分色，无顺序含义）。
 *  - gradient：顺序渐变色阶（浅→深，3 色锚点，ECharts 在其间插值），
 *    用于地图 visualMap，体现指标值低→高的阶梯渐进。 */
export const COLOR_PALETTES: Record<ColorPalette, { label: string; colors: string[]; gradient: string[] }> = {
  default: { label: '默认', colors: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4'], gradient: ['#eaf1fb', '#5470c6', '#2a3f8f'] },
  warm: { label: '暖色', colors: ['#ee6666', '#fc8452', '#fac858', '#d48265', '#e37c4f', '#c05050', '#dd6b66', '#bda233'], gradient: ['#fff1e3', '#f5a05a', '#a83232'] },
  cool: { label: '冷色', colors: ['#5470c6', '#73c0de', '#3ba272', '#91cc75', '#5ab1ef', '#2ec7c9', '#3a7dc7', '#58c4e3'], gradient: ['#e0f5f3', '#2ec7c9', '#165e5c'] },
  contrast: { label: '高对比', colors: ['#5470c6', '#ee6666', '#91cc75', '#fac858', '#73c0de', '#fc8452', '#9a60b4', '#3ba272'], gradient: ['#efe6fb', '#9a60b4', '#3b1a5c'] },
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
  palette: ColorPalette
  filters: FilterClause[]
}

// ─── VZ 大屏可视化（F-VZ-01~05，API-BI-05） ─────────────────────

/** 聚合请求（API-BI-05）：groupBy + metrics + filters。
 *  groupBy 为空 → 全量总览（卡片）；非空 → 分组聚合（主图表）。 */
export interface AggregateRequest {
  groupBy: string[]
  metrics: { field: string; agg: AggFunc; alias: string }[]
  filters: FilterClause[]
  sort?: SortClause | null
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
