import { useRef, useState } from 'react'
import { FileUp, Loader2, Upload } from 'lucide-react'
import { useRagSqlStore } from '@/stores/useRagSqlStore'
import {
  KB_CATEGORY_LABELS,
  type KbCategory,
  type KbDocInput,
} from '@/types/rag-sql'

/** .txt 文件大小上限（F-KB-08，与后端 RAG_DOC_MAX_BYTES=1MB 对齐） */
const MAX_BYTES = 1048576
/** content 字符上限（与后端 KbDocInput.content max_length 对齐） */
const MAX_CHARS = 200000

interface Props {
  onUpload: (draft: KbDocInput) => void
  pending: boolean
}

/** 知识上传器（F-KB-01/02/08）：文本框 + .txt 上传 + 类别必选 + 标题可选。
 *  表单态由 store kbDraft 保活（跨 Tab 不丢输入）；标题空时按文件名/首行兜底。 */
export default function KbUploader({ onUpload, pending }: Props) {
  const kbDraft = useRagSqlStore((s) => s.kbDraft)
  const updateKbDraft = useRagSqlStore((s) => s.updateKbDraft)
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const over = kbDraft.content.length > MAX_CHARS
  const empty = kbDraft.content.trim().length === 0
  const blocked = pending || over || empty

  const handleFile = (file: File) => {
    setFileError(null)
    if (file.size > MAX_BYTES) {
      setFileError(`文件 ${(file.size / 1024).toFixed(0)} KB 超过 1 MB 上限，已拦截`)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const base = file.name.replace(/\.txt$/i, '')
      updateKbDraft({
        content: text,
        sourceName: file.name,
        title: kbDraft.title || base,
      })
    }
    reader.onerror = () => setFileError('文件读取失败')
    reader.readAsText(file)
  }

  /** 标题兜底：用户填的 > 文件名(去 .txt) > 正文首行（截断 60 字符） */
  const deriveTitle = (): string => {
    const t = kbDraft.title.trim()
    if (t) return t
    if (kbDraft.sourceName) return kbDraft.sourceName.replace(/\.txt$/i, '')
    const firstLine = kbDraft.content
      .split('\n')
      .map((l) => l.trim())
      .find(Boolean)
    return firstLine ? firstLine.slice(0, 60) : ''
  }

  const handleSubmit = () => {
    if (blocked) return
    onUpload({ ...kbDraft, title: deriveTitle(), overwrite: false })
  }

  return (
    <div className="space-y-3 rounded-lg border border-line p-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-ink-2">上传规范文档</label>
        <span className={`text-xs ${over ? 'font-medium text-red-600' : 'text-mute'}`}>
          {kbDraft.content.length} / {MAX_CHARS}
        </span>
      </div>
      <textarea
        value={kbDraft.content}
        onChange={(e) => updateKbDraft({ content: e.target.value })}
        rows={5}
        disabled={pending}
        placeholder="粘贴 SQL 编码规范 / 建模规范 / 质量 SLA 文本，或点「.txt 上传」选择文件"
        className="w-full resize-y rounded-md border border-line px-3 py-2 text-sm text-ink placeholder:text-mute focus:border-accent focus:outline-none disabled:opacity-50 bg-surface"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FileUp className="h-4 w-4" />
          .txt 上传
        </button>
        <select
          value={kbDraft.category}
          onChange={(e) => updateKbDraft({ category: e.target.value as KbCategory })}
          disabled={pending}
          className="rounded-md border border-line px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none disabled:opacity-50 bg-surface"
        >
          {Object.entries(KB_CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          value={kbDraft.title}
          onChange={(e) => updateKbDraft({ title: e.target.value })}
          disabled={pending}
          placeholder="标题（可选，默认取文件名/首行）"
          className="min-w-[12rem] flex-1 rounded-md border border-line px-3 py-1.5 text-sm text-ink placeholder:text-mute focus:border-accent focus:outline-none disabled:opacity-50 bg-surface"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={blocked}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          上传入库
        </button>
      </div>
      {fileError && <p className="text-xs text-red-600">{fileError}</p>}
      {over && <p className="text-xs text-red-600">超过 {MAX_CHARS} 字符上限，已拦截上传</p>}
    </div>
  )
}
