import type { CellValue, MetricDef } from '@/types/bi'

interface Props {
  metrics: MetricDef[]
  /** 全量聚合单行结果，顺序与 metrics 对齐（groupBy=[]）。 */
  row?: CellValue[]
  loading?: boolean
}

/** 数值格式化：千分位；非数原样；空值 —。 */
function formatValue(v: CellValue | undefined): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') {
    return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
  return String(v)
}

/** F-VZ-01：总览指标卡片。顶部悬浮卡片展示各指标全量聚合总览值。 */
export default function OverviewCards({ metrics, row, loading }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((m, i) => (
        <div
          key={m.id}
          className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
        >
          <p className="truncate text-xs font-medium text-gray-500 dark:text-gray-400" title={m.alias}>
            {m.alias}
          </p>
          {loading ? (
            <div className="mt-2 h-7 w-20 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
          ) : (
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatValue(row?.[i])}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
