import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import type { ColumnSchema } from '@/types/bi'

interface Props {
  dimensions: ColumnSchema[]
  drillPath: string[]
  onChange: (fields: string[]) => void
}

/** F-MD-03：有序下钻层级。drillPath 决定大屏下钻顺序（第 1 级为顶层）。 */
export default function DrillPathEditor({ dimensions, drillPath, onChange }: Props) {
  const available = dimensions.filter((d) => !drillPath.includes(d.name))

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= drillPath.length) return
    const next = [...drillPath]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">下钻层级</h3>
      <p className="mt-0.5 mb-3 text-xs text-gray-400 dark:text-gray-500">
        按顺序排列维度，决定大屏点击下钻的层级；为空时仅展示当前维度聚合
      </p>

      {dimensions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500">
          无可用维度，请在「字段角色」中将列设为维度
        </p>
      ) : (
        <div className="space-y-3">
          {drillPath.length > 0 && (
            <ol className="space-y-1.5">
              {drillPath.map((field, i) => (
                <li
                  key={field}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5 dark:border-gray-800"
                >
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-100">
                    {field}
                  </span>
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="上移"
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === drillPath.length - 1}
                    aria-label="下移"
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(drillPath.filter((f) => f !== field))}
                    aria-label="移除"
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ol>
          )}

          {available.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {available.map((d) => (
                <button
                  key={d.name}
                  type="button"
                  onClick={() => onChange([...drillPath, d.name])}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-xs text-gray-600 transition-colors hover:border-indigo-400 hover:text-indigo-600 dark:border-gray-700 dark:text-gray-300"
                >
                  <Plus className="h-3 w-3" />
                  {d.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
