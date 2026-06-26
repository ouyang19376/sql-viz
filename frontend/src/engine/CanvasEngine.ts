import type {
  DrawOptions,
  LayoutInfo,
  RenderConfig,
} from '@/types/engine'
import type { TableData } from '@/types/animation'
import { calculateLayout, fontStr } from './layout'
import { hexWithAlpha } from './easing'

const DEFAULT_CONFIG: Omit<RenderConfig, 'width' | 'height' | 'dpr' | 'dialectColor'> = {
  cellPadding: 10,
  headerHeight: 34,
  rowHeight: 30,
  fontSize: 13,
  colors: {
    bg: '#ffffff',
    headerBg: '#f3f4f6',
    border: '#e5e7eb',
    text: '#374151',
    mutedText: '#9ca3af',
    highlightBg: '#eef6f8',
    removedBg: '#fee2e2',
    addedBg: '#dcfce7',
  },
}

/** 从方言色派生默认 config */
function buildConfig(
  canvas: HTMLCanvasElement,
  partial?: Partial<RenderConfig>,
  dialectColor = '#00758f',
): RenderConfig {
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  return {
    ...DEFAULT_CONFIG,
    width: rect.width || 400,
    height: rect.height || 300,
    dpr,
    dialectColor,
    colors: {
      ...DEFAULT_CONFIG.colors,
      highlightBg: hexWithAlpha(dialectColor, 0.12),
    },
    ...partial,
  }
}

/**
 * Canvas 渲染引擎：表格绘制 + 布局计算 + 尺寸适配。
 * 纯 TS，零 React 依赖。
 */
export class CanvasEngine {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  config: RenderConfig

