import { useEffect, useRef } from 'react'

const STORAGE_PREFIX = 'sqlviz_scroll:'

/** 列表页滚动位置恢复（PRD §7.1：函数详情 → 返回时保持上次滚动位置）。
 *
 * - 挂载时若 sessionStorage 中存有该 key 对应的 scrollY，则在下一帧恢复。
 * - 提供 saveScroll() 在跳转前显式持久化（推荐在跳转链接 onClick 触发）。
 * - 兜底：组件卸载（含浏览器后退导致的重渲）时自动保存当前 scrollY。
 *
 * 不使用全局 window 'beforeunload'：仅在本会话页面跳转间保留。
 */
export function useScrollRestore(key: string): { saveScroll: () => void } {
  const storageKey = `${STORAGE_PREFIX}${key}`
  // 用 ref 兜底卸载时取最新值，避免闭包陈旧
  const keyRef = useRef(storageKey)
  keyRef.current = storageKey

  useEffect(() => {
    const raw = sessionStorage.getItem(storageKey)
    if (raw !== null) {
      const y = Number(raw)
      if (Number.isFinite(y)) {
        // 等内容渲染完再恢复（首屏数据通常在下一帧到位；这里给两帧更稳）
        requestAnimationFrame(() => {
          requestAnimationFrame(() => window.scrollTo(0, y))
        })
      }
    }
    return () => {
      sessionStorage.setItem(keyRef.current, String(window.scrollY))
    }
  }, [storageKey])

  const saveScroll = () => {
    sessionStorage.setItem(keyRef.current, String(window.scrollY))
  }
  return { saveScroll }
}
