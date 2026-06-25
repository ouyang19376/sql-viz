import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import type { LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  title: string
  description: string
  to: string
  accent: string
}

/** 功能入口大卡片（F-HM-01 / F-HM-02 / F-HM-03）：
 *  - 白底 + 圆角 16px + 浅阴影
 *  - hover：阴影抬升 + 主色描边
 *  - 整卡可点击跳转 */
export default function FeatureCard({ icon: Icon, title, description, to, accent }: Props) {
  const style = { '--accent': accent } as CSSProperties

  return (
    <Link
      to={to}
      style={style}
      className="group block rounded-2xl border-2 border-transparent bg-white p-8 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-lg"
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-xl"
        style={{ backgroundColor: `color-mix(in srgb, ${accent} 12%, white)` }}
      >
        <Icon className="h-7 w-7" style={{ color: accent }} />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-gray-900">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-gray-500">{description}</p>
    </Link>
  )
}
