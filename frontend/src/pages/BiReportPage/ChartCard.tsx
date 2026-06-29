import { useEffect, useMemo, useState, type Ref } from 'react'
import type { EChartsOption } from 'echarts'
import type { AggregateResponse, CellValue, ChartType, ColorPalette } from '@/types/bi'
import { COLOR_PALETTES } from '@/types/bi'
import { ensureChinaMap, ensureCityMap, normalizeCity, normalizeKey } from '@/lib/bi/chinaMap'
import DataTable from '@/components/bi/DataTable'
import EChart, { type EChartHandle } from '@/components/bi/EChart'

interface Props {
  chartType: ChartType
  palette: ColorPalette
  data?: AggregateResponse
  loading?: boolean
  error?: boolean
  /** 当前分组维度（用于轴名 / 散点类目）。 */
  currentField?: string
  /** map 类型城市级下钻时被下钻省份的原值；null/未传 = 全国省级地图。 */
  mapProvince?: string | null
  /** 点击图元下钻（传被点维度值）；未传则不可下钻。 */
  onDrill?: (value: string) => void
  onRetry?: () => void
  /** 转发到内部 EChart 实例，供导出 PNG（F-EX-01）。 */
  chartRef?: Ref<EChartHandle>
}

function num(v: CellValue): number {
  return typeof v === 'number' ? v : Number(v ?? 0) || 0
}

/** 地图 option（省/城市级通用）：mapName 决定底图，normalize 决定区域名归一化。
 *  data 项带 raw 原始维度值，供点击下钻筛选用（非归一化 key）。 */
function buildMapOption(
  mapName: string,
  normalize: (v: string) => string,
  columns: string[],
  rows: CellValue[][],
  palette: ColorPalette,
): EChartsOption {
  const gradient = COLOR_PALETTES[palette].gradient
  const metricAliases = columns.slice(1)
  const data: { name: string; value: number; raw: string }[] = rows.map((r) => ({
    name: normalize(String(r[0] ?? '')),
    value: num(r[1]),
    raw: String(r[0] ?? ''),
  }))
  const values = data.map((d) => d.value)
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 0
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c}' },
    visualMap: {
      type: 'continuous',
      min,
      max,
      inRange: { color: gradient },
      left: 8,
      bottom: 16,
    },
    series: [
      {
        type: 'map',
        map: mapName,
        name: metricAliases[0] ?? '',
        roam: true,
        data,
        universalTransition: true,
        emphasis: { label: { show: true } },
      },
    ],
  }
}

/** 非地图类型 option（bar/line/pie/scatter/combo）。
 *  rows 形如 [维度值, 指标1, 指标2, ...]，columns[0]=维度，其余为指标别名。 */