  constructor(
    canvas: HTMLCanvasElement,
    partial?: Partial<RenderConfig>,
    dialectColor?: string,
  ) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context 不可用')
    this.ctx = ctx
    this.config = buildConfig(canvas, partial, dialectColor)
    this.applyTransform()
  }

  /** 设置 ctx 变换以适配 dpr，绘制使用逻辑像素坐标。
   *  注意：不写 canvas.style.width/height —— canvas 由 CSS 的 w-full h-full 跟随容器，
   *  否则 inline px 会反向撑大祖先（grid item min-width:auto）→ ResizeObserver 反馈循环（画布不断变大）。 */
  applyTransform(): void {
    const { dpr } = this.config
    this.canvas.width = Math.round(this.config.width * dpr)
    this.canvas.height = Math.round(this.config.height * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  resize(width: number, height: number): void {
    this.config.width = width
    this.config.height = height
    this.applyTransform()
  }

  setDialectColor(color: string): void {
    this.config.dialectColor = color
    this.config.colors.highlightBg = hexWithAlpha(color, 0.12)
  }

  clear(): void {
    this.ctx.save()
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.ctx.restore()
    // 恢复逻辑像素变换
    const { dpr } = this.config
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.ctx.fillStyle = this.config.colors.bg
    this.ctx.fillRect(0, 0, this.config.width, this.config.height)
  }

  calculateLayout(table: TableData, maxWidth?: number): LayoutInfo {
    return calculateLayout(this.ctx, table, this.config, maxWidth)
  }

  /** 计算居中起始 x（让表格水平居中于画布） */
  centerOffsetX(layout: LayoutInfo): number {
    return Math.max(this.config.cellPadding, (this.config.width - layout.tableWidth) / 2)
  }
  /** 计算居中起始 y（让表格垂直居中于画布） */
  centerOffsetY(layout: LayoutInfo): number {
    return Math.max(this.config.cellPadding, (this.config.height - layout.tableHeight) / 2)
  }

  /** 绘制完整表格（caption + 表头 + 网格 + 数据行） */
  drawTable(
    table: TableData,
    options: DrawOptions & { offsetX?: number; offsetY?: number } = {},
  ): void {
    const layout = this.calculateLayout(table)
    this.drawTableWithLayout(table, layout, options)
  }

  /** 用预计算 layout 绘制（动画帧复用，避免重复测量） */
  drawTableWithLayout(
    table: TableData,
    layout: LayoutInfo,
    {
      highlightColumns,
      highlightRows,
      alpha = 1,
      rowAlpha,
      rowOffsetY,
      offsetX,
      offsetY,
    }: DrawOptions & { offsetX?: number; offsetY?: number } = {},
  ): void {
    const { ctx, config } = this
    const ox = offsetX ?? this.centerOffsetX(layout)
    const oy = offsetY ?? this.centerOffsetY(layout)
    const font = fontStr(config)

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.font = font
    ctx.textBaseline = 'middle'

    // caption
    if (table.caption) {
      ctx.fillStyle = config.colors.mutedText
      ctx.font = `600 ${config.fontSize - 1}px ui-monospace, monospace`
      ctx.fillText(
        table.caption,
        ox + config.cellPadding,
        oy + layout.captionY + (config.rowHeight * 0.7) / 2,
      )
      ctx.font = font
    }

    const colCount = table.columns.length

    // 表头背景
    ctx.fillStyle = config.colors.headerBg
    ctx.fillRect(
      ox + config.cellPadding,
      oy + layout.headerY,
      layout.tableWidth - config.cellPadding * 2,
      config.headerHeight,
    )

    // 列高亮背景（覆盖表头+全部行）
    if (highlightColumns?.length) {
      ctx.fillStyle = config.colors.highlightBg
      for (const c of highlightColumns) {
        if (c < 0 || c >= colCount) continue
        const x = ox + layout.colX[c]
        const w = layout.colWidths[c]
        ctx.fillRect(
          x,
          oy + layout.headerY,
          w,
          config.headerHeight + table.rows.length * config.rowHeight,
        )
      }
    }

    // 表头文字
    ctx.fillStyle = config.colors.text
    ctx.textAlign = 'left'
    for (let c = 0; c < colCount; c++) {
      const x = ox + layout.colX[c] + config.cellPadding
      const y = oy + layout.headerY + config.headerHeight / 2
      ctx.font = `600 ${config.fontSize}px ui-monospace, monospace`
      ctx.fillText(table.columns[c], x, y)
      ctx.font = font
    }

    // 数据行
    for (let r = 0; r < table.rows.length; r++) {
      const rowY = oy + layout.rowY[r] + (rowOffsetY?.[r] ?? 0)
      const a = rowAlpha?.[r] ?? 1
      if (a <= 0) continue
      const isRowHi = highlightRows?.includes(r)

      if (isRowHi) {
        ctx.fillStyle = config.colors.highlightBg
        ctx.fillRect(
          ox + config.cellPadding,
          rowY,
          layout.tableWidth - config.cellPadding * 2,
          config.rowHeight,
        )
      }

      ctx.globalAlpha = alpha * a
      for (let c = 0; c < colCount; c++) {
        const cell = table.rows[r][c]
        const x = ox + layout.colX[c] + config.cellPadding
        const y = rowY + config.rowHeight / 2
        if (cell == null) {
          ctx.fillStyle = config.colors.mutedText
          ctx.fillText('—', x, y)
        } else {
          ctx.fillStyle = config.colors.text
          // 超长截断
          const maxW = layout.colWidths[c] - config.cellPadding * 2
          this.fillTextClipped(cell, x, y, maxW)
        }
      }
      ctx.globalAlpha = alpha
    }

    // 网格边框
    ctx.strokeStyle = config.colors.border
    ctx.lineWidth = 1
    const gridX = ox + config.cellPadding
    const gridW = layout.tableWidth - config.cellPadding * 2
    const gridY = oy + layout.headerY
    const gridH = config.headerHeight + table.rows.length * config.rowHeight
    ctx.strokeRect(gridX, gridY, gridW, gridH)
    // 列分隔线
    for (let c = 1; c < colCount; c++) {
      const x = ox + layout.colX[c]
      ctx.beginPath()
      ctx.moveTo(x, gridY)
      ctx.lineTo(x, gridY + gridH)
      ctx.stroke()
    }
    // 行分隔线（表头底）
    ctx.beginPath()
    ctx.moveTo(gridX, gridY + config.headerHeight)
    ctx.lineTo(gridX + gridW, gridY + config.headerHeight)
    ctx.stroke()

    ctx.restore()
  }

  /** 绘制单行（按源表行索引），用于动画中绘制移动/淡入的单行 */
  drawRow(
    table: TableData,
    layout: LayoutInfo,
    rowIndex: number,
    opts: { offsetX?: number; offsetY?: number; alpha?: number; color?: string } = {},
  ): void {
    const { ctx, config } = this
    const ox = opts.offsetX ?? this.centerOffsetX(layout)
    const oy = opts.offsetY ?? this.centerOffsetY(layout)
    const font = fontStr(config)
    const row = table.rows[rowIndex]
    if (!row) return
    const rowY = oy + layout.rowY[rowIndex] + (opts.offsetY ? 0 : 0)

    ctx.save()
    ctx.globalAlpha = opts.alpha ?? 1
    ctx.font = font
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'

    if (opts.color) {
      ctx.fillStyle = opts.color
      ctx.fillRect(
        ox + config.cellPadding,
        rowY,
        layout.tableWidth - config.cellPadding * 2,
        config.rowHeight,
      )
    }

    for (let c = 0; c < table.columns.length; c++) {
      const cell = row[c]
      const x = ox + layout.colX[c] + config.cellPadding
      const y = rowY + config.rowHeight / 2
      if (cell == null) {
        ctx.fillStyle = config.colors.mutedText
        ctx.fillText('—', x, y)
      } else {
        ctx.fillStyle = config.colors.text
        this.fillTextClipped(cell, x, y, layout.colWidths[c] - config.cellPadding * 2)
      }
    }
    // 行边框
    ctx.strokeStyle = config.colors.border
    ctx.lineWidth = 1
    ctx.strokeRect(
      ox + config.cellPadding,
      rowY,
      layout.tableWidth - config.cellPadding * 2,
      config.rowHeight,
    )
    ctx.restore()
  }

  /** 单元格背景高亮 */
  drawCellHighlight(
    layout: LayoutInfo,
    col: number,
    row: number,
    color: string,
    opts: { offsetX?: number; offsetY?: number; rowYOverride?: number } = {},
  ): void {
    const { ctx, config } = this
    const ox = opts.offsetX ?? this.centerOffsetX(layout)
    const oy = opts.offsetY ?? this.centerOffsetY(layout)
    const x = ox + layout.colX[col]
    const y = opts.rowYOverride ?? oy + layout.rowY[row]
    ctx.save()
    ctx.fillStyle = color
    ctx.fillRect(x, y, layout.colWidths[col], config.rowHeight)
    ctx.restore()
  }

  /** 文本超宽截断（带省略号） */
  private fillTextClipped(text: string, x: number, y: number, maxW: number): void {
    const { ctx } = this
    if (ctx.measureText(text).width <= maxW) {
      ctx.fillText(text, x, y)
      return
    }
    let lo = 0
    let hi = text.length
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (ctx.measureText(text.slice(0, mid) + '…').width <= maxW) lo = mid
      else hi = mid - 1
    }
    ctx.fillText(text.slice(0, lo) + '…', x, y)
  }
}
