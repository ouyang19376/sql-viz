import type { CellValue } from '@/types/bi'
import Skeleton from '@/components/shared/Skeleton'

interface Props {
  columns: string[]
  rows: CellValue[][]
  loading?: boolean
  emptyText?: string
}

function renderCell(v: CellValue) {
  if (v === null || v === undefined)
    return <span className="text-gray-300 dark:text-gray-600">—</span>
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return String(v)
}

/** 通用明细表格（PRD §4.3）：表头 sticky，横向滚动；明细预览与明细抽屉复用。
 *  F-PV-01：展示原始数据，表头吸顶。 */
export default function DataTable({ columns, rows, loading, emptyText = '无匹配数据' }: Props) {
  const colSpan = Math.max(columns.length, 1)
  return (
    <div className="max-h-[520px] overflow-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-gray-50 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <tr>
            {columns.map((c, i) => (
              <th
                key={i}
                className="border-b border-gray-200 p-2 text-left whitespace-nowrap dark:border-gray-700"
              >
                {c}
              </th>
            ))}
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
