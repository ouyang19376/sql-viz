import type { SqlDialect } from '@/types/lineage'
import { LINEAGE_DIALECT_OPTIONS } from '@/types/lineage'

interface Props {
  value: SqlDialect
  onChange: (value: SqlDialect) => void
  disabled?: boolean
}

/** F-LN-05：SQL 方言选择。 */
export default function DialectSelector({ value, onChange, disabled }: Props) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
      SQL 方言
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as SqlDialect)}
        disabled={disabled}
        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-teal-500 focus:ring-1 focus:ring-teal-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:disabled:bg-gray-800"
      >
        {LINEAGE_DIALECT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
