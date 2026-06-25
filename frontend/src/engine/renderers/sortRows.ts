import type { SortRowsPayload } from '@/types/animation'
import { easeInOut, lerp } from '../easing'
import type { RenderFn } from '../rendererTypes'

/**
 * sort_rows 渲染器（F-AN-07）：行重新排列，交换时画弧线轨迹，ease-in-out 1200ms。
 * order_mapping[newPos] = oldIndex
 */
export const renderSortRows: RenderFn = (engine, progress, step, maxWidth) => {
  const { source_table, order_mapping } = step as SortRowsPayload
  const table = source_table
  const layout = engine.calculateLayout(table, maxWidth)
  const ox = engine.centerOffsetX(layout)
  const oy = engine.centerOffsetY(layout)
  const { ctx, config } = engine
  const e = easeInOut(progress)

  const n = table.rows.length

  // 起始 y（原顺序）与目标 y（排序后顺序）
  // 排序后第 i 行 = oldIndex order_mapping[i]，其 rowY 就是 layout.rowY[i]
  // 对原始第 oldIndex 行：起始 y = rowY[oldIndex]，目标 y = rowY[newPos]
  // 构建 oldIndex -> newPos
  const oldToNew = new Array(n).fill(-1)
  for (let newPos = 0; newPos < n; newPos++) {
    oldToNew[order_mapping[newPos]] = newPos
  }

  // 表头
  ctx.save()
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = config.colors.headerBg
  ctx.fillRect(
    ox + config.cellPadding,
    oy + layout.headerY,
    layout.tableWidth - config.cellPadding * 2,
    config.headerHeight,
  )
  ctx.fillStyle = config.colors.text
  ctx.font = `600 ${config.fontSize}px ui-monospace, monospace`
  for (let c = 0; c < table.columns.length; c++) {
    ctx.fillText(
      table.columns[c],
      ox + layout.colX[c] + config.cellPadding,
      oy + layout.headerY + config.headerHeight / 2,
    )
  }
  if (table.caption) {
    ctx.fillStyle = config.colors.mutedText
    ctx.font = `600 ${config.fontSize - 1}px ui-monospace, monospace`
    ctx.fillText(table.caption, ox + config.cellPadding, oy + layout.captionY + (config.rowHeight * 0.7) / 2)
  }

  // 绘制每行（按 oldIndex 遍历，从起始 y 移动到目标 y，弧线偏移）
  for (let oldIdx = 0; oldIdx < n; oldIdx++) {
    const newIdx = oldToNew[oldIdx]
    if (newIdx < 0) continue
    const startY = layout.rowY[oldIdx]
    const endY = layout.rowY[newIdx]
    const y = lerp(startY, endY, e)
    // 弧线偏移：交换幅度越大弧越高，方向取行移动方向
    const delta = endY - startY
    const arc = -Math.sin(Math.PI * e) * (Math.abs(delta) > 0 ? config.rowHeight * 0.5 : 0) * (delta < 0 ? 1 : 1)
    engine.drawRow(table, layout, oldIdx, {
      offsetX: ox,
      offsetY: oy + (y - layout.rowY[oldIdx]) + arc,
      alpha: 1,
    })
  }

  // 弧线轨迹拖尾（半透明，连接起始→目标）
  if (e > 0 && e < 1) {
    ctx.globalAlpha = 0.25
    ctx.strokeStyle = config.colors.mutedText
    ctx.lineWidth = 1
    for (let oldIdx = 0; oldIdx < n; oldIdx++) {
      const newIdx = oldToNew[oldIdx]
      if (newIdx < 0 || newIdx === oldIdx) continue
      const startX = ox + layout.tableWidth - config.cellPadding
      const startY = oy + layout.rowY[oldIdx] + config.rowHeight / 2
      const endX = startX
      const endY = oy + layout.rowY[newIdx] + config.rowHeight / 2
      const midY = (startY + endY) / 2 - Math.abs(endY - startY) * 0.3
      ctx.beginPath()
      ctx.moveTo(startX, startY)
      ctx.quadraticCurveTo(startX + 20, midY, endX, endY)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  ctx.restore()
}
