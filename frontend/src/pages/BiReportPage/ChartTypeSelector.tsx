import { BarChart3, Combine, LineChart, Map, PieChart, ScatterChart, Table } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ChartType } from '@/types/bi'
import { CHART_LABELS } from '@/types/bi'

interface Props {
  value: ChartType
  onChange: (chartType: ChartType) => void
}

const OPTIONS: { value: ChartType; icon: LucideIcon }[] = [
  { value: 'bar', icon: BarChart3 },
  { value: 'line', icon: LineChart },
  { value: 'pie', icon: PieChart },
  { value: 'scatter', icon: ScatterChart },
  { value: 'combo', icon: Combine },
  { value: 'map', icon: Map },
  { value: 'table', icon: Table },
]

/** F-MD-04：图表类型选择 —— bar / line / pie / scatter / combo / map / table 七选一。 */
export default function ChartTypeSelector({ value, onChange }: Props) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">图表类型</h3>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map(({ value: v, icon: Icon }) => {
          const active = v === value
          return (
            <button
              key={v}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(v)}
              className={
                'inline-flex w-20 flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-xs font-medium transition-colors ' +
                (active
                  ? 'border-indigo-400 bg-indigo-50/60 text-indigo-700 dark:border-indigo-500/50 dark:bg-indigo-500/10 dark:text-indigo-300'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800/50')
              }
            >
              <Icon className="h-5 w-5" />
              {CHART_LABELS[v]}
            </button>
          )
        })}
      </div>
    </section>
  )
}
