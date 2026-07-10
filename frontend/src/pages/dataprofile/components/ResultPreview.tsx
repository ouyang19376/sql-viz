import Pagination from '@/pages/BiReportPage/Pagination'
import type { QueryResult } from '@/types/dataprofile'

interface Props {
  result: QueryResult
  page: number
  pageSize: number
  onPageChange: (page: number) => void
}

/** 查询结果预览（F-QB-05/09）：
 * - 表头 sticky + 横向滚动（F-QB-09）
 * - 单元格截断 + tooltip（hover 看全值）
 * - 耗时 / 行数 / 截断提示 + 分页（复用 BiReportPage/Pagination）
 * - totalRows 未知（Hive）时：当前页满则推断「还有下一页」
 */
export default function ResultPreview({ result, page, pageSize, onPageChange }: Props) {
  const { columns, rows, totalRows, truncated, elapsedMs } = result

  // Hive totalRows=null：以「当前页是否满」推断是否还有更多，供分页按钮启用
  const effectiveTotal =
    totalRows ?? (rows.length >= pageSize
      ? page * pageSize + 1 // 假定还有下一页 -> canNext=true
      : (page - 1) * pageSize + rows.length) // 本页未满 -> 末页

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        <span>耗时 {elapsedMs} ms</span>
        <span>·</span>
        <span>
          {totalRows != null ? `共 ${totalRows} 行` : `本页 ${rows.length} 行（总数未知）`}
        </span>
        {truncated && (
          <span className="text-amber-600 dark:text-amber-400">
            · 当前页已满，可翻页查看更多
          </span>
        )}
      </div>

      <div className="max-h-[28rem] overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-gray-100 dark:bg-gray-800">
            <tr>
              <th className="border-b border-gray-200 px-2 py-1.5 text-left text-xs font-medium text-gray-400 dark:border-gray-700">
                #
              </th>
              {columns.map((c, i) => (
                <th
                  key={i}
                  className="whitespace-nowrap border-b border-gray-200 px-3 py-1.5 text-left font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-3 py-6 text-center text-gray-400"
                >
                  无数据
                </td>
              </tr>
            ) : (
              rows.map((row, ri) => (
                <tr
                  key={ri}
                  className={ri % 2 ? 'bg-gray-50 dark:bg-gray-800/40' : ''}
                >
                  <td className="border-b border-gray-100 px-2 py-1 text-xs text-gray-400 dark:border-gray-800">
                    {(page - 1) * pageSize + ri + 1}
                  </td>
                  {row.map((cell, ci) => {
                    const text = cell === null ? 'NULL' : String(cell)
                    return (
                      <td
                        key={ci}
                        className="border-b border-gray-100 px-3 py-1 dark:border-gray-800"
                      >
                        <span
                          className="block max-w-xs truncate font-mono text-gray-800 dark:text-gray-200"
                          title={text}
                        >
                          {text}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={pageSize} total={effectiveTotal} onChange={onPageChange} />
    </div>
  )
}
