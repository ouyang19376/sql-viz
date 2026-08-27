import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  title: string
  description: string
  to: string
  accent: string
  /** 布局类（F-HM-03：flex 宽度，使第二行居中） */
  className?: string
}

/** 功能入口卡片（扁平化）：
 *  - surface 底 + 1px line 描边 + 无阴影（扁平）
 *  - 图标块用模块 identity 色（身份层）
 *  - hover：琥珀描边（交互层）+ 轻位移
 *  - 标题 font-display，右下「进入」指示 */
export default function FeatureCard({ icon: Icon, title, description, to, accent, className }: Props) {
  const style = { '--accent': accent } as CSSProperties

  return (
    <Link
      to={to}
      style={style}
      className={`group relative flex h-full flex-col rounded-xl border border-line bg-surface p-7 transition-all hover:-translate-y-0.5 hover:border-accent ${className ?? ''}`}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-lg"
        style={{ backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)` }}
      >
        <Icon className="h-6 w-6" style={{ color: accent }} />
      </div>
      <h3 className="mt-5 font-display text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-2">{description}</p>
      <div className="mt-5 flex items-center gap-1.5 text-sm font-medium text-mute transition-colors group-hover:text-accent">
        进入
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  )
}
