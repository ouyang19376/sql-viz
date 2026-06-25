import { Link } from 'react-router'
import { Heart } from 'lucide-react'
import { toast } from 'sonner'
import type { FunctionSummary } from '@/types'
import { useFavoriteStore } from '@/stores/useFavoriteStore'

interface Props {
  /** 函数摘要（列表项轻量字段，不含 animation/params） */
  fn: FunctionSummary
  /** 所属方言 ID，用于拼跳转路径与收藏键 */
  dialectId: string
}

/** 单个函数列表项（F-FC-03 签名预览 + F-FC-04 收藏）：
 * 函数名 + 签名 + 一句话描述，整体可点击进入详情，右侧收藏按钮。 */
export default function FunctionItem({ fn, dialectId }: Props) {
  const isFavorite = useFavoriteStore((s) => s.isFavorite(fn.id, dialectId))
  const toggle = useFavoriteStore((s) => s.toggle)
  const fav = isFavorite

  const handleToggle = (e: React.MouseEvent) => {
    // 阻止冒泡到外层 Link，避免点击收藏时跳转
    e.preventDefault()
    e.stopPropagation()
    toggle(fn.id, dialectId)
    toast.success(fav ? '已取消收藏' : '已收藏', { duration: 1500 })
  }

  return (
    <div className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-[var(--dialect-color)] hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800">
      <Link
        to={`/dialect/${dialectId}/function/${fn.id}`}
        className="min-w-0 flex-1"
      >
        <div className="flex items-baseline gap-2">
          <h3 className="shrink-0 font-mono font-semibold text-gray-900 group-hover:dialect-text dark:text-gray-100">
            {fn.name}
          </h3>
          {fn.return_type && (
            <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              {fn.return_type}
            </span>
          )}
        </div>
        {/* 签名：等宽，超长省略并 tooltip 全文（F-FC-03） */}
        <p
          className="mt-1 truncate font-mono text-sm text-gray-600 dark:text-gray-300"
          title={fn.signature}
        >
          {fn.signature}
        </p>
        <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
          {fn.description}
        </p>
      </Link>

      <button
        type="button"
        onClick={handleToggle}
        aria-label={fav ? '取消收藏' : '收藏'}
        aria-pressed={fav}
        className={`shrink-0 rounded-lg p-2 transition-colors hover:bg-gray-100 ${
          fav ? 'dialect-text' : 'text-gray-300 hover:text-gray-400'
        }`}
      >
        <Heart className="h-5 w-5" fill={fav ? 'currentColor' : 'none'} />
      </button>
    </div>
  )
}
