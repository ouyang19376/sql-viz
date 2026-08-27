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
    <label className="flex flex-col gap-1 text-sm font-medium text-ink-2">
      SQL 方言
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as SqlDialect)}
        disabled={disabled}
        className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:bg-surface-2"
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
