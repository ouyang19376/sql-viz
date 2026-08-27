import { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AlertCircle, Check, Copy, FileText, Table2 } from 'lucide-react'
import type { KbqaMessage } from '@/stores/useKbqaStore'

interface Props {
  message: KbqaMessage
  streaming: boolean // 该消息是否正处于流式生成中
}

/** 来源引用折叠区：title + 相似度 + 分片摘要 */
function SourceList({ sources }: { sources: NonNullable<KbqaMessage['sources']> }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2 border-t border-line pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-medium text-mute transition-colors hover:text-accent"
      >
        引用来源（{sources.length.toString().padStart(2, '0')}）{open ? '收起' : '展开'}
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {sources.map((s, i) => {
            const Icon = s.type === 'table' ? Table2 : FileText
            return (
              <li
                key={`${s.title}-${i}`}
                className="rounded-md bg-surface-2 px-2.5 py-1.5 text-xs text-ink-2"
              >
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-mute" />
                  <span className="font-medium text-ink">{s.title}</span>
                  <span className="ml-auto shrink-0 text-mute">
                    {s.score.toFixed(3)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-3 leading-relaxed text-mute">
                  {s.chunkText}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** 单条消息气泡：用户右侧琥珀气泡；助手左侧卡片，Markdown 渲染 + 来源引用。 */
export default function MessageBubble({ message, streaming }: Props) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard?.writeText(message.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm leading-relaxed text-white">
          {message.content}
        </div>
      </div>
    )
  }

  const done = !streaming && !!message.content
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3 text-sm text-ink">
        {message.content ? (
          <div className="kbqa-md leading-relaxed">
            <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
            {streaming && <span className="kbqa-cursor" aria-hidden />}
          </div>
        ) : streaming ? (
          <div className="flex items-center gap-1.5 py-1 text-mute">
            <span className="kbqa-dot" />
            <span className="kbqa-dot [animation-delay:150ms]" />
            <span className="kbqa-dot [animation-delay:300ms]" />
            <span className="ml-1 text-xs">检索知识库中…</span>
          </div>
        ) : null}

        {message.error && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-500/10 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">{message.error}</span>
          </div>
        )}

        {message.degraded && !message.error && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            {message.degradeReason ?? '未检索到相关知识，回答基于通用能力生成'}
          </p>
        )}

        {!!message.sources?.length && <SourceList sources={message.sources} />}

        {done && (
          <button
            type="button"
            onClick={copy}
            className="mt-2 inline-flex items-center gap-1 text-xs text-mute transition-colors hover:text-accent"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? '已复制' : '复制'}
          </button>
        )}
      </div>
    </div>
  )
}
