/** JSON 导出：columns + rows → 对象数组（每行键 = 列名） */
export function exportJson(columns: string[], rows: unknown[][]): Blob {
  const data = rows.map((r) =>
    Object.fromEntries(columns.map((c, i) => [c, r[i] ?? null])),
  )
  return new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
}
