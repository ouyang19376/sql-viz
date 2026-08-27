import { useEffect, useRef } from 'react'
import { BookOpen } from 'lucide-react'
import { useRagSqlStatsQuery } from '@/api/rag-sql'
import type { KbqaMessage } from '@/stores/useKbqaStore'
import MessageBubble from './MessageBubble'

/** 欢迎屏推荐问题（围绕种子标准《保险基础数据模型》预设） */
const SUGGESTED = [
  '《保险基础数据模型》行业标准的数据分层结构是怎样的？',
  '保险基础数据模型包含哪些主题域？分别管理什么数据？',
  '保单主题域的核心实体与关键数据项有哪些？',
  '客户主题域如何对自然人、团体客户建模？',
]

interface Props {
  turns: KbqaMessage[]
  streaming: boolean
  onAsk: (question: string) => void
}

/** 聊天消息流：自动滚动到底；空会话展示欢迎屏（知识库规模 + 推荐问题）。 */
export default function ChatWindow({ turns, streaming, onAsk }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const stats = useRagSqlStatsQuery().data

  // 新消息 / 流式增量时跟随滚动到底（用户手动上滚时 approx 保持底部即可，MVP 不做打断检测）
  const lastLen = turns.length ? turns[turns.length - 1].content.length : 0
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns.length, lastLen])

  if (turns.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <BookOpen className="h-6 w-6" />
        </span>
        <h2 className="mt-4 font-display text-xl font-semibold text-ink">知识库问答</h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-mute">
          提问即可检索知识库中的规范文档与表元数据，回答附带引用来源。
          {stats && (
            <>
              {' '}
              当前知识库：文档 <b className="text-ink-2">{stats.docCount}</b> 篇 · 表{' '}
              <b className="text-ink-2">{stats.tableCount}</b> 张 · 分片{' '}
              <b className="text-ink-2">{stats.chunkCount}</b> 条。
            </>
          )}
        </p>
        <div className="mt-6 grid w-full max-w-lg gap-2 sm:grid-cols-2">
          {SUGGESTED.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onAsk(q)}
              className="rounded-xl border border-line bg-surface px-3.5 py-3 text-left text-sm text-ink-2 transition-colors hover:border-accent hover:text-accent"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-1 py-4 sm:px-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {turns.map((m, i) => (
          <MessageBubble
            key={m.ts + i}
            message={m}
            streaming={streaming && i === turns.length - 1 && m.role === 'assistant'}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
