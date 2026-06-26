import { useMemo, type Ref } from 'react'
import type { EChartsOption } from 'echarts'
import type { AggregateResponse, CellValue, ChartType } from '@/types/bi'
import DataTable from '@/components/bi/DataTable'
import EChart, { type EChartHandle } from '@/components/bi/EChart'

interface Props {
  chartType: ChartType
  data?: AggregateResponse
  loading?: boolean
  error?: boolean
  /** 当前分组维度（用于轴名 / 散点类目）。 */
  currentField?: string
  /** 点击图元下钻（传被点维度值）；未传则不可下钻。 */
  onDrill?: (value: string) => void
  onRetry?: () => void
  /** 转发到内部 EChart 实例，供导出 PNG（F-EX-01）。 */
  chartRef?: Ref<EChartHandle>
}

function num(v: CellValue): number {
  return typeof v === 'number' ? v : Number(v ?? 0) || 0
}

/** 由聚合结果 + 图表类型组装 ECharts option。
 *  rows 形如 [维度值, 指标1, 指标2, ...]，columns[0]=维度，其余为指标别名。 */
function buildOption(
  chartType: ChartType,
  columns: string[],
  rows: CellValue[][],
  currentField: string,
): EChartsOption {
  const cats = rows.map((r) => String(r[0] ?? ''))
  const metricAliases = columns.slice(1)

  if (chartType === 'pie') {
    return {
      tooltip: { trigger: 'item' },
      legend: { type: 'scroll', bottom: 0 },
      series: [
        {
          type: 'pie',
          name: metricAliases[0],
          radius: ['40%', '70%'],
          data: rows.map((r) => ({ name: String(r[0] ?? ''), value: num(r[1]) })),
          universalTransition: true,
        },
      ],
    }
  }

  if (chartType === 'scatter') {
    const useTwo = metricAliases.length >= 2
    return {
      tooltip: { trigger: 'item' },
      grid: { left: 8, right: 24, bottom: 8, top: 24, containLabel: true },
      xAxis: useTwo
        ? { type: 'value', name: metricAliases[0] }
        : { type: 'category', name: currentField, data: cats },
      yAxis: { type: 'value', name: useTwo ? metricAliases[1] : metricAliases[0] },
      series: [
        {
          type: 'scatter',
          symbolSize: 16,
          data: rows.map((r, idx) => ({
            name: String(r[0] ?? ''),
            value: useTwo ? [num(r[1]), num(r[2])] : [idx, num(r[1])],
          })),
        },
      ],
    }
  }

  // bar / line（其余类型已在上方分支返回；此处仅 bar/line）
  const seriesType: 'bar' | 'line' = chartType === 'line' ? 'line' : 'bar'
  return {
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll', top: 0, data: metricAliases },
    grid: { left: 8, right: 16, bottom: 8, top: 32, containLabel: true },
    xAxis: {
      type: 'category',
      data: cats,
      axisLabel: { interval: 0, rotate: cats.length > 8 ? 30 : 0 },
    },
    yAxis: { type: 'value' },
    series: metricAliases.map((alias, i) => ({
      name: alias,
      type: seriesType,
      data: rows.map((r) => num(r[i + 1])),
      emphasis: { focus: 'series' },
      universalTransition: true,
    })),
  }
}

/** F-VZ-02：主图表渲染（bar/line/pie/scatter/table）。
 *  F-VZ-03：点击图元 → onDrill(被点维度值)。table 类型仅展示不下钻。 */
export default function ChartCard({
  chartType,
  data,
  loading,
  error,
  currentField,
  onDrill,
  onRetry,
  chartRef,
}: Props) {
  const columns = data?.columns ?? []
  const rows = data?.rows ?? []

  const option = useMemo(
    () => buildOption(chartType, columns, rows, currentField ?? ''),
    [chartType, columns, rows, currentField],
  )

  const onEvents = useMemo(
    () => (onDrill ? { click: (p: any) => p?.name != null && onDrill(String(p.name)) } : undefined),
    [onDrill],
  )

  const shell =
    'rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900'

  if (error) {
    return (
      <div className={shell}>
        <div className="flex min-h-[320px] flex-col items-center justify-center text-sm text-gray-400">
          聚合失败
          {onRetry && (
            <button type="button" onClick={onRetry} className="mt-2 text-xs text-indigo-600 hover:underline">
              重试
            </button>
          )}
        </div>
      </div>
    )
  }

  if (chartType === 'table') {
    return (
      <div className={shell}>
        <DataTable columns={columns} rows={rows} loading={loading} />
      </div>
    )
  }

  // 非加载态下结果为空 → 空态
  if (!loading && rows.length === 0) {
    return (
      <div className={shell}>
        <div className="flex min-h-[320px] items-center justify-center text-sm text-gray-400">
          无匹配数据
        </div>
      </div>
    )
  }

  return (
    <div className={shell}>
      <EChart ref={chartRef} option={option} onEvents={onEvents} loading={loading} />
    </div>
  )
}
