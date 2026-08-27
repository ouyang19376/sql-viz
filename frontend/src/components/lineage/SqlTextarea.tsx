import { LINEAGE_LIMITS } from '@/types/lineage'

interface Props {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  onAnalyze?: () => void
}

/** F-LN-01 / F-LN-02：SQL 多行输入 + 实时字符统计 + Ctrl/Cmd Enter。 */
export default function SqlTextarea({ value, onChange, disabled, onAnalyze }: Props) {
  const len = value.length
  const overLimit = len > LINEAGE_LIMITS.SQL_MAX_CHARS

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      if (!disabled && !overLimit) onAnalyze?.()
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-ink-2" htmlFor="lineage-sql-input">
        SQL 脚本
      </label>
      <div className="relative">
        <textarea
          id="lineage-sql-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={14}
          placeholder="请粘贴 SQL / HQL 脚本，或点击下方按钮上传 .sql / .hql / .txt 文件"
          className={
            'w-full resize-y rounded-xl border px-3 py-2 pr-28 font-mono text-sm text-ink outline-none transition-colors disabled:cursor-not-allowed disabled:bg-surface-2 ' +
            (overLimit
              ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500 dark:border-red-500'
              : 'border-line focus:border-accent focus:ring-1 focus:ring-accent dark:bg-gray-950')
          }
        />
        <span
          className={
            'pointer-events-none absolute bottom-2 right-3 text-xs ' +
            (overLimit ? 'text-red-500' : 'text-mute')
          }
        >
          {len.toLocaleString()} / {LINEAGE_LIMITS.SQL_MAX_CHARS.toLocaleString()}
        </span>
      </div>
      {overLimit && (
        <p className="text-xs text-red-500">
          SQL 内容超过 {LINEAGE_LIMITS.SQL_MAX_CHARS.toLocaleString()} 字符，请精简后再分析。
        </p>
      )}
    </div>
  )
}
