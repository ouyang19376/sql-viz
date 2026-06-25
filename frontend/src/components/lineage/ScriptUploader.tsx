import { useRef, useState } from 'react'
import { FileText, Files, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { LINEAGE_LIMITS } from '@/types/lineage'

interface Props {
  onFileLoaded: (content: string, fileName: string, fileSize: number) => void
  onBatchLoaded?: (content: string, fileName: string, fileSize: number, fileCount: number) => void
  hasExistingContent: boolean
  disabled?: boolean
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsText(file, 'utf-8')
  })
}

function validateFile(file: File): boolean {
  const lowerName = file.name.toLowerCase()
  const validExtension = LINEAGE_LIMITS.ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))
  if (!validExtension) {
    toast.error(`仅支持 .sql / .hql / .txt 文件：${file.name}`)
    return false
  }

  if (file.size > LINEAGE_LIMITS.UPLOAD_SIZE_MAX) {
    toast.error(`文件大小不能超过 2MB：${file.name}`)
    return false
  }

  return true
}

/** F-LN-03 / F-LN-14：上传脚本文本文件；单文件填入，批量文件合并为一个脚本。 */
export default function ScriptUploader({ onFileLoaded, onBatchLoaded, hasExistingContent, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const batchInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const clearInput = () => {
    if (inputRef.current) inputRef.current.value = ''
    if (batchInputRef.current) batchInputRef.current.value = ''
  }

  const handlePick = () => inputRef.current?.click()
  const handleBatchPick = () => batchInputRef.current?.click()

  const handleFile = async (file: File) => {
    try {
      if (!validateFile(file)) return

      if (hasExistingContent && !window.confirm('上传文件会覆盖当前 SQL 内容，是否继续？')) {
        return
      }

      setBusy(true)
      const content = await readFileAsText(file)
      onFileLoaded(content, file.name, file.size)
      toast.success(`文件已加载：${file.name}（${formatFileSize(file.size)}）`)
    } catch {
      toast.error('文件读取失败，请检查文件编码或内容')
    } finally {
      setBusy(false)
      clearInput()
    }
  }

  const handleBatchFiles = async (files: File[]) => {
    try {
      if (files.length === 0) return
      if (!files.every(validateFile)) return
      const totalSize = files.reduce((sum, file) => sum + file.size, 0)
      if (totalSize > LINEAGE_LIMITS.BATCH_UPLOAD_SIZE_MAX) {
        toast.error('批量文件总大小不能超过 5MB')
        return
      }

      if (hasExistingContent && !window.confirm('批量上传会覆盖当前 SQL 内容，是否继续？')) {
        return
      }

      setBusy(true)
      const chunks = await Promise.all(
        files.map(async (file, index) => {
          const content = await readFileAsText(file)
          return `-- ===== File ${index + 1}: ${file.name} =====\n${content.trim()}\n`
        }),
      )
      const merged = chunks.join('\n')
      onBatchLoaded?.(merged, `${files.length} 个脚本文件`, totalSize, files.length)
      toast.success(`已合并 ${files.length} 个文件（${formatFileSize(totalSize)}）`)
    } catch {
      toast.error('文件读取失败，请检查文件编码或内容')
    } finally {
      setBusy(false)
      clearInput()
    }
  }

  const inactive = disabled || busy

  return (
    <div
      className={
        'flex flex-col gap-3 rounded-xl border border-dashed px-4 py-3 ' +
        (inactive
          ? 'border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-800 dark:bg-gray-950'
          : 'border-gray-300 bg-white text-gray-600 hover:border-teal-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300')
      }
    >
      <div className="flex items-start gap-2 text-sm">
        <FileText className="mt-0.5 h-4 w-4 text-teal-600" />
        <span>
          上传 <code className="text-xs">.sql</code> / <code className="text-xs">.hql</code> /{' '}
          <code className="text-xs">.txt</code> 文件，前端读取后填入输入框
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={LINEAGE_LIMITS.ALLOWED_EXTENSIONS.join(',')}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void handleFile(file)
        }}
        disabled={inactive}
      />
      <input
        ref={batchInputRef}
        type="file"
        multiple
        accept={LINEAGE_LIMITS.ALLOWED_EXTENSIONS.join(',')}
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          void handleBatchFiles(files)
        }}
        disabled={inactive}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={handlePick}
          disabled={inactive}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <Upload className="h-4 w-4" />
          {busy ? '读取中…' : '选择文件'}
        </button>
        <button
          type="button"
          onClick={handleBatchPick}
          disabled={inactive}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-teal-300 bg-teal-50 px-3 py-1.5 text-sm text-teal-700 transition-colors hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-200"
        >
          <Files className="h-4 w-4" />
          批量选择
        </button>
      </div>
    </div>
  )
}
