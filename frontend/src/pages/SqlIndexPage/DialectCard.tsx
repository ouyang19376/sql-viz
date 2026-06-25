import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import type { DialectSummary } from '@/types'
import { getDialectIcon } from '@/components/shared/dialectIcon'

interface Props {
  dialect: DialectSummary
}

/** 单张方言卡片（F-DS-01）：用局部 --card-color 显示该方言自身主题色 */
export default function DialectCard({ dialect }: Props) {
  const Icon = getDialectIcon(dialect.icon)
  // 局部 CSS 变量：每张卡片显示自己的主题色，不受全局 --dialect-color 影响
  const style = { '--card-color': dialect.color } as CSSProperties

  return (
    <Link
      to={`/dialect/${dialect.id}`}
      style={style}
      className="group block rounded-xl border-2 border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-[var(--card-color)] hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg"
        style={{ backgroundColor: `color-mix(in srgb, ${dialect.color} 15%, white)` }}
      >
        <Icon className="h-5 w-5" style={{ color: dialect.color }} />
      </div>
      <h2 className="mt-3 text-lg font-semibold" style={{ color: dialect.color }}>
        {dialect.name}
      </h2>
      <p className="mt-1 text-sm text-gray-500 line-clamp-2 dark:text-gray-400">{dialect.description}</p>
      <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
        {dialect.function_count} 个函数
        {dialect.version && <span className="ml-2">· v{dialect.version}</span>}
      </p>
    </Link>
  )
}
