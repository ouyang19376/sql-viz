import { Eye, Loader2, Trash2 } from 'lucide-react'
import EmptyState from '@/components/shared/EmptyState'
import {
  KB_CATEGORY_LABELS,
  type KbCategory,
  type KbDocRef,
} from '@/types/rag-sql'

/** 类别展示顺序（F-KB-04 按类别分组） */
const CATEGORY_ORDER: KbCategory[] = [
  'sql_standard',
  'modeling_standard',
  'quality_sla',
  'best_code',
  'model_design',
]

interface Props {
  docs: KbDocRef[]
  onPreview: (id: string) => void
  onDelete: (doc: KbDocRef) => void
  deletingId?: string
}

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false })
}

/** 知识列表（F-KB-04）：按类别分组，每项展示标题/分片数/时间/来源 + 预览/删除。 */
export default function KbList({ docs, onPreview, onDelete, deletingId }: Props) {
  if (docs.length === 0) {
    return (
      <EmptyState
        title="暂无知识文档"
        description="上传 SQL 编码规范 / 建模规范 / 质量 SLA 文档后，此处按类别展示。"
      />
    )
  }

  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: docs.filter((d) => d.category === cat),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="space-y-4">
      {grouped.map(({ cat, items }) => (
        <section key={cat}>
          <h3 className="mb-2 text-sm font-semibold text-ink-2">
            {KB_CATEGORY_LABELS[cat]}
            <span className="ml-1.5 text-xs font-normal text-mute">({items.length})</span>
          </h3>
          <ul className="space-y-2">
            {items.map((doc) => {
              const deleting = deletingId === doc.id
              return (
                <li
                  key={doc.id}
                  className="flex items-center justify-between rounded-md border border-line px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {doc.title}
                    </p>
                    <p className="text-xs text-mute">
                      {doc.chunkCount} 分片 · {fmtTime(doc.createdAt)}
                      {doc.sourceName ? ` · ${doc.sourceName}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onPreview(doc.id)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-2 transition-colors hover:bg-surface-2"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      预览
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(doc)}
                      disabled={deleting}
                      aria-label={`删除 ${doc.title}`}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-500/10"
                    >
                      {deleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      删除
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
