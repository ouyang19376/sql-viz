import { useSources } from '@/api/dataprofile'
import { PROFILE_DIALECTS } from '@/types/dataprofile'

interface Props {
  value: string | null
  onChange: (id: string) => void
  /** 仅展示已连接（默认 false：展示全部，带状态文案） */
  connectedOnly?: boolean
}

const STATUS_LABEL: Record<string, string> = {
  connected: '已连接',
  expired: '已失效',
  error: '错误',
  disconnected: '已断开',
}

/** 数据源下拉选择器（QB / Generate 复用，plan §4.2）。下拉项含方言与状态。 */
export default function DataSourcePicker({ value, onChange, connectedOnly }: Props) {
  const { data, isLoading } = useSources()
  const sources = (data ?? []).filter((s) =>
    connectedOnly ? s.status === 'connected' : true,
  )

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={isLoading || sources.length === 0}
      className="max-w-xs truncate rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink"
    >
      {sources.length === 0 && (
        <option value="">{isLoading ? '加载中…' : '尚未连接数据源'}</option>
      )}
      {sources.map((s) => {
        const info = PROFILE_DIALECTS[s.dialect]
        return (
          <option key={s.id} value={s.id}>
            {s.name} · {info.name} · {STATUS_LABEL[s.status] ?? s.status}
          </option>
        )
      })}
    </select>
  )
}
