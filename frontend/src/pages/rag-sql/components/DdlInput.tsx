import { Eraser, Loader2, Wand2 } from 'lucide-react'
import CodeEditor from '@/pages/dataprofile/components/CodeEditor'

/** DDL 输入长度上限（F-CK-10，与后端 ChunkRequest.ddl max_length 对齐） */
const MAX_CHARS = 20000

interface Props {
  value: string
  onChange: (v: string) => void
  onGenerate: () => void
  pending: boolean
}

/** DDL 输入编辑器（F-CK-01 / F-CK-10）：
 *  - 复用 dataprofile CodeEditor（SQL 高亮 + Ctrl+Enter 生成，§7.4）
 *  - 字符计数 + 超上限拦截（红字 + 禁用生成）
 *  - 生成 / 清空按钮（合并 ChunkToolbar，减少文件） */
export default function DdlInput({ value, onChange, onGenerate, pending }: Props) {
  const over = value.length > MAX_CHARS
  const empty = value.trim().length === 0
  const blocked = pending || over || empty

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">DDL 建表语句</label>
        <span className={`text-xs ${over ? 'font-medium text-red-600' : 'text-gray-400'}`}>
          {value.length} / {MAX_CHARS}
        </span>
      </div>
      <CodeEditor
        value={value}
        onChange={onChange}
        onRun={onGenerate}
        readOnly={pending}
        placeholder="粘贴 CREATE TABLE ...（支持多表，自动嗅探 MySQL / Hive / PG 方言）"
        maxHeightClass="max-h-[40rem]"
        minHeightClass="min-h-[24rem]"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onGenerate}
          disabled={blocked}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          生成文本块
        </button>
        <button
          type="button"
          onClick={() => onChange('')}
          disabled={pending || empty}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <Eraser className="h-4 w-4" />
          清空
        </button>
        {over && (
          <span className="text-xs text-red-600">超过 {MAX_CHARS} 字符上限，已拦截生成</span>
        )}
      </div>
    </div>
  )
}
