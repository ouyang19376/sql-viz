import { useRef, useState } from 'react'
import { UploadCloud } from 'lucide-react'
import { toast } from 'sonner'
import { useUploadMutation } from '@/api/bi'
import { useBiStore } from '@/stores/useBiStore'

const MAX_MB = 10
const MAX_BYTES = MAX_MB * 1024 * 1024

/** F-DS-01：拖拽 / 选择 .xlsx / .csv 上传 → 后端 pandas 解析落盘。
 *  成功后自动选中新数据集（F-DS-06）+ Toast「解析成功，共 N 行」。 */
export default function DatasetUploader() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const upload = useUploadMutation()
  const setActiveDataset = useBiStore((s) => s.setActiveDataset)

  const handleFile = (file: File) => {
    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.xlsx') && !lower.endsWith('.csv')) {
      toast.error('仅支持 .xlsx 和 .csv 文件')
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error(`文件大小不得超过 ${MAX_MB}MB`)
      return
    }
    upload.mutate(file, {
      onSuccess: (meta) => {
        setActiveDataset(meta)
        toast.success(`解析成功，共 ${meta.rowCount} 行`)
      },
      onError: (err) => toast.error(err.message || '文件解析失败，请检查文件内容'),
    })
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    if (upload.isPending) return
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={
        'rounded-lg border border-dashed p-4 text-center transition-colors ' +
        (upload.isPending
          ? 'border-gray-200 dark:border-gray-800'
          : dragOver
            ? 'border-indigo-400 bg-indigo-50/50 dark:border-indigo-500 dark:bg-indigo-500/5'
            : 'border-gray-300 hover:border-indigo-400 dark:border-gray-700')
      }
    >
      <UploadCloud className="mx-auto h-6 w-6 text-gray-400" />
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {upload.isPending ? '解析中，请稍候…' : '拖拽或选择 .xlsx / .csv'}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.csv"
        className="hidden"
        disabled={upload.isPending}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          if (inputRef.current) inputRef.current.value = ''
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={upload.isPending}
        className="mt-3 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        {upload.isPending ? '解析中…' : '选择文件'}
      </button>
    </div>
  )
}
