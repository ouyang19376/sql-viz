import type { ReactNode } from 'react'

interface Props {
  /** 标题：可内嵌 <Highlight> 标记荧光关键词 */
  title: ReactNode
  subtitle?: string
  /** 可选小标签（eyebrow 胶囊），如模块徽标 */
  eyebrow?: ReactNode
  /** 可选右侧操作区（如移动端数据源按钮） */
  actions?: ReactNode
  className?: string
}

/** 统一页头：替代各页面重复的 <h1 text-2xl font-bold>+<p text-sm> 模式。
 *  - title：font-display，text-2xl，支持内嵌荧光关键词
 *  - eyebrow：琥珀软底小胶囊
 *  - subtitle：次级文字 */
export default function PageHeader({ title, subtitle, eyebrow, actions, className }: Props) {
  return (
    <div className={`mb-6 flex items-start justify-between gap-4 ${className ?? ''}`}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-2">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  )
}
