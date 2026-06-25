import type { CSSProperties } from 'react'

interface Props {
  name: string
  color: string
  size?: 'sm' | 'md'
}

/** 方言色标：用传入 color 渲染（供卡片等需要"自身色"的场景，非全局变量） */
export default function DialectBadge({ name, color, size = 'sm' }: Props) {
  const style = {
    '--badge-color': color,
  } as CSSProperties
  const sizing =
    size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
  return (
    <span
      style={style}
      className={`inline-block rounded-full border border-[var(--badge-color)] font-medium ${sizing}`}
    >
      <span style={{ color }}>{name}</span>
    </span>
  )
}
