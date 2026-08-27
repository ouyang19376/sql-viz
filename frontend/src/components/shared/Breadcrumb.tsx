import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'

export interface BreadcrumbItem {
  label: string
  /** 提供 to 时渲染为 Link；末项即便有 to 也始终渲染为纯文本（当前页面不可点） */
  to?: string
}

interface Props {
  items: BreadcrumbItem[]
  /** 末项是否使用方言主题色（函数详情页用；列表页通常不需要） */
  highlightLast?: boolean
  className?: string
}

/** 面包屑导航（F-CM-04）：方言名 > 函数名，支持点击回溯。
 *  最后一项始终为纯文本；前面的项若提供 to 则为 Link。 */
export default function Breadcrumb({
  items,
  highlightLast = false,
  className = '',
}: Props) {
  if (items.length === 0) return null
  return (
    <nav
      aria-label="breadcrumb"
      className={`mb-4 flex flex-wrap items-center gap-1.5 text-sm text-mute ${className}`}
    >
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1
        return (
          <span key={`${idx}-${item.label}`} className="flex items-center gap-1.5">
            {idx > 0 && (
              <ChevronRight
                aria-hidden
                className="h-3.5 w-3.5 text-mute/70"
              />
            )}
            {!isLast && item.to ? (
              <Link
                to={item.to}
                className="hover:text-ink hover:underline"
              >
                {item.label}
              </Link>
            ) : (
              <span
                aria-current={isLast ? 'page' : undefined}
                className={
                  isLast && highlightLast
                    ? 'dialect-text font-medium'
                    : 'font-medium text-ink-2'
                }
              >
                {item.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
