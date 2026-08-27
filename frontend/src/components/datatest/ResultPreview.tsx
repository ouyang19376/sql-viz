import { Download } from 'lucide-react'
import { toast } from 'sonner'
import type {
  DataTestMode,
  ExportFormat,
  GenerateResponseSuccess,
} from '@/types/datatest'
import { DT_LIMITS } from '@/types/datatest'
import { exportCsv } from '@/lib/exporters/exportCsv'
import { exportJson } from '@/lib/exporters/exportJson'
import { exportXlsx } from '@/lib/exporters/exportXlsx'
import { downloadFile } from '@/lib/exporters/downloadFile'
import ResultTable from './ResultTable'

interface Props {
  result: GenerateResponseSuccess
  mode: DataTestMode
  format: ExportFormat
}

/** F-DT-08 / F-DT-09：结果预览 + 一键下载。
 *  文件名：testdata-{mode}-{YYYYMMDD-HHmmss}.{ext} */
function buildFilename(mode: DataTestMode, format: ExportFormat): string {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `testdata-${mode}-${ts}.${format}`
}

export default function ResultPreview({ result, mode, format }: Props) {
  const { columns, rows } = result
  const totalRows = rows.length
  const previewN = Math.min(totalRows, DT_LIMITS.PREVIEW_ROWS)

  const handleDownload = () => {
    const filename = buildFilename(mode, format)
    let blob: Blob
    if (format === 'csv') blob = exportCsv(columns, rows)
    else if (format === 'json') blob = exportJson(columns, rows)
    else blob = exportXlsx(columns, rows)
    downloadFile(blob, filename)
    toast.success(`下载已开始：${filename}`)
  }

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-ink-2">
          共 <strong className="text-ink">{totalRows}</strong> 行
          <span className="ml-2 text-mute">· 预览前 {previewN} 行</span>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
        >
          <Download className="h-4 w-4" />
          下载 {format}
        </button>
      </div>
      <ResultTable result={result} />
    </section>
  )
}
