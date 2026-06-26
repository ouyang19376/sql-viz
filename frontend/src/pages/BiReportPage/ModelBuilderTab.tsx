import { useBiStore } from '@/stores/useBiStore'
import EmptyState from '@/components/shared/EmptyState'
import FieldRolePanel from './FieldRolePanel'
import MetricEditor from './MetricEditor'
import DrillPathEditor from './DrillPathEditor'
import ChartTypeSelector from './ChartTypeSelector'

/** Tab2 建模配置（F-MD-01/02/03/04）：字段角色 + 指标 + 下钻层级 + 图表类型。
 *  纯前端态写入 useBiStore.model，切 Tab 不丢失。 */
export default function ModelBuilderTab() {
  const activeDataset = useBiStore((s) => s.activeDataset)
  const model = useBiStore((s) => s.model)
  const setColumnRole = useBiStore((s) => s.setColumnRole)
  const addMetric = useBiStore((s) => s.addMetric)
  const updateMetric = useBiStore((s) => s.updateMetric)
  const removeMetric = useBiStore((s) => s.removeMetric)
  const setDrillPath = useBiStore((s) => s.setDrillPath)
  const setChartType = useBiStore((s) => s.setChartType)

  if (!activeDataset || !model) {
    return (
      <EmptyState
        title="请先在左侧选择数据集"
        description="选择数据集后可在此配置维度 / 指标 / 下钻 / 图表"
      />
    )
  }

  const dimensions = activeDataset.columns.filter((c) => c.role === 'dimension')

  return (
    <div className="max-w-2xl space-y-8">
      <FieldRolePanel columns={activeDataset.columns} onChange={setColumnRole} />
      <MetricEditor
        columns={activeDataset.columns}
        metrics={model.metrics}
        onAdd={addMetric}
        onUpdate={updateMetric}
        onRemove={removeMetric}
      />
      <DrillPathEditor dimensions={dimensions} drillPath={model.drillPath} onChange={setDrillPath} />
      <ChartTypeSelector value={model.chartType} onChange={setChartType} />
    </div>
  )
}
