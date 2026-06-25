/**
 * Canvas 引擎相关类型（animation-engine-design.md §5）
 */

/** 动画状态机 */
export enum AnimState {
  IDLE = 'idle',
  PLAYING = 'playing',
  PAUSED = 'paused',
  FINISHED = 'finished',
}

export interface Point {
  x: number
  y: number
}

/** 渲染配置 */
export interface RenderConfig {
  width: number
  height: number
  dpr: number
  cellPadding: number
  headerHeight: number
  rowHeight: number
  fontSize: number
  /** 方言主题色（hex），用于高亮背景等派生色 */
  dialectColor: string
  colors: {
    bg: string
    headerBg: string
    border: string
    text: string
    mutedText: string
    highlightBg: string
    removedBg: string
    addedBg: string
  }
}

/** 表格布局信息（逻辑像素坐标） */
export interface LayoutInfo {
  tableWidth: number
  tableHeight: number
  colX: number[]
  colWidths: number[]
  rowY: number[]
  headerY: number
  captionY: number
}

/** drawTable / drawRows 选项 */
export interface DrawOptions {
  highlightColumns?: number[]
  highlightRows?: number[]
  alpha?: number
  /** 行级覆盖透明度（按源表行索引），用于过滤动画中移除行淡出 */
  rowAlpha?: number[]
  /** 行级 y 偏移（按源表行索引），用于排序/聚拢动画 */
  rowOffsetY?: number[]
}
