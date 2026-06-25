import type { AddColumnPayload, TableData } from '@/types/animation'
import { easeOut } from '../easing'
import type { RenderFn } from '../rendererTypes'

/**
 * add_column 渲染器（F-AN-12）：新列从表格右侧滑入，ease-out 600ms。
 */
export const renderAddColumn: RenderFn = (engine, progress, step, maxWidth) => {
  const { table, new_column, insert_index } = step as AddColumnPayload
  const e = easeOut(progress)

  // 结果表（含新列）
  const resultColumns = [
    ...table.columns.slice(0, insert_index),
    new_column.name,
    ...table.columns.slice(insert_index),
  ]
  const resultRows = table.rows.map((row, r) => [
    ...row.slice(0, insert_index),
    new_column.values[r] ?? null,
    ...row.slice(insert_index),
  ])
  const resultTable: TableData = {
    columns: resultColumns,
    rows: resultRows,
    caption: table.caption,
  }

  const layout = engine.calculateLayout(resultTable, maxWidth)
  const ox = engine.centerOffsetX(layout)
  const oy = engine.centerOffsetY(layout)
  const { ctx, config } = engine

  ctx.save()
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  // 表头：原列
  ctx.fillStyle = config.colors.headerBg
  ctx.fillRect(
    ox + config.cellPadding,
    oy + layout.headerY,
    layout.tableWidth - config.cellPadding * 2,
    config.headerHeight,
  )
  ctx.fillStyle = config.colors.text
  ctx.font = `600 ${config.fontSize}px ui-monospace, monospace`
  for (let c = 0; c < resultColumns.length; c++) {
    if (c === insert_index) continue
    ctx.fillText(
      resultColumns[c],
      ox + layout.colX[c] + config.cellPadding,
      oy + layout.headerY + config.headerHeight / 2,
    )
  }
  if (table.caption) {
    ctx.fillStyle = config.colors.mutedText
    ctx.font = `600 ${config.fontSize - 1}px ui-monospace, monospace`
    ctx.fillText(table.caption, ox + config.cellPadding, oy + layout.captionY + (config.rowHeight * 0.7) / 2)
  }

  // 数据行（原列）
  for (let r = 0; r < table.rows.length; r++) {
    for (let c = 0; c < resultColumns.length; c++) {
      if (c === insert_index) continue
      const cell = resultRows[r][c]
      const x = ox + layout.colX[c] + config.cellPadding
      const y = oy + layout.rowY[r] + config.rowHeight / 2
      ctx.fillStyle = cell == null ? config.colors.mutedText : config.colors.text
      ctx.font = `${config.fontSize}px ui-monospace, monospace`
      ctx.fillText(cell == null ? '—' : cell, x, y)
    }
  }

  // 新列从右滑入：x 从 tableWidth 滑到目标 colX，alpha 0→1
  const targetX = layout.colX[insert_index]
  const colW = layout.colWidths[insert_index]
  const startX = layout.tableWidth // 右边缘
  const curX = lerpFromRight(startX, targetX, e)
  const alpha = e

  ctx.globalAlpha = alpha
  // 新列背景
  ctx.fillStyle = config.colors.addedBg
  ctx.fillRect(
    ox + curX,
    oy + layout.headerY,
    colW,
    config.headerHeight + table.rows.length * config.rowHeight,
  )
  // 新列表头
  ctx.fillStyle = config.colors.text
  ctx.font = `600 ${config.fontSize}px ui-monospace, monospace`
  ctx.fillText(
    new_column.name,
    ox + curX + config.cellPadding,
    oy + layout.headerY + config.headerHeight / 2,
  )
  // 新列数据
  for (let r = 0; r < table.rows.length; r++) {
    const val = new_column.values[r]
    ctx.fillStyle = config.colors.text
    ctx.font = `${config.fontSize}px ui-monospace, monospace`
    ctx.fillText(
      val == null ? '—' : val,
      ox + curX + config.cellPadding,
      oy + layout.rowY[r] + config.rowHeight / 2,
    )
  }
  ctx.globalAlpha = 1

  // 网格边框（仅原表区域）
  ctx.strokeStyle = config.colors.border
  ctx.lineWidth = 1
  ctx.strokeRect(
    ox + config.cellPadding,
    oy + layout.headerY,
    layout.tableWidth - config.cellPadding * 2,
    config.headerHeight + table.rows.length * config.rowHeight,
  )
  ctx.restore()
}

function lerpFromRight(start: number, end: number, t: number): number {
  return start + (end - start) * t
}
