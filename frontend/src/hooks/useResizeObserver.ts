import { useEffect, useRef, useState } from 'react'

interface Size {
  width: number
  height: number
}

/**
 * 监听容器尺寸变化（ResizeObserver），150ms debounce。
 * 返回当前逻辑尺寸；首帧拿到尺寸后才更新。
 */
export function useResizeObserver<T extends HTMLElement>(): {
  ref: React.RefObject<T | null>
  size: Size
} {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let frame: number | null = null
    const update = () => {
      frame = null
      const rect = el.getBoundingClientRect()
      setSize({ width: rect.width, height: rect.height })
    }
    const debounced = () => {
      if (frame != null) return
      frame = window.setTimeout(update, 150) as unknown as number
    }

    const ro = new ResizeObserver(debounced)
    ro.observe(el)
    // 首帧立即测量（不 debounce）
    update()

    return () => {
      ro.disconnect()
      if (frame != null) clearTimeout(frame)
    }
  }, [])

  return { ref, size }
}
