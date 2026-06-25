import type { FilterRowsPayload } from '@/types/animation'
import { easeInOut } from '../easing'
import type { RenderFn } from '../rendererTypes'

/**
 * filter_rows 渲染器（F-AN-06）：不符合条件行 alpha 1→0 + 行高收缩，
 * 保留行随后上移填补空位，ease-in-out 1000ms。
 */
export const renderFilterRows: RenderFn = (engine, progress, step, maxWidth) => {
  const { source_table, removed_indices, condition_description } =
    step as FilterRowsPayload
  const table = source_table
  const layout = engine.calculateLayout(table, maxWidth)
  const ox = engine.centerOffsetX(layout)
  const oy = engine.centerOffsetY(layout)
  const { ctx, config } = engine
  const e = easeInOut(progress)

  const removedSet = new Set(removed_indices)
  const n = table.rows.length

  // 移除行的最终位移量（累计上方被移除行的压缩高度）
  // 保留行向上移动填补：第 r 行的目标偏移 = -(其上方所有 removed 行压缩后的高度)
  // 每行 rowHeight，移除行收缩到 0
  const rowAlpha: number[] = []
  const rowOffsetY: number[] = []
  // 每行上方有多少 removed 行（决定保留行上移量）
  const removedAbove: number[] = []
  let cnt = 0
  for (let r = 0; r < n; r++) {
    removedAbove.push(cnt)
    if (removedSet.has(r)) cnt++
  }

  for (let r = 0; r < n; r++) {
    if (removedSet.has(r)) {
      rowAlpha.push(1 - e) // 淡出
      // 移除行不额外上移（自身收缩）
      rowOffsetY.push(0)
    } else {
      rowAlpha.push(1)
      // 保留行上移：填补上方 removed 行的压缩高度
      rowOffsetY.push(-removedAbove[r] * config.rowHeight * e)
    }
  }

  ctx.save()
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  // 条件说明
  if (condition_description) {
    ctx.fillStyle = config.colors.removedBg
    ctx.font = `${config.fontSize - 1}px ui-monospace, monospace`
    ctx.fillText(
      `WHERE ${condition_description}`,
      ox + config.cellPadding,
      oy - config.cellPadding,
    )
  }

  // 表头
  ctx.globalAlpha = 1
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

  // 行：移除行用红色底色提示
  for (let r = 0; r < n; r++) {
    if (rowAlpha[r] <= 0.01) continue
    engine.drawRow(table, layout, r, {
      offsetX: ox,
      offsetY: oy + rowOffsetY[r],
      alpha: rowAlpha[r],
      color: removedSet.has(r) ? config.colors.removedBg : undefined,
    })
  }

  // 网格边框
  ctx.globalAlpha = 1
  ctx.strokeStyle = config.colors.border
  ctx.lineWidth = 1
  ctx.strokeRect(
    ox + config.cellPadding,
    oy + layout.headerY,
    layout.tableWidth - config.cellPadding * 2,
    config.headerHeight,
  )
  ctx.restore()
}
