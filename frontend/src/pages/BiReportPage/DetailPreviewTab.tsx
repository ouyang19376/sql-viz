import { useEffect, useMemo, useState } from 'react'
import { useBiStore } from '@/stores/useBiStore'
import { usePreview } from '@/api/bi'
import type { FilterClause, SortClause } from '@/types/bi'
import EmptyState from '@/components/shared/EmptyState'
import DataTable from '@/components/bi/DataTable'
import FilterBar from './FilterBar'
import Pagination from './Pagination'

const PAGE_SIZE = 50

/** Tab1 明细预览（F-PV-01/02/03）：共 N 行 + 筛选条 + 表格 + 分页。
 *  筛选 / 分页 / 排序为本 Tab 局部态；切数据集时重置。筛选与排序作用于后端查询。 */
export default function DetailPreviewTab() {
  const activeDataset = useBiStore((s) => s.activeDataset)
  const datasetId = activeDataset?.id ?? null

  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<FilterClause[]>([])
  const [sort, setSort] = useState<SortClause | null>(null)

  // 切换数据集时重置筛选 / 分页 / 排序
  useEffect(() => {
    setPage(1)
    setFilters([])
    setSort(null)
  }, [datasetId])

  const req = useMemo(
    () => ({ page, pageSize: PAGE_SIZE, filters, sort }),
    [page, filters, sort],
  )
  const { data, isLoading, isError, refetch } = usePreview(datasetId, req)

  if (!activeDataset) {
    return (
      <EmptyState title="请先在左侧选择数据集" description="选择数据集后可在此预览明细数据" />
    )
  }

  const addFilter = (f: FilterClause) => {
    setFilters((prev) => [...prev, f])
    setPage(1)
  }
  const removeFilter = (index: number) => {
    setFilters((prev) => prev.filter((_, i) => i !== index))
    setPage(1)
  }
  const handleSort = (s: SortClause | null) => {
    setSort(s)
    setPage(1)
  }

  const total = data?.total ?? 0
  // 首屏未拿到响应时，用数据集元信息的列名占位表头
  const columns = data?.columns ?? activeDataset.columns.map((c) => c.name)

  return (
    <div className="space-y-4">
      {/* F-PV-01：左上角「共 N 行」 */}
      <div className="text-sm text-gray-600 dark:text-gray-300">
        共 <span className="font-semibold text-gray-900 dark:text-gray-100">{total}</span> 行
      </div>

      <FilterBar
        columns={activeDataset.columns}
        filters={filters}
        onAdd={addFilter}
        onRemove={removeFilter}
      />

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
  )
}
