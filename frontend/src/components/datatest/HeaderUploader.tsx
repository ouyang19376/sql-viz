import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { toast } from 'sonner'
import { DT_LIMITS } from '@/types/datatest'
import { parseCsvHeader } from '@/lib/parsers/parseCsvHeader'
import { parseXlsxHeader } from '@/lib/parsers/parseXlsxHeader'

interface Props {
  onParsed: (headers: string[]) => void
  disabled?: boolean
}

/** F-DT-04：上传 .xlsx / .csv，前端解析首行表头并追加。
 *  仅取首行，不读取样本数据。后端不接受文件上传，零落盘风险（plan §6.6）。 */
export default function HeaderUploader({ onParsed, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const handlePick = () => inputRef.current?.click()

  const handleFile = async (file: File) => {
    // 大小校验
    if (file.size > DT_LIMITS.UPLOAD_SIZE_MAX) {
      toast.error('文件大小不得超过 2MB')
      return
    }
    // 后缀校验（PRD §8.3：MIME + 后缀双校验，但实务上 MIME 在浏览器可伪造，
    //  这里以后缀为主、解析失败兜底）
    const lower = file.name.toLowerCase()
    const isXlsx = lower.endsWith('.xlsx')
    const isCsv = lower.endsWith('.csv')
    if (!isXlsx && !isCsv) {
      toast.error('仅支持 .xlsx 和 .csv 文件')
      return
    }

    setBusy(true)
    try {
      const headers = isXlsx ? await parseXlsxHeader(file) : await parseCsvHeader(file)
      onParsed(headers)
      toast.success(`成功解析 ${headers.length} 个字段`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '文件解析失败，请检查文件内容'
      toast.error(`文件解析失败：${msg}`)
    } finally {
      setBusy(false)
      // 清空 input 的 value，以便下次选同名文件也能触发 onChange
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (disabled || busy) return
    const file = e.dataTransfer.files[0]
    if (file) await handleFile(file)
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className={
        'flex items-center justify-between gap-3 rounded-lg border border-dashed bg-white px-4 py-3 dark:bg-gray-900 ' +
        (disabled || busy
          ? 'border-gray-200 text-gray-400 dark:border-gray-800'
          : 'border-gray-300 text-gray-600 hover:border-indigo-400 dark:border-gray-700 dark:text-gray-300')
      }
    >
      <div className="flex items-center gap-2 text-sm">
        <Upload className="h-4 w-4" />
        <span>
          上传 <code className="text-xs">.xlsx</code> 或 <code className="text-xs">.csv</code>
          ，仅取首行作为字段名追加
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
        disabled={disabled || busy}
      />
      <button
        type="button"
        onClick={handlePick}
        disabled={disabled || busy}
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        {busy ? '解析中…' : '选择文件'}
      </button>
    </div>
  )
}
