import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Table2 } from 'lucide-react'
import { useBiStore } from '@/stores/useBiStore'
import { useAggregate } from '@/api/bi'
import type { FilterClause } from '@/types/bi'
import type { EChartHandle } from '@/components/bi/EChart'
import EmptyState from '@/components/shared/EmptyState'
import OverviewCards from './OverviewCards'
import DrillBreadcrumb from './DrillBreadcrumb'
import ChartCard from './ChartCard'
import DetailDrawer from './DetailDrawer'
import ExportToolbar from './ExportToolbar'

/** Tab3 大屏可视化（F-VZ-01~05）：总览卡片 + 面包屑 + 主图（点击下钻）+ 明细联动。
 *
 *  分组维度：drillPath 非空时 = drillPath[depth]；drillPath 为空时回退首个维度列（不可下钻）。
 *  聚合筛选：由 drillStack 派生等值条件；总览卡片始终展示全量（filters=[]）。 */
export default function DashboardTab() {
  const activeDataset = useBiStore((s) => s.activeDataset)
  const model = useBiStore((s) => s.model)
  const drillStack = useBiStore((s) => s.drillStack)
  const drillDown = useBiStore((s) => s.drillDown)
  const drillTo = useBiStore((s) => s.drillTo)
  const importModel = useBiStore((s) => s.importModel)
  const resetModel = useBiStore((s) => s.resetModel)

  const [detailOpen, setDetailOpen] = useState(false)
  const chartRef = useRef<EChartHandle>(null)

  const ready = !!activeDataset && !!model && model.metrics.length > 0
  const datasetId = activeDataset?.id ?? null

  // 派生（model 为空时给安全默认，hooks 需无条件调用）
  const metrics = model?.metrics ?? []
  const drillPath = model?.drillPath ?? []
  const chartType = model?.chartType ?? 'bar'
  const depth = drillStack.length
  const dims = activeDataset?.columns.filter((c) => c.role === 'dimension').map((c) => c.name) ?? []

  // 当前分组维度：下钻层级优先，否则回退首个维度列
  const currentField = drillPath[depth] ?? (drillPath.length === 0 ? dims[0] : undefined)
  // 还能否继续下钻：drillPath 内且未到末级
  const canDrillNext = drillPath.length > 0 && depth < drillPath.length - 1

  const metricsReq = metrics.map((m) => ({ field: m.field, agg: m.agg, alias: m.alias }))
  const drillFilters: FilterClause[] = drillStack.map((s) => ({
    field: s.field,
    op: 'eq',
    value: s.value,
  }))

  // 总览：全量聚合（groupBy=[]，不带下钻筛选）
  const overview = useAggregate(datasetId, { groupBy: [], metrics: metricsReq, filters: [] }, ready)
  // 主图：按当前维度分组 + 下钻筛选
  const chart = useAggregate(
    datasetId,
    { groupBy: currentField ? [currentField] : [], metrics: metricsReq, filters: drillFilters },
    ready && !!currentField,
  )

  if (!ready) {
    return (
      <EmptyState
        title="模型不完整"
        description="请先在「建模配置」定义至少一个指标"
      />
    )
  }

  // 点击图元：能下钻则推进，已到末级则提示
  const handleDrill = currentField
    ? (value: string) => {
        if (canDrillNext) {
          drillDown(currentField, value)
        } else if (drillPath.length > 0) {
          toast.message('已到最末下钻层级')
        }
      }
    : undefined

  return (
    <div className="space-y-5">
      {/* F-VZ-01：总览指标卡片 */}
      <OverviewCards metrics={metrics} row={overview.data?.rows[0]} loading={overview.isLoading} />

      {/* 工具条：面包屑（F-VZ-04）+ 查看明细（F-VZ-05）+ 导出/重置（F-EX-01~05） */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DrillBreadcrumb stack={drillStack} currentField={currentField} onJump={drillTo} />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 px-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <Table2 className="h-4 w-4" />
            查看明细
          </button>
          <ExportToolbar
            dataset={activeDataset!}
            model={model!}
            data={chart.data}
            chartType={chartType}
            chartRef={chartRef}
            importModel={importModel}
            resetModel={resetModel}
          />
        </div>
      </div>

      {/* drillPath 为空且无任何维度 → 无法分组出图，引导建模 */}
      {!currentField ? (
        <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-gray-300 text-sm text-gray-400 dark:border-gray-700">
          请在「建模配置」设置下钻层级，或将某列设为维度以生成图表
        </div>
      ) : (
        <ChartCard
          chartType={chartType}
          data={chart.data}
          loading={chart.isLoading}
          error={chart.isError}
          currentField={currentField}
          onDrill={handleDrill}
          onRetry={() => chart.refetch()}
          chartRef={chartRef}
        />
      )}

      <DetailDrawer
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        datasetId={activeDataset!.id}
        filters={drillFilters}
      />
    </div>
  )
}
