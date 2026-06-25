import type { Operation, AnimationStep } from '@/types/animation'
import type { TableData } from '@/types/animation'
import type { CanvasEngine } from './CanvasEngine'

/** 渲染器签名：绘制一帧。
 * @param engine  引擎（提供 ctx、布局、绘制工具）
 * @param progress 0~1
 * @param step    当前步骤（payload 字段直接挂在 step 上）
 * @param maxWidth 画布可用宽度（用于列宽压缩）
 */
export type RenderFn = (
  engine: CanvasEngine,
  progress: number,
  step: AnimationStep,
  maxWidth: number,
) => void

export interface RendererRegistry {
  has: (op: Operation) => boolean
  get: (op: Operation) => RenderFn | undefined
  /** 获取某步骤「终态结果表」，用于响应式降级 TableView */
  getResultTable: (step: AnimationStep) => TableData | null
}
