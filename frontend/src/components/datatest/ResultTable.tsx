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
    if (v === null || v === undefined) return <span className="text-mute">null</span>
    if (typeof v === 'boolean') return v ? 'true' : 'false'
    return String(v)
  }

  return (
    <div className="max-h-[480px] overflow-auto rounded-lg border border-line bg-surface">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-surface-2 text-xs font-medium text-ink-2">
          <tr>
            {columns.map((c, i) => (
              <th key={i} className="border-b border-line p-2 text-left whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {previewRows.map((row, i) => (
            <tr key={i} className="even:bg-surface-2/50">
              {columns.map((_, ci) => (
                <td key={ci} className="border-b border-line p-2 align-top whitespace-nowrap text-ink">
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
