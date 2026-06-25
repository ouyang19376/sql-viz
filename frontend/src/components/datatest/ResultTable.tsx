import type { GenerateResponseSuccess } from '@/types/datatest'
import { DT_LIMITS } from '@/types/datatest'

interface Props {
  result: GenerateResponseSuccess
}

/** F-DT-08：结果预览表格。前 50 行（超过折叠），表头 sticky，横向滚动。 */
export default function ResultTable({ result }: Props) {
  const { columns, rows } = result
  const previewRows = rows.slice(0, DT_LIMITS.PREVIEW_ROWS)

  const renderCell = (v: unknown) => {
    if (v === null || v === undefined) return <span className="text-gray-300 dark:text-gray-600">null</span>
    if (typeof v === 'boolean') return v ? 'true' : 'false'
    return String(v)
  }

  return (
    <div className="max-h-[480px] overflow-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-gray-50 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <tr>
            {columns.map((c, i) => (
              <th key={i} className="border-b border-gray-200 p-2 text-left whitespace-nowrap dark:border-gray-700">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {previewRows.map((row, i) => (
            <tr key={i} className="even:bg-gray-50/50 dark:even:bg-gray-800/30">
              {columns.map((_, ci) => (
                <td key={ci} className="border-b border-gray-100 p-2 align-top whitespace-nowrap dark:border-gray-800 dark:text-gray-200">
                  {renderCell(row[ci])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
