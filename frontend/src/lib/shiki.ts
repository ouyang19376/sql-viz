import type { HighlighterCore } from 'shiki/core'
import { createHighlighterCore } from 'shiki/core'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'

/**
 * Shiki 单例 highlighter（懒加载，模块级共享 Promise）。
 * - 用 shiki/core + 显式 lang/theme 导入：仅 sql + github-dark + wasm 入包，
 *   避免默认入口将 200+ 语言注册表全部 code-split 到 dist。
 * - 加载失败返回 null，CodeBlock 自动降级为纯文本（tech-plan §7 难点 2）
 */

export const SHIKI_THEME = 'github-dark'
export const SHIKI_LANG = 'sql'

let highlighterPromise: Promise<HighlighterCore | null> | null = null

export function getShikiHighlighter(): Promise<HighlighterCore | null> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [import('@shikijs/themes/github-dark')],
      langs: [import('@shikijs/langs/sql')],
      engine: createOnigurumaEngine(import('shiki/wasm')),
    }).catch((err) => {
      console.warn('[shiki] highlighter load failed, falling back to plain text', err)
      return null
    })
  }
  return highlighterPromise
}
