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
      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">格式</span>
      <div className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white p-1 dark:border-gray-700 dark:bg-gray-900">
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
                  ? 'bg-indigo-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800')
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
