import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnimationStep } from '@/types/animation'
import { AnimState } from '@/types/engine'
import { CanvasEngine } from '@/engine/CanvasEngine'
import { AnimationController } from '@/engine/AnimationController'

interface Options {
  steps: AnimationStep[]
  dialectColor: string
  autoPlay?: boolean
  speed?: number
  onStepChange?: (stepIndex: number, step: AnimationStep) => void
  onComplete?: () => void
}

interface ControllerHandle {
  controller: AnimationController | null
  animState: AnimState
  currentStep: number
  totalSteps: number
}

/**
 * 管理 AnimationController + CanvasEngine 生命周期。
 * - engine/controller 在 canvas 有尺寸后创建
 * - 卸载 / 方言色变化时清理（StrictMode 双挂载安全）
 * - steps 变化重新 loadSteps + autoPlay
 */
export function useAnimationController(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  containerSize: { width: number; height: number },
  {
    steps,
    dialectColor,
    autoPlay = true,
    speed = 1,
    onStepChange,
    onComplete,
  }: Options,
): ControllerHandle {
  const [animState, setAnimState] = useState<AnimState>(AnimState.IDLE)
  const [currentStep, setCurrentStep] = useState(0)
  const [ready, setReady] = useState(false)
  const controllerRef = useRef<AnimationController | null>(null)
  const engineRef = useRef<CanvasEngine | null>(null)
  const mountedRef = useRef(true)

  // 回调与配置存 ref，避免 effect 频繁重建
  const cbRef = useRef({ onStepChange, onComplete })
  cbRef.current.onStepChange = onStepChange
  cbRef.current.onComplete = onComplete
  const stepsRef = useRef(steps)
  const autoPlayRef = useRef(autoPlay)
  stepsRef.current = steps
  autoPlayRef.current = autoPlay

  // 首次拿到非零尺寸后置 ready（仅触发一次 controller 创建）
  useEffect(() => {
    if (!ready && containerSize.width > 0 && containerSize.height > 0) {
      setReady(true)
    }
  }, [ready, containerSize.width, containerSize.height])

  // 创建 engine + controller（依赖 ready + dialectColor；尺寸变化由下方 resize effect 处理）
  useEffect(() => {
    mountedRef.current = true
    if (!ready) return
    const canvas = canvasRef.current
    if (!canvas) return

    const engine = new CanvasEngine(canvas, undefined, dialectColor)
    engineRef.current = engine

    const controller = new AnimationController(engine)
    controller.onStepChange = (idx) => {
      if (!mountedRef.current) return
      setCurrentStep(idx)
      cbRef.current.onStepChange?.(idx, controller.steps[idx])
    }
    controller.onComplete = () => {
      if (!mountedRef.current) return
      setAnimState(AnimState.FINISHED)
      cbRef.current.onComplete?.()
    }
    controllerRef.current = controller

    // 创建后立即加载当前 steps
    controller.loadSteps(stepsRef.current)
    if (stepsRef.current.length > 0 && autoPlayRef.current) {
      controller.play()
      setAnimState(AnimState.PLAYING)
    }

    return () => {
      mountedRef.current = false
      controller.dispose()
      controllerRef.current = null
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, dialectColor])

  // 容器尺寸变化 → 仅 resize + 重绘当前帧，不重建 controller（保留播放进度）
  useEffect(() => {
    const engine = engineRef.current
    const controller = controllerRef.current
    if (!engine || !controller) return
    if (containerSize.width === 0 || containerSize.height === 0) return
    engine.resize(containerSize.width, containerSize.height)
    controller.redraw()
  }, [containerSize.width, containerSize.height])

  // steps / autoPlay 变化 → 重新 loadSteps + autoPlay
  useEffect(() => {
    const controller = controllerRef.current
    if (!controller) return
    controller.loadSteps(steps)
    if (steps.length > 0 && autoPlay) {
      controller.play()
      setAnimState(AnimState.PLAYING)
    } else {
      setAnimState(AnimState.IDLE)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps])

  // speed 变化
  useEffect(() => {
    controllerRef.current?.setSpeed(speed)
  }, [speed])

  return {
    controller: controllerRef.current,
    animState,
    currentStep,
    totalSteps: steps.length,
  }
}

/** 包装控制器动作并在 play/pause 时同步 animState */
export function usePlayerActions(handle: ControllerHandle) {
  const play = useCallback(() => {
    handle.controller?.play()
    // PLAYING 态由 tick 内部维持；这里乐观更新
  }, [handle.controller])

  const pause = useCallback(() => {
    handle.controller?.pause()
  }, [handle.controller])

  const reset = useCallback(() => {
    handle.controller?.reset()
  }, [handle.controller])

  const goToStep = useCallback(
    (i: number) => {
      handle.controller?.goToStep(i)
    },
    [handle.controller],
  )

  const nextStep = useCallback(() => {
    handle.controller?.nextStep()
  }, [handle.controller])

  const prevStep = useCallback(() => {
    handle.controller?.prevStep()
  }, [handle.controller])

  return { play, pause, reset, goToStep, nextStep, prevStep }
}
