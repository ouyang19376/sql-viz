import type { ShowSourcePayload } from '@/types/animation'
import { easeOut } from '../easing'
import type { RenderFn } from '../rendererTypes'

/** show_source 渲染器（F-AN-05）：源数据表格逐行从上到下淡入，ease-out 800ms。 */
export const renderShowSource: RenderFn = (engine, progress, step, maxWidth) => {
  const { table } = step as ShowSourcePayload
  const layout = engine.calculateLayout(table, maxWidth)
  const ox = engine.centerOffsetX(layout)
  const oy = engine.centerOffsetY(layout)
  const { ctx, config } = engine

  const headerP = easeOut(Math.min(1, progress / 0.15))
  const n = table.rows.length
  const startFrac = 0.15
  const span = 1 - startFrac

  ctx.save()
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  // caption
  if (table.caption && headerP > 0) {
    ctx.globalAlpha = headerP
    ctx.fillStyle = config.colors.mutedText
    ctx.font = `600 ${config.fontSize - 1}px ui-monospace, monospace`
    ctx.fillText(
      table.caption,
      ox + config.cellPadding,
      oy + layout.captionY + (config.rowHeight * 0.7) / 2,
    )
  }

  // 表头
  if (headerP > 0) {
    ctx.globalAlpha = headerP
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
  }

  // 逐行淡入 + 从上方滑入
  for (let r = 0; r < n; r++) {
    const localStart = startFrac + (r / Math.max(1, n)) * span
    const localEnd = startFrac + ((r + 1) / Math.max(1, n)) * span
    let local = (progress - localStart) / (localEnd - localStart)
    local = local < 0 ? 0 : local > 1 ? 1 : local
    const e = easeOut(local)
    if (e <= 0) continue
    engine.drawRow(table, layout, r, {
      offsetX: ox,
      offsetY: oy + (1 - e) * -config.rowHeight,
      alpha: e,
    })
  }

  ctx.restore()
}
