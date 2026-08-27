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
      <h3 className="mb-3 text-sm font-semibold text-ink">图表类型</h3>
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
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line text-ink-2 hover:bg-surface-2')
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
