import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { ThemedToken } from 'shiki'
import { getShikiHighlighter, SHIKI_LANG, SHIKI_THEME } from '@/lib/shiki'

interface Props {
  value: string
  onChange: (v: string) => void
  onRun?: () => void
  readOnly?: boolean
  placeholder?: string
  /** 内层容器最大高度 class（默认 max-h-96=384px；DDL 编辑等长文本场景传更大值） */
  maxHeightClass?: string
  /** 内层容器最小高度 class（默认 min-h-[8rem]=128px） */
  minHeightClass?: string
}

type LineTokens = ThemedToken[]

/** SQL 代码编辑器（F-QB-01）：textarea 叠加 Shiki 高亮层（plan §1.2 决策点 11，轻量）。
 * - 行号、Shiki 高亮（复用 lib/shiki 单例）；未就绪降级纯文本。
 * - Ctrl/Cmd+Enter 运行；Tab 插两空格；textarea 与高亮层滚动同步。
 * - 对齐：gutter 固定 w-12(3rem) + 代码 pl-3(0.75rem) = 3.75rem，textarea paddingLeft 同值。
 */
export default function CodeEditor({
  value,
  onChange,
  onRun,
  readOnly,
  placeholder,
  maxHeightClass = 'max-h-96',
  minHeightClass = 'min-h-[8rem]',
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const preRef = useRef<HTMLPreElement>(null)
  const [tokens, setTokens] = useState<LineTokens[] | null>(null)

  const lines = useMemo(() => value.split('\n'), [value])

  useEffect(() => {
    let cancelled = false
    getShikiHighlighter().then((hl) => {
      if (cancelled || !hl) return
      try {
        const result = hl.codeToTokens(value, { lang: SHIKI_LANG, theme: SHIKI_THEME })
        setTokens(result.tokens)
      } catch (err) {
        console.warn('[shiki] codeToTokens failed', err)
      }
    })
    return () => {
      cancelled = true
    }
  }, [value])

  const syncScroll = () => {
    const ta = taRef.current
    const pre = preRef.current
    if (ta && pre) {
      pre.scrollTop = ta.scrollTop
      pre.scrollLeft = ta.scrollLeft
    }
  }

  // 粘贴/输入导致 textarea 自动滚动后，高亮层(<pre>)仅靠 onScroll 同步会漏掉这类滚动，
  // 表现为光标落在某行而可见高亮停在另一行（光标与代码行错乱）。值变更后强制同步一次。
  useEffect(() => {
    syncScroll()
  }, [value])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (onRun && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      onRun()
      return
    }
    if (e.key === 'Tab' && !readOnly) {
      e.preventDefault()
      const ta = e.currentTarget
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const next = value.slice(0, start) + '  ' + value.slice(end)
      onChange(next)
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2
      })
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900 font-mono text-sm leading-relaxed">
      <div className={`relative ${maxHeightClass} ${minHeightClass} overflow-hidden`}>
        {/* 高亮层（背景，不接收事件） */}
        <pre
          ref={preRef}
          aria-hidden
          className="m-0 pointer-events-none absolute inset-0 overflow-hidden whitespace-pre p-0 text-gray-100"
        >
          <code>
            {lines.map((line, i) => {
              const lineTokens = tokens?.[i]
              return (
                <div key={i} className="flex leading-relaxed">
                  <span
                    className="w-12 shrink-0 select-none pr-3 text-right text-gray-600"
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 whitespace-pre px-3">
                    {lineTokens
                      ? lineTokens.map((tok, j) => (
                          <span key={j} style={{ color: tok.color }}>
                            {tok.content}
                          </span>
                        ))
                      : line || ' '}
                  </span>
                </div>
              )
            })}
          </code>
        </pre>
        {/* 编辑层（透明文字 + 可见光标，前层） */}
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          spellCheck={false}
          placeholder={placeholder}
          className="absolute inset-0 m-0 resize-none overflow-auto whitespace-pre border-0 bg-transparent pt-0 pr-3 pb-0 pl-[3.75rem] font-mono text-sm leading-relaxed text-transparent caret-white outline-none"
        />
      </div>
    </div>
  )
}
