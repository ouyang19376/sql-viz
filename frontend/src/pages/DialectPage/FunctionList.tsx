import type { Category, FunctionSummary } from '@/types'
import FunctionItem from './FunctionItem'

interface Props {
  /** 分类列表（已按 order 排序，F-FC-02） */
  categories: Category[]
  /** 函数列表（扁平，按 category_id 归组） */
  functions: FunctionSummary[]
  dialectId: string
}

/** 函数分类列表（F-FC-01）：按 category 分组渲染。
 * F-FC-02：分类按 order 排序（后端已排，此处再保底），同分类内按函数名排序。 */
export default function FunctionList({ categories, functions, dialectId }: Props) {
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order)

  return (
    <div className="space-y-10">
      {sortedCategories.map((cat) => {
        const items = functions
          .filter((f) => f.category_id === cat.id)
          .sort((a, b) => a.name.localeCompare(b.name))

        if (items.length === 0) return null

        return (
          <section key={cat.id} id={`category-${cat.id}`} className="scroll-mt-20">
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{cat.name}</h2>
              <span className="text-sm text-gray-400">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((fn) => (
                <FunctionItem key={fn.id} fn={fn} dialectId={dialectId} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
