import { Plus, Trash2 } from 'lucide-react'
import type { AggFunc, ColumnSchema, MetricDef } from '@/types/bi'
import { AGG_LABELS } from '@/types/bi'

interface Props {
  columns: ColumnSchema[]
  metrics: MetricDef[]
  onAdd: (field: string) => void
  onUpdate: (id: string, patch: Partial<Omit<MetricDef, 'id'>>) => void
  onRemove: (id: string) => void
}

const AGGS: AggFunc[] = ['sum', 'avg', 'count', 'count_distinct', 'max', 'min']

const selectCls =
  'h-8 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200'

/** F-MD-02：指标定义 —— 字段 + 聚合 + 别名。字段可选任意列（count_distinct 等可作用于维度）。 */
export default function MetricEditor({ columns, metrics, onAdd, onUpdate, onRemove }: Props) {
  // 默认新增字段优先取指标列，无则取首列
  const defaultField = (columns.find((c) => c.role === 'measure') ?? columns[0])?.name ?? ''

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">指标</h3>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
            每个指标 = 字段 + 聚合方式 + 展示别名
          </p>
        </div>
        <button
          type="button"
          onClick={() => onAdd(defaultField)}
          disabled={!defaultField}
          className="inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-indigo-600 px-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          添加指标
        </button>
      </div>

      {metrics.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500">
          尚未定义指标，至少定义一个指标后才能进入大屏可视化
        </p>
      ) : (
        <ul className="space-y-2">
          {metrics.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2">
              <select
                value={m.field}
                onChange={(e) => onUpdate(m.id, { field: e.target.value })}
                className={selectCls}
              >
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={m.agg}
                onChange={(e) => onUpdate(m.id, { agg: e.target.value as AggFunc })}
                className={selectCls}
              >
                {AGGS.map((a) => (
                  <option key={a} value={a}>
                    {AGG_LABELS[a]}
                  </option>
                ))}
              </select>
              <input
                value={m.alias}
                onChange={(e) => onUpdate(m.id, { alias: e.target.value })}
                placeholder="展示别名"
                maxLength={64}
                className="h-8 w-40 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              />
              <button
                type="button"
                onClick={() => onRemove(m.id)}
                aria-label="删除指标"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
