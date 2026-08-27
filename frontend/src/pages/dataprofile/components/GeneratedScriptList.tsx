import { CheckCircle2, Download, Upload, XCircle } from 'lucide-react'
import CodeBlock from '@/components/code/CodeBlock'
import EmptyState from '@/components/shared/EmptyState'
import type { ScriptSegment } from '@/types/dataprofile'

interface Props {
  segments: ScriptSegment[]
  partialFailures: ScriptSegment[]
  onImportSegment: (seg: ScriptSegment) => void
  onImportAll: () => void
  onDownload: () => void
}

/** 生成脚本段列表（F-PG-07~10）：成功段（✅ + 导入）与失败段（❌ + 原因）。 */
export default function GeneratedScriptList({
  segments,
  partialFailures,
  onImportSegment,
  onImportAll,
  onDownload,
}: Props) {
  if (segments.length === 0 && partialFailures.length === 0) {
    return <EmptyState title="暂无生成结果" description="配置来源与指标后点击「生成脚本」" />
  }

  return (
    <div className="space-y-3">
      {segments.length > 0 && (
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={onImportAll}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2"
          >
            <Upload className="h-3.5 w-3.5" />
            全量导入代码区
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2"
          >
            <Download className="h-3.5 w-3.5" />
            下载 .sql
          </button>
        </div>
      )}

      <ul className="space-y-3">
        {segments.map((seg, i) => (
          <li key={`ok-${i}`} className="rounded-lg border border-green-200 bg-green-50/40 p-3 dark:border-green-800 dark:bg-green-900/10">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                {seg.title}
              </div>
              <button
                type="button"
                onClick={() => onImportSegment(seg)}
                className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-ink-2 hover:bg-surface-2"
              >
                <Upload className="h-3.5 w-3.5" />
                导入
              </button>
            </div>
            <CodeBlock code={seg.sql} />
          </li>
        ))}
      </ul>

      {partialFailures.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-red-600 dark:text-red-400">
            失败段（{partialFailures.length}）— 未导入，可仅导入可用段
          </div>
          <ul className="space-y-2">
            {partialFailures.map((seg, i) => (
              <li key={`fail-${i}`} className="rounded-lg border border-red-200 bg-red-50/40 p-3 dark:border-red-800 dark:bg-red-900/10">
                <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
                  <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  {seg.title}
                </div>
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{seg.error}</p>
                {seg.sql && <CodeBlock code={seg.sql} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
