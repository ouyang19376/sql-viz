import { Link } from 'react-router'

interface Props {
  title: string
  description?: string
  actionLabel?: string
  actionTo?: string
  onAction?: () => void
}

/** 空状态 / 错误占位 */
export default function EmptyState({ title, description, actionLabel, actionTo, onAction }: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center dark:border-gray-700">
      <p className="text-lg font-medium text-gray-700 dark:text-gray-200">{title}</p>
      {description && <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
      {actionLabel && actionTo && (
        <Link
          to={actionTo}
          className="mt-4 rounded-lg dialect-bg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 rounded-lg dialect-bg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
