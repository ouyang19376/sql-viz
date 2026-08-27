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
    return <span className="text-mute">—</span>
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
    <div className="max-h-[520px] overflow-auto rounded-lg border border-line bg-surface">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-surface-2 text-xs font-medium text-ink-2">
          <tr>
            {columns.map((c, i) => {
              const active = sort?.field === c
              return (
                <th
                  key={i}
                  className="border-b border-line p-2 text-left whitespace-nowrap"
                >
                  <button
                    type="button"
                    disabled={!sortable}
                    onClick={() => onHeaderClick(c)}
                    className={
                      'inline-flex items-center gap-1 ' +
                      (sortable
                        ? 'cursor-pointer hover:text-ink'
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
                className="p-10 text-center text-sm text-mute"
              >
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row, r) => (
              <tr key={r} className="even:bg-surface-2/50">
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className="border-b border-line p-2 align-top whitespace-nowrap text-ink"
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
