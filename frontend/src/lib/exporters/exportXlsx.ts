import * as XLSX from 'xlsx'

export interface XlsxSheet {
  name: string
  columns: string[]
  rows: unknown[][]
}

/** xlsx 导出（sheetjs）：第一行表头 + 数据行 → 工作簿 → Blob */
export function exportXlsx(columns: string[], rows: unknown[][]): Blob {
  return exportWorkbook([{ name: 'Sheet1', columns, rows }])
}

/** 多 Sheet 工作簿导出。 */
export function exportWorkbook(sheets: XlsxSheet[]): Blob {
  const wb = XLSX.utils.book_new()
  for (const item of sheets) {
    const aoa = [item.columns, ...item.rows]
    const sheet = XLSX.utils.aoa_to_sheet(aoa)
    XLSX.utils.book_append_sheet(wb, sheet, item.name)
  }
  // bookType: xlsx；type: array 返回 ArrayBuffer
  const buf: ArrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
