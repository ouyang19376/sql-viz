import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  confirmBusy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** 破坏性操作二次确认（删除数据集 / 重置）。PRD-bi §7.3。
 *  visual：居中弹窗 + 遮罩，沿用 BiReportPage 抽屉的 overlay 语言。 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '删除',
  confirmBusy = false,
  onConfirm,
  onCancel,
}: Props) {
  // Esc 关闭弹窗（PRD-rag-sql §7.4；与 ChunkPreviewDrawer 同款 keydown 写法，
  // 等同点遮罩/「取消」按钮，对既有 BI/dataprofile 调用方无副作用）。
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-500/10">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink">{title}</h3>
            <p className="mt-1 text-sm text-mute">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirmBusy}
            className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 transition-colors hover:bg-surface-2 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmBusy}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {confirmBusy ? '处理中…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
