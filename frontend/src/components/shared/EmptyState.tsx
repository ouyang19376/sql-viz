import { Link } from 'react-router'

interface Props {
  title: string
  description?: string
  actionLabel?: string
  actionTo?: string
  onAction?: () => void
  /** 外层容器追加类（如 min-h 撑高与邻近输入框对齐）；默认空 */
  className?: string
}

/** 空状态 / 错误占位 */
export default function EmptyState({ title, description, actionLabel, actionTo, onAction, className }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-line py-16 text-center${className ? ' ' + className : ''}`}>
      <p className="text-lg font-medium text-ink-2">{title}</p>
      {description && <p className="mt-2 text-sm text-mute">{description}</p>}
      {actionLabel && actionTo && (
        <Link
          to={actionTo}
          className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
