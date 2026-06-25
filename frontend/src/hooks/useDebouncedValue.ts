import { useEffect, useState } from 'react'

/** 通用 debounce：value 变化后等待 delay ms 才回写到返回值。
 *
 * 用于搜索输入：避免每次按键都触发查询。
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])

  return debounced
}