function buildOption(
  chartType: ChartType,
  columns: string[],
  rows: CellValue[][],
  currentField: string,
  palette: ColorPalette,
): EChartsOption {
  const colors = COLOR_PALETTES[palette].colors
  const cats = rows.map((r) => String(r[0] ?? ''))
  const metricAliases = columns.slice(1)

  if (chartType === 'pie') {
    return {
      color: colors,
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
      color: colors,
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

  if (chartType === 'combo') {
    // 组合图：metrics[0]→柱（左轴），metrics[1:]→折线（右轴）；指标<2 时退化为只柱。
    const barAlias = metricAliases[0]
    const lineAliases = metricAliases.slice(1)
    const series = [
      ...(barAlias
        ? [{
            name: barAlias,
            type: 'bar' as const,
            yAxisIndex: 0,
            data: rows.map((r) => num(r[1])),
            emphasis: { focus: 'series' as const },
            universalTransition: true,
          }]
        : []),
      ...lineAliases.map((alias, i) => ({
        name: alias,
        type: 'line' as const,
        yAxisIndex: 1,
        data: rows.map((r) => num(r[i + 2])),
        emphasis: { focus: 'series' as const },
        universalTransition: true,
      })),
    ]
    return {
      color: colors,
      tooltip: { trigger: 'axis' },
      legend: { type: 'scroll', top: 0, data: metricAliases },
      grid: { left: 8, right: 16, bottom: 8, top: 32, containLabel: true },
      xAxis: {
        type: 'category',
        data: cats,
        axisLabel: { interval: 0, rotate: cats.length > 8 ? 30 : 0 },
      },
      yAxis: [
        { type: 'value', name: barAlias ?? '' },
        { type: 'value', name: lineAliases[0] ?? '', alignTicks: true },
      ],
      series,
    }
  }

  // bar / line（其余类型已在上方分支返回；此处仅 bar/line）
  const seriesType: 'bar' | 'line' = chartType === 'line' ? 'line' : 'bar'
  return {
    color: colors,
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

/** F-VZ-02：主图表渲染（bar/line/pie/scatter/combo/map/table）。
 *  F-VZ-03：点击图元 → onDrill(被点维度值)；map 用 data.raw 保留原始维度值。table 仅展示不下钻。
 *  map：mapProvince 非空 → 异步加载该省城市地图（城市级）；否则全国省级（离线）。 */
export default function ChartCard({
  chartType,
  palette,
  data,
  loading,
  error,
  currentField,
  mapProvince,
  onDrill,
  onRetry,
  chartRef,
}: Props) {
  const columns = data?.columns ?? []
  const rows = data?.rows ?? []

  // 城市级地图异步加载：mapProvince 非空时按需拉取该省城市 GeoJSON
  const isCityMap = chartType === 'map' && !!mapProvince
  const [cityMapName, setCityMapName] = useState<string | null>(null)
  const [cityError, setCityError] = useState(false)
  const [retryToken, setRetryToken] = useState(0)
  useEffect(() => {
    if (!isCityMap || !mapProvince) {
      setCityMapName(null)
      setCityError(false)
      return
    }
    let cancelled = false
    setCityError(false)
    ensureCityMap(normalizeKey(mapProvince))
      .then((name) => {
        if (!cancelled) setCityMapName(name)
      })
      .catch(() => {
        if (!cancelled) {
          setCityError(true)
          setCityMapName(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [isCityMap, mapProvince, retryToken])

  const cityLoading = isCityMap && !cityMapName && !cityError

  const option = useMemo(() => {
    if (chartType === 'map') {
      if (isCityMap) {
        if (!cityMapName) return {} as EChartsOption // 加载中/失败，暂不渲染
        return buildMapOption(cityMapName, normalizeCity, columns, rows, palette)
      }
      ensureChinaMap()
      return buildMapOption('china', normalizeKey, columns, rows, palette)
    }
    return buildOption(chartType, columns, rows, currentField ?? '', palette)
  }, [chartType, isCityMap, cityMapName, columns, rows, palette, currentField])

  const onEvents = useMemo(
    () =>
      onDrill
        ? {
            click: (p: any) => {
              // map 的 data 项带 raw（原始维度值），其他类型回退 params.name
              const v = p?.data?.raw ?? p?.name
              if (v != null) onDrill(String(v))
            },
          }
        : undefined,
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

  // 城市级地图加载中
  if (cityLoading) {
    return (
      <div className={shell}>
        <div className="flex min-h-[320px] items-center justify-center text-sm text-gray-400">
          正在加载城市地图…
        </div>
      </div>
    )
  }

  // 城市级地图加载失败
  if (isCityMap && cityError) {
    return (
      <div className={shell}>
        <div className="flex min-h-[320px] flex-col items-center justify-center text-sm text-gray-400">
          城市地图加载失败，请检查网络
          <button
            type="button"
            onClick={() => {
              setCityMapName(null)
              setCityError(false)
              setRetryToken((t) => t + 1)
            }}
            className="mt-2 text-xs text-indigo-600 hover:underline"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  // 非加载态下结果为空 → 空态（map 给出针对性文案）
  if (!loading && rows.length === 0) {
    const emptyText =
      chartType === 'map' ? (isCityMap ? '未匹配到城市，请检查城市列' : '未匹配到中国省份，请检查地区列') : '无匹配数据'
    return (
      <div className={shell}>
        <div className="flex min-h-[320px] items-center justify-center text-sm text-gray-400">
          {emptyText}
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
