import type { TableSummary } from '@/types/rag-sql'
import EditableField from './EditableField'

interface Props {
  summary: TableSummary
  onChange: (s: TableSummary) => void
}

/** 表概要字段（F-CK-04 概要 / F-CK-05 逐项编辑）。
 *  tableName 结构层只读（来自 sqlglot，不可改）；余字段经 EditableField 编辑。 */
export default function SummaryFields({ summary, onChange }: Props) {
  const set = (patch: Partial<TableSummary>) => onChange({ ...summary, ...patch })

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 py-1">
        <div className="min-w-0">
          <div className="text-xs font-medium text-mute">表名（结构层）</div>
          <div className="truncate font-mono text-sm text-ink">
            {summary.tableName}
          </div>
        </div>
      </div>
      <EditableField
        label="中文名"
        value={summary.chineseName}
        onChange={(v) => set({ chineseName: v })}
      />
      <EditableField
        label="主题域"
        value={summary.topic}
        placeholder="如 交易域 / 用户域"
        onChange={(v) => set({ topic: v })}
      />
      <EditableField
        label="描述"
        value={summary.description}
        multiline
        onChange={(v) => set({ description: v })}
      />
      <EditableField
        label="关键列（逗号分隔）"
        value={(summary.keyFields ?? []).join(', ')}
        placeholder="如 order_id, final_amount"
        onChange={(v) =>
          set({
            keyFields: v
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          })
        }
      />
      <EditableField
        label="分区字段"
        value={summary.partitionField}
        onChange={(v) => set({ partitionField: v })}
      />
      <EditableField
        label="数据粒度"
        value={summary.granularity}
        placeholder="如 一行代表一个订单中的一个 SKU"
        onChange={(v) => set({ granularity: v })}
      />
    </div>
  )
}
