import type { TransformValuesPayload } from '@/types/animation'
import { easeOut, stepEnd } from '../easing'
import type { RenderFn } from '../rendererTypes'

/**
 * transform_values 渲染器（F-AN-10）：单元格旧值「翻转」为新值，
 * step-end 逐个翻转，1000ms。
 */
export const renderTransformValues: RenderFn = (engine, progress, step, maxWidth) => {
  const { source_table, target_column, before_values, after_values, transform_fn } =
    step as TransformValuesPayload
  const table = source_table
  const layout = engine.calculateLayout(table, maxWidth)
  const ox = engine.centerOffsetX(layout)
  const oy = engine.centerOffsetY(layout)
  const { ctx, config } = engine

  const n = table.rows.length
  // 已翻转的单元格数（step-end）
  const flipped = stepEnd(progress, n)
  // 当前正在翻转的单元格局部进度
  const curLocal =
    progress >= 1 ? 1 : (progress * n - flipped)

  // 绘制整表（其余列静态），target_column 列按翻转状态显示
  ctx.save()
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  // 表头
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

  // 函数名提示
  if (transform_fn) {
    ctx.fillStyle = config.colors.mutedText
    ctx.font = `${config.fontSize - 1}px ui-monospace, monospace`
    ctx.fillText(`${transform_fn}()`, ox + config.cellPadding, oy - config.cellPadding)
  }

  // 数据行
  for (let r = 0; r < n; r++) {
    // 非 target 列正常绘制
    for (let c = 0; c < table.columns.length; c++) {
      if (c === target_column) continue
      const cell = table.rows[r][c]
      const x = ox + layout.colX[c] + config.cellPadding
      const y = oy + layout.rowY[r] + config.rowHeight / 2
      ctx.fillStyle = cell == null ? config.colors.mutedText : config.colors.text
      ctx.font = `${config.fontSize}px ui-monospace, monospace`
      ctx.fillText(cell == null ? '—' : cell, x, y)
    }

    // target 列：翻转
    const x = ox + layout.colX[target_column] + config.cellPadding
    const y = oy + layout.rowY[r] + config.rowHeight / 2
    const before = before_values[r]
    const after = after_values[r]
    if (r < flipped) {
      // 已翻转：显示新值，淡绿色背景
      ctx.fillStyle = config.colors.addedBg
      ctx.fillRect(
        ox + layout.colX[target_column],
        oy + layout.rowY[r],
        layout.colWidths[target_column],
        config.rowHeight,
      )
      ctx.fillStyle = config.colors.text
      ctx.font = `600 ${config.fontSize}px ui-monospace, monospace`
      ctx.fillText(after == null ? '—' : after, x, y)
    } else if (r === flipped && curLocal > 0 && curLocal < 1) {
      // 正在翻转：旧值淡出 + 新值淡入
      const e = easeOut(curLocal)
      ctx.globalAlpha = 1 - e
      ctx.fillStyle = config.colors.text
      ctx.fillText(before == null ? '—' : before, x, y)
      ctx.globalAlpha = e
      ctx.fillStyle = config.colors.text
      ctx.fillText(after == null ? '—' : after, x, y)
      ctx.globalAlpha = 1
    } else {
      // 未翻转：旧值
      ctx.fillStyle = config.colors.text
      ctx.fillText(before == null ? '—' : before, x, y)
    }
  }

  // 网格
  ctx.strokeStyle = config.colors.border
  ctx.lineWidth = 1
  ctx.strokeRect(
    ox + config.cellPadding,
    oy + layout.headerY,
    layout.tableWidth - config.cellPadding * 2,
    config.headerHeight + n * config.rowHeight,
  )
  ctx.restore()
}
