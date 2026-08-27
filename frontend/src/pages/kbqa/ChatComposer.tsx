import { useRef, useState } from 'react'
import { ArrowUp, Square } from 'lucide-react'

interface Props {
  onSend: (question: string) => void
  onStop: () => void
  streaming: boolean
}

/** 底部输入框：Enter 发送 / Shift+Enter 换行 / 流式中可停止。 */
export default function ChatComposer({ onSend, onStop, streaming }: Props) {
  const [value, setValue] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  const send = () => {
    const q = value.trim()
    if (!q || streaming) return
    onSend(q)
    setValue('')
    // 重置自动高度
    if (taRef.current) taRef.current.style.height = 'auto'
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  };

  // 自动增高（上限后出滚动条）
  const autoGrow = () => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }

  return (
    <div className="border-t border-line bg-paper px-1 py-3 sm:px-4">
      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-line bg-surface p-2 shadow-sm transition-colors focus-within:border-accent">
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            autoGrow()
          }}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="提问知识库中的内容，如「保险基础数据模型包含哪些主题域？」"
          aria-label="问题输入框"
          className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-ink outline-none placeholder:text-mute"
        />
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="停止生成"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2 transition-colors hover:text-accent"
          >
            <Square className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={send}
            disabled={!value.trim()}
            aria-label="发送"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition-colors hover:bg-accent-strong disabled:opacity-40"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </div>
      <p className="mx-auto mt-2 max-w-3xl px-2 text-center text-[11px] text-mute/70">
        回答由 AI 基于知识库检索内容生成，请以标准原文为准
      </p>
    </div>
  )
}
