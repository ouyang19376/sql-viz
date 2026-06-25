import { useMemo, useState } from 'react'
import type { DependencyKind, LineageAnalysisResult, TableType } from '@/types/lineage'
import { toDependencyRows } from '@/lib/lineage/toDependencyRows'

interface Props {
  result: LineageAnalysisResult
}

type TableTypeFilter = 'all' | TableType
type DependencyKindFilter = 'all' | DependencyKind
type SortKey = 'targetTable' | 'sourceTable' | 'statementIndex'
type SortDirection = 'asc' | 'desc'

const tableTypeOptions: Array<{ value: TableTypeFilter; label: string }> = [
  { value: 'all', label: '全部表类型' },
  { value: 'entity', label: '实体表' },
  { value: 'temporary', label: '临时表 / CTE' },
  { value: 'unknown', label: '未知表' },
]

const dependencyKindOptions: Array<{ value: DependencyKindFilter; label: string }> = [
  { value: 'all', label: '全部依赖类型' },
  { value: 'read', label: 'read' },
  { value: 'write', label: 'write' },
  { value: 'cte', label: 'cte' },
  { value: 'join', label: 'join' },
  { value: 'union', label: 'union' },
  { value: 'subquery', label: 'subquery' },
  { value: 'unknown', label: 'unknown' },
]

const sortOptions: Array<{ value: SortKey; label: string }> = [
  { value: 'targetTable', label: '目标表' },
  { value: 'sourceTable', label: '源表' },
  { value: 'statementIndex', label: '语句序号' },
]

function compareNullableNumber(a?: number | null, b?: number | null): number {
  const left = a ?? Number.MAX_SAFE_INTEGER
  const right = b ?? Number.MAX_SAFE_INTEGER
  return left - right
}

/** F-TB-01 ~ F-TB-06：依赖清单表格、视图切换承载、横向滚动、sticky header、排序与过滤。 */
export default function DependencyTable({ result }: Props) {
  const [tableTypeFilter, setTableTypeFilter] = useState<TableTypeFilter>('all')
  const [dependencyKindFilter, setDependencyKindFilter] = useState<DependencyKindFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('targetTable')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const rows = useMemo(() => {
    const baseRows = toDependencyRows(result)
    return baseRows
      .filter((row) => tableTypeFilter === 'all' || row.targetType === tableTypeFilter || row.sourceType === tableTypeFilter)
      .filter((row) => dependencyKindFilter === 'all' || row.dependencyKind === dependencyKindFilter)
      .sort((a, b) => {
        const direction = sortDirection === 'asc' ? 1 : -1
        if (sortKey === 'statementIndex') {
          const statementCompare = compareNullableNumber(a.statementIndex, b.statementIndex)
          return (statementCompare || a.index - b.index) * direction
        }
        return (a[sortKey].localeCompare(b[sortKey], 'zh-CN') || a.index - b.index) * direction
      })
  }, [dependencyKindFilter, result, sortDirection, sortKey, tableTypeFilter])

  const allRows = useMemo(() => toDependencyRows(result), [result])

  if (allRows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">
        暂无明确依赖关系。
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950 sm:grid-cols-2 xl:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">
          表类型过滤
          <select
            value={tableTypeFilter}
            onChange={(event) => setTableTypeFilter(event.target.value as TableTypeFilter)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            {tableTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">
          依赖类型过滤
          <select
            value={dependencyKindFilter}
            onChange={(event) => setDependencyKindFilter(event.target.value as DependencyKindFilter)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            {dependencyKindOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">
          排序字段
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">
          排序方向
          <button
            type="button"
            onClick={() => setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            {sortDirection === 'asc' ? '升序 ↑' : '降序 ↓'}
          </button>
        </label>
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400">
        当前显示 {rows.length} / {allRows.length} 条依赖。
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">
          当前过滤条件下暂无依赖关系。
        </div>
      ) : (
        <div className="max-h-[520px] overflow-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 text-xs font-medium text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                {['序号', '目标表', '目标类型', '源表', '源类型', '依赖类型', '语句', '行号', '说明', '置信度'].map((header) => (
                  <th key={header} className="px-3 py-2">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((row) => (
                <tr key={row.index} className="text-gray-700 dark:text-gray-200">
                  <td className="px-3 py-2 text-gray-400">{row.index}</td>
                  <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{row.targetTable}</td>
                  <td className="px-3 py-2">{row.targetType}</td>
                  <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{row.sourceTable}</td>
                  <td className="px-3 py-2">{row.sourceType}</td>
                  <td className="px-3 py-2">{row.dependencyKind}</td>
                  <td className="px-3 py-2">{row.statementIndex ?? '--'}</td>
                  <td className="px-3 py-2">{row.lineRange}</td>
                  <td className="px-3 py-2">{row.description ?? '--'}</td>
                  <td className="px-3 py-2">{typeof row.confidence === 'number' ? row.confidence.toFixed(2) : '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
