import { ArrowDown, ArrowUp } from 'lucide-react'
import type { CellValue, SortClause } from '@/types/bi'
import Skeleton from '@/components/shared/Skeleton'

interface Props {
  columns: string[]
  rows: CellValue[][]
  loading?: boolean
  emptyText?: string
  /** 当前排序（可选）。传入即启用表头点击排序，三态循环 无→升→降→无。 */
  sort?: SortClause | null
  onSortChange?: (sort: SortClause | null) => void
}

function renderCell(v: CellValue) {
  if (v === null || v === undefined)
    return <span className="text-gray-300 dark:text-gray-600">—</span>
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return String(v)
}

/** 通用明细表格（PRD §4.3）：表头 sticky，横向滚动；明细预览与明细抽屉复用。
 *  F-PV-01：展示原始数据，表头吸顶。传 onSortChange 启用表头排序。 */
export default function DataTable({
  columns,
  rows,
  loading,
  emptyText = '无匹配数据',
  sort,
  onSortChange,
}: Props) {
  const colSpan = Math.max(columns.length, 1)
  const sortable = !!onSortChange

  const onHeaderClick = (col: string) => {
    if (!onSortChange) return
    if (!sort || sort.field !== col) onSortChange({ field: col, order: 'asc' })
    else if (sort.order === 'asc') onSortChange({ field: col, order: 'desc' })
    else onSortChange(null)
  }

  return (
    <div className="max-h-[520px] overflow-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-gray-50 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <tr>
            {columns.map((c, i) => {
              const active = sort?.field === c
              return (
                <th
                  key={i}
                  className="border-b border-gray-200 p-2 text-left whitespace-nowrap dark:border-gray-700"
                >
                  <button
                    type="button"
                    disabled={!sortable}
                    onClick={() => onHeaderClick(c)}
                    className={
                      'inline-flex items-center gap-1 ' +
                      (sortable
                        ? 'cursor-pointer hover:text-gray-900 dark:hover:text-gray-100'
                        : 'cursor-default')
                    }
                  >
                    {c}
                    {active &&
                      (sort?.order === 'asc' ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      ))}
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={colSpan} className="p-4">
                <Skeleton lines={5} />
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td
                colSpan={colSpan}
                className="p-10 text-center text-sm text-gray-400 dark:text-gray-500"
              >
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row, r) => (
              <tr key={r} className="even:bg-gray-50/50 dark:even:bg-gray-800/30">
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className="border-b border-gray-100 p-2 align-top whitespace-nowrap dark:border-gray-800 dark:text-gray-200"
                  >
                    {renderCell(cell)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
