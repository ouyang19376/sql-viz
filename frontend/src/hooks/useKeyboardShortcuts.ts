import { useEffect } from 'react'

/** 快捷键 → 处理函数 的映射。
 *
 * 支持的 key：
 *   - 'mod+k' / 'mod+K'：Ctrl+K（Win/Linux）或 Cmd+K（Mac）
 *   - 'esc'：Escape 键
 *   - 'space' / 'left' / 'right' / 'up' / 'down'：常用别名
 *   - 单字母键：'k' / 'r'（大小写不敏感）
 */
export type ShortcutHandlers = Record<string, (e: KeyboardEvent) => void>

/** 别名 → 实际 e.key（小写比较） */
const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  space: ' ',
  left: 'arrowleft',
  right: 'arrowright',
  up: 'arrowup',
  down: 'arrowdown',
}

function normalize(key: string): string {
  const k = key.toLowerCase()
  return KEY_ALIASES[k] ?? k
}

function matchShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const key = shortcut.toLowerCase()

  if (key.startsWith('mod+')) {
    const k = normalize(key.slice(4))
    const modPressed = e.metaKey || e.ctrlKey
    return modPressed && e.key.toLowerCase() === k
  }

  // 非组合键：mod 键按下时不触发（避免 Ctrl+R 误触发"重置"等）
  if (e.metaKey || e.ctrlKey || e.altKey) return false
  return e.key.toLowerCase() === normalize(key)
}

/** 若事件源自可编辑元素（input/textarea/contenteditable），则视为用户输入，跳过快捷键。 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

/** 全局键盘快捷键绑定（F-SH-03 / 动画 §7.4 等场景）。
 *
 * - 在挂载时把回调绑到 window keydown，卸载时解绑。
 * - 命中快捷键时自动 preventDefault，避免浏览器默认行为（如 Ctrl+K 聚焦地址栏）。
 * - 处于 input/textarea/contenteditable 时跳过（Esc 例外，仍允许关闭弹层）。
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const editable = isEditableTarget(e.target)
      for (const [shortcut, handler] of Object.entries(handlers)) {
        if (!matchShortcut(e, shortcut)) continue
        // Esc 在输入态仍允许触发（用于关闭弹层），其他快捷键在输入态跳过
        if (editable && shortcut.toLowerCase() !== 'esc') continue
        e.preventDefault()
        handler(e)
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handlers])
}
