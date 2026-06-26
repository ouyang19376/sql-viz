import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}

/** F-PV-02：后端分页页码切换。total=0 时不渲染。 */
export default function Pagination({ page, pageSize, total, onChange }: Props) {
  if (total === 0) return null
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const canPrev = page > 1
  const canNext = page < totalPages

  const btn =
    'inline-flex h-8 items-center gap-1 rounded-md border border-gray-200 px-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'

  return (
    <div className="flex items-center justify-end gap-3 text-sm text-gray-600 dark:text-gray-300">
      <button type="button" className={btn} disabled={!canPrev} onClick={() => onChange(page - 1)}>
        <ChevronLeft className="h-4 w-4" />
        上一页
      </button>
      <span>
        第 {page} / {totalPages} 页
      </span>
      <button type="button" className={btn} disabled={!canNext} onClick={() => onChange(page + 1)}>
        下一页
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
