import type { TableData } from '@/types/animation'
import EmptyState from './EmptyState'

interface Props {
  table: TableData | null
  highlightColumns?: number[]
  highlightRows?: number[]
}

/** 静态 HTML 表格：Canvas 降级（F-AN-15）与搜索预览复用。 */
export default function TableView({ table, highlightColumns, highlightRows }: Props) {
  if (!table || table.rows.length === 0) {
    return <EmptyState title="暂无数据" description="该步骤无可展示的表格数据" />
  }

  const hiCol = new Set(highlightColumns ?? [])
  const hiRow = new Set(highlightRows ?? [])

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
      <table className="w-full border-collapse text-sm">
        {table.caption && (
          <caption className="caption-top px-3 py-1.5 text-left text-xs text-gray-500 dark:text-gray-400">
            {table.caption}
          </caption>
        )}
        <thead>
          <tr>
            {table.columns.map((col, c) => (
              <th
                key={c}
                className={`border-b border-gray-200 px-3 py-2 text-left font-mono font-semibold text-gray-700 dark:border-gray-800 dark:text-gray-200 ${
                  hiCol.has(c) ? 'dialect-bg-soft' : 'bg-gray-50 dark:bg-gray-800/50'
                }`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r} className={hiRow.has(r) ? 'dialect-bg-soft' : ''}>
              {row.map((cell, c) => (
                <td
                  key={c}
                  className={`border-b border-gray-100 px-3 py-2 font-mono dark:border-gray-800 ${
                    cell == null ? 'text-gray-300 dark:text-gray-600' : 'text-gray-800 dark:text-gray-200'
                  } ${hiCol.has(c) ? 'dialect-bg-soft' : ''}`}
                >
                  {cell == null ? '—' : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
