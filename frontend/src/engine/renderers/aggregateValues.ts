import type { AggregateValuesPayload } from '@/types/animation'
import { easeOut, lerp } from '../easing'
import type { RenderFn } from '../rendererTypes'

/**
 * aggregate_values 渲染器（F-AN-11）：多行坍缩为汇总行，
 * 结果从底部弹出，ease-out 1200ms。
 */
export const renderAggregateValues: RenderFn = (engine, progress, step, maxWidth) => {
  const { source_table, aggregate_info, result_table } =
    step as AggregateValuesPayload
  const e = easeOut(progress)

  // 阶段：前 60% 源行坍缩，后 40% 结果弹出
  const collapseEnd = 0.6
  const collapseP = Math.min(1, e / collapseEnd)
  const popP = e <= collapseEnd ? 0 : (e - collapseEnd) / (1 - collapseEnd)

  const { ctx, config } = engine

  // 源表布局
  const srcLayout = engine.calculateLayout(source_table, maxWidth)
  const srcOx = engine.centerOffsetX(srcLayout)
  const srcOy = engine.centerOffsetY(srcLayout)

  ctx.save()
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  // 源表表头
  ctx.globalAlpha = 1 - collapseP * 0.6
  ctx.fillStyle = config.colors.headerBg
  ctx.fillRect(
    srcOx + config.cellPadding,
    srcOy + srcLayout.headerY,
    srcLayout.tableWidth - config.cellPadding * 2,
    config.headerHeight,
  )
  ctx.fillStyle = config.colors.text
  ctx.font = `600 ${config.fontSize}px ui-monospace, monospace`
  for (let c = 0; c < source_table.columns.length; c++) {
    ctx.fillText(
      source_table.columns[c],
      srcOx + srcLayout.colX[c] + config.cellPadding,
      srcOy + srcLayout.headerY + config.headerHeight / 2,
    )
  }

  // 源行坍缩：多行向中间收拢，alpha 淡出
  const n = source_table.rows.length
  const midY = srcLayout.rowY[Math.floor(n / 2)] ?? srcLayout.rowY[0]
  for (let r = 0; r < n; r++) {
    const startY = srcLayout.rowY[r]
    const y = lerp(startY, midY, collapseP)
    const alpha = 1 - collapseP
    if (alpha <= 0.01) continue
    engine.drawRow(source_table, srcLayout, r, {
      offsetX: srcOx,
      offsetY: srcOy + (y - startY),
      alpha,
    })
  }
  ctx.globalAlpha = 1

  // 聚合函数提示
  if (aggregate_info) {
    ctx.fillStyle = config.colors.mutedText
    ctx.font = `${config.fontSize - 1}px ui-monospace, monospace`
    ctx.fillText(
      `${aggregate_info.function}(${aggregate_info.target}) → ${aggregate_info.result_label}`,
      srcOx + config.cellPadding,
      srcOy - config.cellPadding,
    )
  }

  // 结果表弹出（从底部上滑 + alpha + scale）
  if (popP > 0 && result_table) {
    const resLayout = engine.calculateLayout(result_table, maxWidth)
    const resOx = engine.centerOffsetX(resLayout)
    const resOyBase = engine.centerOffsetY(resLayout)
    const resOy = resOyBase + (1 - popP) * config.rowHeight * 2
    const scale = lerp(0.9, 1, popP)
    const cx = resOx + resLayout.tableWidth / 2
    const cy = resOy + resLayout.tableHeight / 2
    ctx.save()
    ctx.globalAlpha = popP
    ctx.translate(cx, cy)
    ctx.scale(scale, scale)
    ctx.translate(-cx, -cy)
    engine.drawTableWithLayout(result_table, resLayout, {
      offsetX: resOx,
      offsetY: resOy,
    })
    ctx.restore()
  }

  ctx.restore()
}
