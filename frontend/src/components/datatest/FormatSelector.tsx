import type { ExportFormat } from '@/types/datatest'

interface Props {
  value: ExportFormat
  onChange: (f: ExportFormat) => void
  disabled?: boolean
}

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'xlsx', label: 'xlsx' },
  { value: 'json', label: 'json' },
  { value: 'csv', label: 'csv' },
]

/** F-DT-06：导出格式单选按钮组。 */
export default function FormatSelector({ value, onChange, disabled }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-ink-2">格式</span>
      <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1">
        {FORMATS.map((f) => {
          const active = f.value === value
          return (
            <button
              key={f.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(f.value)}
              className={
                'rounded-md px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ' +
                (active
                  ? 'bg-accent text-white'
                  : 'text-ink-2 hover:bg-surface-2')
              }
            >
              {f.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
