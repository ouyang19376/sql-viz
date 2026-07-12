import { CheckCircle2, Loader2, Save, Upload } from 'lucide-react'
import type { IngestStatus } from '@/stores/useRagSqlStore'

interface Props {
  ingestStatus?: IngestStatus
  uploading: boolean
  saved?: boolean
  onSaveDraft: () => void
  onUpload: () => void
}

/** 文本块操作（F-CK-06 草稿 / F-CK-07 上传 + 已入库徽标）。 */
export default function ChunkActions({ ingestStatus, uploading, saved, onSaveDraft, onUpload }: Props) {
  const ingestedAt = ingestStatus?.ingestedAt
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onSaveDraft}
        disabled={uploading}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        <Save className="h-4 w-4" />
        保存草稿
      </button>
      <button
        type="button"
        onClick={onUpload}
        disabled={uploading}
        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        上传至 RAG
      </button>
      {saved && !ingestedAt && (
        <span className="text-xs text-gray-400">已存草稿</span>
      )}
      {ingestedAt && (
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {ingestStatus?.overwritten ? '已覆盖更新' : '已入库'} ·{' '}
          {new Date(ingestedAt * 1000).toLocaleString()}
        </span>
      )}
    </div>
  )
}
