import type { LayoutInfo, RenderConfig } from '@/types/engine'
import type { TableData } from '@/types/animation'
import { measureText } from './textMeasure'

const MIN_COL_WIDTH = 80

/** 字体串 */
function fontStr(config: RenderConfig): string {
  return `${config.fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
}

/**
 * 计算表格布局（逻辑像素坐标）。
 * 列宽 = max(列名宽×1.2, 该列数据最大宽×1.1, MIN_COL_WIDTH)。
 * maxWidth 给定且总宽超出时按比例压缩。
 */
export function calculateLayout(
  ctx: CanvasRenderingContext2D,
  table: TableData,
  config: RenderConfig,
  maxWidth?: number,
): LayoutInfo {
  const font = fontStr(config)
  const { cellPadding, rowHeight, headerHeight } = config

  const colCount = table.columns.length
  const colWidths: number[] = []
  for (let c = 0; c < colCount; c++) {
    const headerW = measureText(ctx, table.columns[c], font) * 1.2
    let maxCellW = 0
    for (const row of table.rows) {
      const w = measureText(ctx, row[c], font) * 1.1
      if (w > maxCellW) maxCellW = w
    }
    colWidths.push(Math.max(headerW, maxCellW, MIN_COL_WIDTH) + cellPadding * 2)
  }

  // 总宽超 maxWidth 时按比例压缩
  const rawTotal = colWidths.reduce((a, b) => a + b, 0)
  if (maxWidth && rawTotal > maxWidth && rawTotal > 0) {
    const scale = maxWidth / rawTotal
    for (let c = 0; c < colCount; c++) {
      colWidths[c] = Math.max(MIN_COL_WIDTH * 0.6, colWidths[c] * scale)
    }
  }

  const captionHeight = table.caption ? rowHeight * 0.7 : 0
  const captionY = cellPadding
  const headerY = captionY + captionHeight

  const colX: number[] = []
  let x = cellPadding
  for (let c = 0; c < colCount; c++) {
    colX.push(x)
    x += colWidths[c]
  }

  const rowY: number[] = []
  for (let r = 0; r < table.rows.length; r++) {
    rowY.push(headerY + headerHeight + r * rowHeight)
  }

  const tableWidth = x + cellPadding
  const tableHeight =
    headerY + headerHeight + table.rows.length * rowHeight + cellPadding

  return {
    tableWidth,
    tableHeight,
    colX,
    colWidths,
    rowY,
    headerY,
    captionY,
  }
}

export { fontStr }
