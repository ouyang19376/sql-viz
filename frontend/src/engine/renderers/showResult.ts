import type { ShowResultPayload } from '@/types/animation'
import { easeOut } from '../easing'
import type { RenderFn } from '../rendererTypes'

/** show_result 渲染器（F-AN-14）：结果表格缩放(0.92→1)+淡入浮现，ease-out 800ms。 */
export const renderShowResult: RenderFn = (engine, progress, step, maxWidth) => {
  const { table, highlight_columns, highlight_rows } =
    step as ShowResultPayload
  const layout = engine.calculateLayout(table, maxWidth)
  const { ctx } = engine
  const e = easeOut(progress)
  const scale = 0.92 + 0.08 * e
  const alpha = e

  // 缩放围绕表格中心
  const cx = engine.centerOffsetX(layout) + layout.tableWidth / 2
  const cy = engine.centerOffsetY(layout) + layout.tableHeight / 2

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(cx, cy)
  ctx.scale(scale, scale)
  ctx.translate(-cx, -cy)
  engine.drawTableWithLayout(table, layout, {
    highlightColumns: highlight_columns,
    highlightRows: highlight_rows,
  })
  ctx.restore()
}
