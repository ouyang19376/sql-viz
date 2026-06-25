import type { JoinTablesPayload } from '@/types/animation'
import { easeInOut, lerp } from '../easing'
import type { RenderFn } from '../rendererTypes'

/** 节点色板（匹配连线） */
const LINE_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']

/**
 * join_tables 渲染器（F-AN-13）：两表并排 → 连线匹配 → 合并，ease-in-out 1500ms。
 * 阶段 1（0~0.4）：并排两表 + 贝塞尔连线；阶段 2（0.4~1.0）：右表行滑向左表合并成结果。
 */
export const renderJoinTables: RenderFn = (engine, progress, step, maxWidth) => {
  const { left_table, right_table, match_pairs, join_type, result_table } =
    step as JoinTablesPayload
  const e = easeInOut(progress)

  const phase1End = 0.4
  const connectP = Math.min(1, e / phase1End)
  const mergeP = e <= phase1End ? 0 : (e - phase1End) / (1 - phase1End)

  const { ctx, config } = engine

  // 两表并排布局，各占 maxWidth 的一半
  const halfW = maxWidth / 2 - config.cellPadding
  const leftLayout = engine.calculateLayout(left_table, halfW)
  const rightLayout = engine.calculateLayout(right_table, halfW)

  const totalH = Math.max(leftLayout.tableHeight, rightLayout.tableHeight)
  const oy = Math.max(config.cellPadding, (config.height - totalH) / 2)
  const leftOx = config.cellPadding
  const rightOx = config.cellPadding + halfW + config.cellPadding * 2

  ctx.save()
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  const drawTableAt = (
    table: typeof left_table,
    layout: typeof leftLayout,
    ox: number,
    alpha = 1,
  ) => {
    ctx.globalAlpha = alpha
    engine.drawTableWithLayout(table, layout, { offsetX: ox, offsetY: oy })
    ctx.globalAlpha = 1
  }

  if (mergeP <= 0) {
    // 阶段 1：并排两表
    drawTableAt(left_table, leftLayout, leftOx)
    drawTableAt(right_table, rightLayout, rightOx)

    // 连线（贝塞尔）
    if (connectP > 0) {
      ctx.globalAlpha = connectP
      match_pairs.forEach((pair, idx) => {
        const color = LINE_COLORS[idx % LINE_COLORS.length]
        const leftRowY = oy + leftLayout.rowY[pair.left_idx] + config.rowHeight / 2
        const rightRowY = oy + rightLayout.rowY[pair.right_idx] + config.rowHeight / 2
        const startX = leftOx + leftLayout.tableWidth
        const endX = rightOx + config.cellPadding
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(startX, leftRowY)
        const midX = (startX + endX) / 2
        ctx.bezierCurveTo(midX, leftRowY, midX, rightRowY, endX, rightRowY)
        ctx.stroke()
      })
      ctx.globalAlpha = 1
    }
  } else {
    // 阶段 2：合并 → 显示结果表（左表行扩展补右表匹配列）
    drawTableAt(left_table, leftLayout, leftOx, 1 - mergeP * 0.5)

    // 右表行向左滑并淡出
    match_pairs.forEach((pair) => {
      const rightRowY = oy + rightLayout.rowY[pair.right_idx] + config.rowHeight / 2
      const targetY = oy + leftLayout.rowY[pair.left_idx] + config.rowHeight / 2
      const y = lerp(rightRowY, targetY, mergeP)
      const x = lerp(rightOx, leftOx + leftLayout.tableWidth - config.cellPadding, mergeP)
      const alpha = 1 - mergeP
      ctx.globalAlpha = alpha
      const row = right_table.rows[pair.right_idx]
      let cx = x
      for (let c = 0; c < right_table.columns.length; c++) {
        const cell = row[c]
        ctx.fillStyle = cell == null ? config.colors.mutedText : config.colors.text
        ctx.font = `${config.fontSize}px ui-monospace, monospace`
        ctx.fillText(cell == null ? '—' : cell, cx, y)
        cx += rightLayout.colWidths[c]
      }
      ctx.globalAlpha = 1
    })

    // 结果表淡入
    if (mergeP > 0.5 && result_table) {
      const resLayout = engine.calculateLayout(result_table, maxWidth)
      const resOx = engine.centerOffsetX(resLayout)
      const resOy = engine.centerOffsetY(resLayout)
      ctx.globalAlpha = (mergeP - 0.5) * 2
      engine.drawTableWithLayout(result_table, resLayout, {
        offsetX: resOx,
        offsetY: resOy,
      })
      ctx.globalAlpha = 1
    }
  }

  // JOIN 类型提示
  ctx.fillStyle = config.colors.mutedText
  ctx.font = `${config.fontSize - 1}px ui-monospace, monospace`
  ctx.fillText(`${join_type} JOIN`, leftOx, oy - config.cellPadding)

  ctx.restore()
}
