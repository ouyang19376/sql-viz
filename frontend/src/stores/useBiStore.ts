import { create } from 'zustand'
import type {
  BiTab,
  ChartType,
  DashboardModel,
  DatasetMeta,
  DrillLevel,
  FieldRole,
  MetricDef,
} from '@/types/bi'
import { AGG_LABELS } from '@/types/bi'

/** BI 模块客户端态（内存态，不持久化）。
 *  CM 落地 activeTab（切 Tab 不丢状态，F-CM-02）；
 *  DS 落地 activeDataset + reset（删除当前活跃集后清空右侧，难点 8）；
 *  MD 落地 model + 角色/指标/下钻/图表动作（纯前端建模态，F-MD-01~04）；
 *  VZ 落地 drillStack + drillDown/drillTo（点击下钻 + 面包屑上钻，F-VZ-03/04）。 */
interface BiStore {
  activeTab: BiTab
  setActiveTab: (tab: BiTab) => void

  /** 当前活跃数据集；右侧三 Tab 均基于它工作（F-DS-06）。 */
  activeDataset: DatasetMeta | null
  setActiveDataset: (dataset: DatasetMeta | null) => void

  /** 当前数据集建模态（F-MD）。切换为新数据集时重置，重选同一集时保留。 */
  model: DashboardModel | null

  /** F-VZ-03/04：下钻栈。每层记录被点维度字段与值；聚合筛选与面包屑由它派生。 */
  drillStack: DrillLevel[]
  /** F-VZ-03：点击图元下钻，推进一层。 */
  drillDown: (field: string, value: string) => void
  /** F-VZ-04：面包屑回退到指定深度（depth=0 回到根，清空下钻）。 */
  drillTo: (depth: number) => void

  /** F-MD-01：逐列切换维度 / 指标角色（写入 activeDataset.columns，并清理失效引用）。 */
  setColumnRole: (name: string, role: FieldRole) => void
  /** F-MD-02：新增指标（默认 sum + 自动别名）。 */
  addMetric: (field: string) => void
  /** F-MD-02：修改指标字段 / 聚合 / 别名。 */
  updateMetric: (id: string, patch: Partial<Omit<MetricDef, 'id'>>) => void
  /** F-MD-02：删除指标。 */
  removeMetric: (id: string) => void
  /** F-MD-03：设置有序下钻层级。 */
  setDrillPath: (fields: string[]) => void
  /** F-MD-04：设置图表类型。 */
  setChartType: (chartType: ChartType) => void

  /** F-EX-04：导入配置 JSON（覆盖当前建模态，并校正列角色以与导入一致）。 */
  importModel: (model: DashboardModel) => void
  /** F-EX-05：重置当前数据集的建模 / 可视化配置（保留数据集本身）。 */
  resetModel: () => void

  /** 清空右侧建模 / 可视化状态（删除活跃集时调用，含清空 activeDataset）。 */
  reset: () => void
}

/** 选中数据集时的默认空建模态。 */
function defaultModel(datasetId: string): DashboardModel {
  return { datasetId, dimensions: [], metrics: [], drillPath: [], chartType: 'bar', filters: [] }
}

export const useBiStore = create<BiStore>((set) => ({
  activeTab: 'preview',
  setActiveTab: (activeTab) => set({ activeTab }),

  activeDataset: null,
  setActiveDataset: (activeDataset) =>
    set((state) => {
      if (!activeDataset) return { activeDataset: null, model: null, drillStack: [] }
      // 重选同一数据集 → 保留已有建模态；切换到新集 → 重置为空模型 + 清空下钻
      if (state.model && state.model.datasetId === activeDataset.id) return { activeDataset }
      return { activeDataset, model: defaultModel(activeDataset.id), drillStack: [] }
    }),

  model: null,

  drillStack: [],

  drillDown: (field, value) =>
    set((state) => ({ drillStack: [...state.drillStack, { field, value }] })),

  drillTo: (depth) =>
    set((state) => ({ drillStack: state.drillStack.slice(0, Math.max(0, depth)) })),

  setColumnRole: (name, role) =>
    set((state) => {
      const ds = state.activeDataset
      if (!ds) return {}
      const columns = ds.columns.map((c) => (c.name === name ? { ...c, role } : c))
      const next: Partial<BiStore> = { activeDataset: { ...ds, columns }, drillStack: [] }
      if (state.model) {
        // measure→dimension：移除该字段上的指标；dimension→measure：移出下钻层级
        const metrics =
          role === 'dimension'
            ? state.model.metrics.filter((m) => m.field !== name)
            : state.model.metrics
        const drillPath =
          role === 'measure'
            ? state.model.drillPath.filter((f) => f !== name)
            : state.model.drillPath
        next.model = { ...state.model, metrics, drillPath }
      }
      return next
    }),

  addMetric: (field) =>
    set((state) => {
      if (!state.model) return {}
      const metric: MetricDef = {
        id: crypto.randomUUID(),
        field,
        agg: 'sum',
        alias: `${AGG_LABELS.sum}(${field})`,
      }
      return { model: { ...state.model, metrics: [...state.model.metrics, metric] } }
    }),

  updateMetric: (id, patch) =>
    set((state) => {
      if (!state.model) return {}
      const metrics = state.model.metrics.map((m) => (m.id === id ? { ...m, ...patch } : m))
      return { model: { ...state.model, metrics } }
    }),

  removeMetric: (id) =>
    set((state) => {
      if (!state.model) return {}
      return { model: { ...state.model, metrics: state.model.metrics.filter((m) => m.id !== id) } }
    }),

  setDrillPath: (drillPath) =>
    set((state) =>
      // 下钻层级变更使既有下钻栈失效 → 一并清空
      state.model ? { model: { ...state.model, drillPath }, drillStack: [] } : {},
    ),

  setChartType: (chartType) =>
    set((state) => (state.model ? { model: { ...state.model, chartType } } : {})),

  importModel: (model) =>
    set((state) => {
      const ds = state.activeDataset
      if (!ds) return {}
      // 校正列角色：指标字段→measure、下钻字段→dimension，使建模 Tab 与导入一致
      const metricFields = new Set(model.metrics.map((m) => m.field))
      const drillFields = new Set(model.drillPath)
      const columns = ds.columns.map((c) =>
        metricFields.has(c.name)
          ? { ...c, role: 'measure' as const }
          : drillFields.has(c.name)
            ? { ...c, role: 'dimension' as const }
            : c,
      )
      // datasetId 强制绑定到当前活跃集，避免导入来源 id 残留
      return {
        activeDataset: { ...ds, columns },
        model: { ...model, datasetId: ds.id },
        drillStack: [],
      }
    }),

  resetModel: () =>
    set((state) =>
      state.activeDataset
        ? { model: defaultModel(state.activeDataset.id), drillStack: [], activeTab: 'model' }
        : {},
    ),

  reset: () => set({ activeDataset: null, model: null, drillStack: [], activeTab: 'preview' }),
}))
