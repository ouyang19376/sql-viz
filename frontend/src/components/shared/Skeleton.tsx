interface Props {
  lines?: number
  className?: string
}

/** 骨架屏：列表/卡片加载占位 */
export default function Skeleton({ lines = 3, className = '' }: Props) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-24 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800"
        />
      ))}
    </div>
  )
}
