import type { SelectColumnsPayload } from '@/types/animation'
import { easeInOut, lerp } from '../easing'
import type { RenderFn } from '../rendererTypes'

/**
 * select_columns 渲染器（F-AN-09）：未选中列宽度收缩为 0，ease-in-out 800ms。
 */
export const renderSelectColumns: RenderFn = (engine, progress, step, maxWidth) => {
  const { source_table, selected_indices } = step as SelectColumnsPayload
  const table = source_table
  const baseLayout = engine.calculateLayout(table, maxWidth)
  const ox = engine.centerOffsetX(baseLayout)
  const oy = engine.centerOffsetY(baseLayout)
  const { ctx, config } = engine
  const e = easeInOut(progress)

  const selectedSet = new Set(selected_indices)
  const colCount = table.columns.length

  // 计算每列当前宽度（未选中列 1→0）与累计 x
  const curWidths: number[] = []
  for (let c = 0; c < colCount; c++) {
    if (selectedSet.has(c)) {
      curWidths.push(baseLayout.colWidths[c])
    } else {
      curWidths.push(lerp(baseLayout.colWidths[c], 0, e))
    }
  }
  const curX: number[] = []
  let acc = 0
  for (let c = 0; c < colCount; c++) {
    curX.push(acc)
    acc += curWidths[c]
  }

  ctx.save()
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  // 表头
  ctx.fillStyle = config.colors.headerBg
  const totalW = acc
  ctx.fillRect(
    ox + config.cellPadding,
    oy + baseLayout.headerY,
    totalW,
    config.headerHeight,
  )
  ctx.fillStyle = config.colors.text
  ctx.font = `600 ${config.fontSize}px ui-monospace, monospace`
  for (let c = 0; c < colCount; c++) {
    if (curWidths[c] < 2) continue
    ctx.save()
    ctx.beginPath()
    ctx.rect(ox + config.cellPadding + curX[c], oy + baseLayout.headerY, curWidths[c], config.headerHeight + table.rows.length * config.rowHeight)
    ctx.clip()
    ctx.fillText(
      table.columns[c],
      ox + config.cellPadding + curX[c] + config.cellPadding,
      oy + baseLayout.headerY + config.headerHeight / 2,
    )
    ctx.restore()
  }

  // 数据行
  for (let r = 0; r < table.rows.length; r++) {
    for (let c = 0; c < colCount; c++) {
      if (curWidths[c] < 2) continue
      const cell = table.rows[r][c]
      const x = ox + config.cellPadding + curX[c] + config.cellPadding
      const y = oy + baseLayout.rowY[r] + config.rowHeight / 2
      ctx.save()
      ctx.beginPath()
      ctx.rect(ox + config.cellPadding + curX[c], oy + baseLayout.rowY[r], curWidths[c], config.rowHeight)
      ctx.clip()
      if (cell == null) {
        ctx.fillStyle = config.colors.mutedText
        ctx.fillText('—', x, y)
      } else {
        ctx.fillStyle = config.colors.text
        ctx.font = `${config.fontSize}px ui-monospace, monospace`
        ctx.fillText(cell, x, y)
      }
      ctx.restore()
    }
  }

  // 边框
  ctx.strokeStyle = config.colors.border
  ctx.lineWidth = 1
  ctx.strokeRect(
    ox + config.cellPadding,
    oy + baseLayout.headerY,
    totalW,
    config.headerHeight + table.rows.length * config.rowHeight,
  )
  ctx.restore()
}
