import { useMemo, useState } from 'react'
import { Database, Eye, FileText } from 'lucide-react'
import type { AskSource } from '@/types/rag-sql'
import ChunkPreviewDrawer from './ChunkPreviewDrawer'

interface Props {
  sources: AskSource[]
}

/** 来源列表（F-AS-09 来源追溯）：命中表/文档，点击抽屉预览原文（复用 ChunkPreviewDrawer）。
 *  仅展示与提问最相关的前 3 条（按 score 降序）；无命中时不渲染本区块。 */
export default function SourceList({ sources }: Props) {
  const [preview, setPreview] = useState<AskSource | null>(null)

  // 取相关度最高的前 3 条（成功至少 1 条、至多 3 条）；后端已按相关度排序，此处兜底重排。
  const top = useMemo(
    () => [...sources].sort((a, b) => b.score - a.score).slice(0, 3),
    [sources],
  )

  if (top.length === 0) return null // 命中失败不显示

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-ink-2">
        命中来源 <span className="ml-1 text-xs font-normal text-mute">({top.length})</span>
      </h4>
      <ul className="space-y-2">
        {top.map((s, i) => {
          const isTable = s.type === 'table'
          return (
            <li
              key={`${s.collection}-${i}`}
              className="flex items-center justify-between rounded-md border border-line px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                {isTable ? (
                  <Database className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-sky-500" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{s.title}</p>
                  <p className="text-xs text-mute">
                    {isTable ? '表元数据' : '规范文档'} · {s.collection} · score {s.score.toFixed(3)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreview(s)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-2 transition-colors hover:bg-surface-2"
              >
                <Eye className="h-3.5 w-3.5" />
                预览
              </button>
            </li>
          )
        })}
      </ul>
      <ChunkPreviewDrawer
        open={!!preview}
        title={preview?.title ?? ''}
        chunks={preview ? [{ index: 0, text: preview.chunkText }] : []}
        onClose={() => setPreview(null)}
      />
    </div>
  )
}
