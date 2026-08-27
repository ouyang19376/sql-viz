import type { Category } from '@/types'

interface Props {
  /** 分类列表（已按 order 排序） */
  categories: Category[]
  /** 分类 ID → 该分类函数数量 */
  counts: Record<string, number>
}

/** 分类导航（F-FC-01 配套）：锚点跳转到右侧对应分类区。
 *  - >=md：左侧固定宽度侧栏
 *  - <md：顶部横向滚动 chip 条 */
export default function CategorySidebar({ categories, counts }: Props) {
  return (
    <>
      <aside className="hidden w-48 shrink-0 md:block">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-mute">
          分类
        </h3>
        <nav className="space-y-1">
          {categories.map((cat) => (
            <a
              key={cat.id}
              href={`#category-${cat.id}`}
              className="block rounded-lg px-3 py-2 text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:dialect-text"
            >
              <span className="truncate">{cat.name}</span>
              <span className="ml-2 text-xs text-mute">
                {counts[cat.id] ?? 0}
              </span>
            </a>
          ))}
        </nav>
      </aside>

      {/* 移动端：横向滚动 chip 条 */}
      <nav className="md:hidden" aria-label="分类">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <a
              key={cat.id}
              href={`#category-${cat.id}`}
              className="shrink-0 whitespace-nowrap rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-2 transition-colors hover:bg-surface-2"
            >
              {cat.name}
              <span className="ml-1.5 text-mute">{counts[cat.id] ?? 0}</span>
            </a>
          ))}
        </div>
      </nav>
    </>
  )
}
