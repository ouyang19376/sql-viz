import type { AnimationStep, Operation } from '@/types/animation'
import { AnimState } from '@/types/engine'
import type { CanvasEngine } from './CanvasEngine'
import type { RendererRegistry } from './rendererTypes'
import { renderers as defaultRenderers } from './renderers'

/** 各 operation 默认持续时间（ms），取自 PRD F-AN-05~14 */
const BASE_DURATION: Record<Operation, number> = {
  show_source: 800,
  show_result: 800,
  highlight_rows: 800,
  filter_rows: 1000,
  sort_rows: 1200,
  group_rows: 1500,
  limit_rows: 800,
  select_columns: 800,
  add_column: 600,
  rename_column: 600,
  transform_values: 1000,
  aggregate_values: 1200,
  join_tables: 1500,
  union_tables: 1000,
  show_graph: 800,
  highlight_path: 800,
}

const INTER_STEP_PAUSE = 300 // 步间停顿 ms

/**
 * 动画状态机 + 帧循环（纯 TS，零 React 依赖）。
 * IDLE → PLAYING → (PAUSED) → PLAYING；末步完成 → FINISHED。
 */
export class AnimationController {
  private engine: CanvasEngine
  private registry: RendererRegistry
  steps: AnimationStep[] = []
  currentStep = 0
  state: AnimState = AnimState.IDLE
  speed = 1
  private frameId: number | null = null
  private stepStartTime = 0
  private rafBound: (ts: number) => void

  onStepChange?: (stepIndex: number) => void
  onComplete?: () => void

  constructor(
    engine: CanvasEngine,
    registry: RendererRegistry = defaultRenderers,
  ) {
    this.engine = engine
    this.registry = registry
    this.rafBound = this.tick.bind(this)
  }

  loadSteps(steps: AnimationStep[]): void {
    this.steps = steps
    this.reset()
  }

  play(): void {
    if (this.steps.length === 0) return
    if (this.state === AnimState.FINISHED) {
      this.reset()
    }
    this.state = AnimState.PLAYING
    this.stepStartTime = performance.now()
    if (this.frameId == null) {
      this.frameId = requestAnimationFrame(this.rafBound)
    }
  }

  pause(): void {
    if (this.state !== AnimState.PLAYING) return
    this.state = AnimState.PAUSED
    this.cancelFrame()
  }

  reset(): void {
    this.cancelFrame()
    this.currentStep = 0
    this.state = AnimState.IDLE
    this.engine.clear()
    if (this.steps.length > 0) {
      this.renderCurrentStep(0)
    }
    this.onStepChange?.(0)
  }

  /** 跳到指定步骤完成态（瞬间，跳过动画） */
  goToStep(index: number): void {
    this.cancelFrame()
    this.currentStep = Math.max(0, Math.min(index, this.steps.length - 1))
    this.state = AnimState.PAUSED
    this.engine.clear()
    this.renderCurrentStep(1)
    this.onStepChange?.(this.currentStep)
  }

  nextStep(): void {
    this.goToStep(this.currentStep + 1)
  }

  prevStep(): void {
    this.goToStep(this.currentStep - 1)
  }

  setSpeed(speed: number): void {
    this.speed = speed
  }

  private cancelFrame(): void {
    if (this.frameId != null) {
      cancelAnimationFrame(this.frameId)
      this.frameId = null
    }
  }

  private tick(timestamp: number): void {
    if (this.state !== AnimState.PLAYING) {
      this.frameId = null
      return
    }
    const step = this.steps[this.currentStep]
    if (!step) {
      this.frameId = null
      return
    }
    const base = BASE_DURATION[step.operation] ?? 1000
    const scaled = (base * (step.duration_scale ?? 1)) / this.speed
    const pause = INTER_STEP_PAUSE / this.speed
    const elapsed = timestamp - this.stepStartTime

    if (elapsed < scaled) {
      this.renderCurrentStep(elapsed / scaled)
    } else if (elapsed < scaled + pause) {
      this.renderCurrentStep(1)
    } else {
      this.renderCurrentStep(1)
      this.advanceStep()
      return
    }
    this.frameId = requestAnimationFrame(this.rafBound)
  }

  private advanceStep(): void {
    if (this.currentStep >= this.steps.length - 1) {
      this.state = AnimState.FINISHED
      this.cancelFrame()
      this.onComplete?.()
      return
    }
    this.currentStep += 1
    this.stepStartTime = performance.now()
    this.onStepChange?.(this.currentStep)
    this.frameId = requestAnimationFrame(this.rafBound)
  }

  /** 绘制当前步骤的某一帧（progress 0~1） */
  private renderCurrentStep(progress: number): void {
    const step = this.steps[this.currentStep]
    if (!step) return
    this.engine.clear()
    const fn = this.registry.get(step.operation)
    const maxWidth = this.engine.config.width - this.engine.config.cellPadding * 2
    if (fn) {
      fn(this.engine, progress, step, maxWidth)
    } else {
      // fallback：绘制终态结果表
      const table = this.registry.getResultTable(step)
      if (table) this.engine.drawTable(table)
    }
  }

  /** 重绘当前帧（容器 resize 后调用） */
  redraw(): void {
    this.engine.clear()
    const step = this.steps[this.currentStep]
    if (!step) return
    // IDLE 渲染初始态(progress 0)，其余态渲染完成态(progress 1)；
    // 播放中 resize 会瞬间显示完成态，下一帧 tick 立即修正为当前进度。
    const progress = this.state === AnimState.IDLE ? 0 : 1
    const fn = this.registry.get(step.operation)
    const maxWidth = this.engine.config.width - this.engine.config.cellPadding * 2
    if (fn) fn(this.engine, progress, step, maxWidth)
    else {
      const table = this.registry.getResultTable(step)
      if (table) this.engine.drawTable(table)
    }
  }

  dispose(): void {
    this.cancelFrame()
    this.onStepChange = undefined
    this.onComplete = undefined
  }
}
