/** RFC 4180 CSV 导出（plan §6.5）：含 `,` `"` `\n` `\r` 的字段用双引号包裹，
 *  内嵌双引号转义为 `""`。前置 BOM 让 Excel 正确识别 UTF-8。 */
function escape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function exportCsv(columns: string[], rows: unknown[][]): Blob {
  const lines = [columns.map(escape).join(',')]
  for (const r of rows) lines.push(r.map(escape).join(','))
  return new Blob(['﻿' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  })
}
