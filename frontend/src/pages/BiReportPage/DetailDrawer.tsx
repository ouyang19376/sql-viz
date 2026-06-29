import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { usePreview } from '@/api/bi'
import type { FilterClause, SortClause } from '@/types/bi'
import DataTable from '@/components/bi/DataTable'
import Pagination from './Pagination'

interface Props {
  open: boolean
  onClose: () => void
  datasetId: string
  /** 当前选择 / 下钻路径派生的筛选，决定抽屉展示的明细行。 */
  filters: FilterClause[]
}

const PAGE_SIZE = 50

/** F-VZ-05：卡片↔明细联动跳转。展示当前下钻选择下的原始明细行。
 *  复用 usePreview（带当前 filters + sort）+ DataTable + Pagination。 */
export default function DetailDrawer({ open, onClose, datasetId, filters }: Props) {
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortClause | null>(null)
  const filtersKey = JSON.stringify(filters)

  // 打开 / 筛选变化时回到第一页并清空排序
  useEffect(() => {
    setPage(1)
    setSort(null)
  }, [open, filtersKey])

  const handleSort = (s: SortClause | null) => {
    setSort(s)
    setPage(1)
  }

  const { data, isLoading, isError, refetch } = usePreview(open ? datasetId : null, {
    page,
    pageSize: PAGE_SIZE,
    filters,
    sort,
  })

  if (!open) return null

  const total = data?.total ?? 0
  const columns = data?.columns ?? []

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-800">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">查看明细</h3>
            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
              {filters.length === 0
                ? '全部数据'
                : filters.map((f) => `${f.field}=${String(f.value)}`).join(' · ')}
              <span className="ml-2">共 {total} 行</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-auto p-5">
          {isError ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400 dark:border-gray-700">
              明细加载失败
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-2 block w-full text-xs text-indigo-600 hover:underline"
              >
                重试
              </button>
            </div>
          ) : (
            <>
              <DataTable
                columns={columns}
                rows={data?.rows ?? []}
                loading={isLoading}
                sort={sort}
                onSortChange={handleSort}
              />
              <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
