import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { KbChunk } from '@/types/rag-sql'

interface Props {
  open: boolean
  title: string
  chunks: KbChunk[]
  loading?: boolean
  onClose: () => void
}

/** 分片原文预览抽屉（F-KB-05，PRD §4.2；AS 来源预览复用本组件）。
 *  右侧抽屉 + 遮罩，沿用 ConfirmDialog overlay 语言；Esc 关闭（§7.4）。 */
export default function ChunkPreviewDrawer({ open, title, chunks, loading, onClose }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative flex h-full w-full max-w-xl flex-col border-l border-line bg-surface shadow-xl">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="truncate text-sm font-semibold text-ink">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="text-mute transition-colors hover:text-ink-2"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-mute">加载中…</p>
          ) : chunks.length === 0 ? (
            <p className="text-sm text-mute">无分片</p>
          ) : (
            chunks.map((c) => (
              <div
                key={c.index}
                className="rounded-md border border-line p-3"
              >
                <div className="mb-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  分片 #{c.index + 1}
                </div>
                <pre className="whitespace-pre-wrap break-words font-mono text-sm text-ink-2">
                  {c.text}
                </pre>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
