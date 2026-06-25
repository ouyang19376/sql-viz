/** RFC 4180 兼容的「单行 CSV」字段拆分。
 *  仅用于解析首行表头：不需要处理跨行包裹的引号字段（首行内不应有未闭合引号）。 */
function splitCsvRow(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      result.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  result.push(cur)
  return result
}

/** 取 .csv 文件首行 → 字段名数组。
 *  解析失败 / 空文件 / 全空字段 → 抛 Error，由调用方处理 toast。 */
export async function parseCsvHeader(file: File): Promise<string[]> {
  const text = await file.text()
  if (!text.trim()) throw new Error('文件为空')
  // 去 UTF-8 BOM；按 \r?\n 取首行
  const stripped = text.replace(/^﻿/, '')
  const firstLine = stripped.split(/\r?\n/, 1)[0]
  if (!firstLine.trim()) throw new Error('首行为空')
  const headers = splitCsvRow(firstLine)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (headers.length === 0) throw new Error('未解析到有效字段名')
  return headers
}
