import { useEffect, useMemo, useState } from 'react'
import type { ThemedToken } from 'shiki'
import { getShikiHighlighter, SHIKI_LANG, SHIKI_THEME } from '@/lib/shiki'

interface Props {
  code: string
  /** 1-based 高亮行号（动画联动） */
  highlightLines?: number[]
  /** 1-based 可点击行号（仅这些行显示 pointer 并触发 onLineClick） */
  clickableLines?: number[]
  onLineClick?: (line: number) => void
}

type LineTokens = ThemedToken[]

/**
 * SQL 代码块（SC 模块 F-SC-01 ~ F-SC-04）：
 * - F-SC-01：Shiki 异步语法高亮（github-dark + sql）；未就绪/失败时降级纯文本
 * - F-SC-02：highlightLines 命中行加方言色边框 + 浅底
 * - F-SC-03：左侧行号
 * - F-SC-04：clickableLines 命中行 pointer + onLineClick 回调（其他行 no-op）
 */
export default function CodeBlock({
  code,
  highlightLines,
  clickableLines,
  onLineClick,
}: Props) {
  const lines = useMemo(() => code.split('\n'), [code])
  const hiSet = useMemo(() => new Set(highlightLines ?? []), [highlightLines])
  const clickSet = useMemo(() => new Set(clickableLines ?? []), [clickableLines])

  // Shiki tokenization：按 code 字符串维度缓存（高亮行变化不重新分词）
  const [tokens, setTokens] = useState<LineTokens[] | null>(null)
  useEffect(() => {
    let cancelled = false
    getShikiHighlighter().then((hl) => {
      if (cancelled || !hl) return
      try {
        const result = hl.codeToTokens(code, {
          lang: SHIKI_LANG,
          theme: SHIKI_THEME,
        })
        setTokens(result.tokens)
      } catch (err) {
        console.warn('[shiki] codeToTokens failed', err)
      }
    })
    return () => {
      cancelled = true
    }
  }, [code])

  return (
    <div className="overflow-x-auto rounded-lg bg-gray-900 font-mono text-sm leading-relaxed">
      <pre className="min-w-full">
        <code>
          {lines.map((line, i) => {
            const lineNo = i + 1
            const highlighted = hiSet.has(lineNo)
            const clickable = clickSet.has(lineNo) && !!onLineClick
            const lineTokens = tokens?.[i]
            return (
              <div
                key={i}
                onClick={clickable ? () => onLineClick!(lineNo) : undefined}
                className={`flex px-0 ${
                  highlighted
                    ? 'dialect-bg-soft border-l-2 border-l-[var(--dialect-color)]'
                    : 'border-l-2 border-l-transparent'
                } ${clickable ? 'cursor-pointer hover:bg-white/5' : 'cursor-default'}`}
              >
                <span
                  className="select-none px-3 text-right text-gray-500"
                  style={{ minWidth: '2.5rem' }}
                >
                  {lineNo}
                </span>
                <span className="flex-1 whitespace-pre px-3 text-gray-100">
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
    </div>
  )
}
