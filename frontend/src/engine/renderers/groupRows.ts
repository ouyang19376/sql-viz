import type { GroupRowsPayload, GroupRow, TableData } from '@/types/animation'
import { easeOut, lerp } from '../easing'
import type { RenderFn } from '../rendererTypes'

/**
 * group_rows 渲染器（F-AN-08）：同类行向目标位置聚拢合并，ease-out 1500ms。
 * 真实数据无 source_table，需从 groups[].rows 重建原表行并记录归属组。
 */
export const renderGroupRows: RenderFn = (engine, progress, step, maxWidth) => {
  const { groups, group_column } = step as GroupRowsPayload
  const e = easeOut(progress)

  // 重建原表：按 groups 顺序平铺所有原始行，记录每行的 groupIndex
  const columns = groups[0]?.rows[0]?.length
    ? Array.from({ length: groups[0].rows[0].length }, (_, i) => i === 0 ? group_column : `col${i}`)
    : [group_column]

  const sourceRows: (string | null)[][] = []
  const rowGroup: number[] = [] // 每行所属 group 索引
  groups.forEach((g, gi) => {
    g.rows.forEach((r) => {
      sourceRows.push(r)
      rowGroup.push(gi)
    })
  })

  const sourceTable: TableData = { columns, rows: sourceRows }
  const layout = engine.calculateLayout(sourceTable, maxWidth)
  const ox = engine.centerOffsetX(layout)
  const oy = engine.centerOffsetY(layout)
  const { ctx, config } = engine

  // 每组的「目标位置」（聚合后单行）= 结果表的第 gi 行
  // 结果表行数 = groups.length
  const resultRowY = (gi: number) =>
    layout.headerY + config.headerHeight + gi * config.rowHeight

  // 每个原始行的起始 y = 其在 sourceTable 中的 rowY
  // 目标 y = 所属组的 resultRowY（聚拢到组首位置）

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
  for (let c = 0; c < columns.length; c++) {
    ctx.fillText(
      columns[c],
      ox + layout.colX[c] + config.cellPadding,
      oy + layout.headerY + config.headerHeight / 2,
    )
  }

  // 阶段划分：前 60% 聚拢，后 40% 坍缩为聚合行
  const gatherEnd = 0.6
  const gatherP = Math.min(1, e / gatherEnd)
  const collapseP = e <= gatherEnd ? 0 : (e - gatherEnd) / (1 - gatherEnd)

  // 计算每行当前位置
  const positions: number[] = []
  for (let r = 0; r < sourceRows.length; r++) {
    const gi = rowGroup[r]
    const startY = layout.rowY[r]
    const targetY = resultRowY(gi)
    const y = lerp(startY, targetY, gatherP)
    positions.push(y)
  }

  // 绘制原始行（聚拢阶段，坍缩阶段逐组淡出）
  for (let r = 0; r < sourceRows.length; r++) {
    // 坍缩阶段：非组首行 alpha 衰减
    const isGroupFirst = groups[rowGroup[r]].rows[0] === sourceRows[r]
    let alpha = 1
    if (collapseP > 0 && !isGroupFirst) {
      alpha = 1 - collapseP
    }
    if (alpha <= 0.01) continue
    engine.drawRow(sourceTable, layout, r, {
      offsetX: ox,
      offsetY: oy + (positions[r] - layout.rowY[r]),
      alpha,
    })
  }

  // 坍缩阶段：绘制聚合结果行（从底部弹出感）
  if (collapseP > 0) {
    for (let gi = 0; gi < groups.length; gi++) {
      const g: GroupRow = groups[gi]
      const y = resultRowY(gi)
      const popAlpha = collapseP
      // 轻微上滑
      const yOffset = (1 - collapseP) * config.rowHeight * 0.5
      ctx.globalAlpha = popAlpha
      engine.drawRow(
        { columns, rows: [g.aggregated] },
        { ...layout, rowY: [y - yOffset] },
        0,
        { offsetX: ox, offsetY: oy, alpha: 1, color: config.colors.addedBg },
      )
      ctx.globalAlpha = 1
    }
  }

  ctx.restore()
}
