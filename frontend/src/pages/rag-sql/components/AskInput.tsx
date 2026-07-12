import { Sparkles } from 'lucide-react'
import { Loader2 } from 'lucide-react'

/** 问句最大字符数（与后端 RAG_ASK_MAX_CHARS=2000 对齐，F-AS-03 长度护栏） */
const MAX_CHARS = 2000

interface Props {
  value: string
  onChange: (v: string) => void
  onGenerate: () => void
  pending: boolean
}

/** 自然语言输入（F-AS-03）：问题框 + 生成按钮 + 字符计数 + Ctrl+Enter 生成（§7.4）。 */
export default function AskInput({ value, onChange, onGenerate, pending }: Props) {
  const over = value.length > MAX_CHARS
  const empty = value.trim().length === 0
  const blocked = pending || over || empty

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      if (!blocked) onGenerate()
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">自然语言提问</label>
        <span className={`text-xs ${over ? 'font-medium text-red-600' : 'text-gray-400'}`}>
          {value.length} / {MAX_CHARS}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        rows={3}
        disabled={pending}
        placeholder="例如：查询最近 7 天各省份的订单金额，按日期升序（Ctrl+Enter 生成）"
        className="w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-emerald-500 focus:outline-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">检索知识库 → rerank → LLM 生成 → sqlglot 校验（不执行）</p>
        <button
          type="button"
          onClick={onGenerate}
          disabled={blocked}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          生成 SQL
        </button>
      </div>
      {over && <p className="text-xs text-red-600">超过 {MAX_CHARS} 字符上限，已拦截生成</p>}
    </div>
  )
}
