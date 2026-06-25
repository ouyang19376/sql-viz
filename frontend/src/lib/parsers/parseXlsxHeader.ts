import * as XLSX from 'xlsx'

/** 取 .xlsx 工作簿 sheet1 首行 → 字段名数组。 */
export async function parseXlsxHeader(file: File): Promise<string[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('工作簿无可用 sheet')
  const sheet = wb.Sheets[sheetName]
  // header:1 让 sheet_to_json 返回 row 数组的二维结构；range:0 仅取首行
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    range: 0,
    defval: '',
    blankrows: false,
  })
  const firstRow = rows[0]
  if (!firstRow || firstRow.length === 0) throw new Error('首行为空')
  const headers = firstRow
    .map((v) => (v === null || v === undefined ? '' : String(v).trim()))
    .filter((s) => s.length > 0)
  if (headers.length === 0) throw new Error('未解析到有效字段名')
  return headers
}
