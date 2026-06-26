import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { AnimationStep } from '@/types/animation'
import { AnimState } from '@/types/engine'
import { useResizeObserver } from '@/hooks/useResizeObserver'
import {
  useAnimationController,
  usePlayerActions,
} from '@/hooks/useAnimationController'
import CanvasStage from './CanvasStage'
import StepIndicator from './StepIndicator'
import PlaybackControls from './PlaybackControls'
import EmptyState from '@/components/shared/EmptyState'

interface Props {
  steps: AnimationStep[]
  dialectColor: string
  autoPlay?: boolean
  onStepChange?: (stepIndex: number, step: AnimationStep) => void
  className?: string
}

/** 对外命令式句柄：供父组件触发跳步（F-SC-04 SQL 行点击 → 动画跳转）
 *  以及键盘快捷键 §7.4（Space/←/→/R） */
export interface AnimationPlayerHandle {
  goToStep: (index: number) => void
  togglePlay: () => void
  prevStep: () => void
  nextStep: () => void
  reset: () => void
}

/**
 * 动画播放器容器（F-AN-01 ~ F-AN-04）：
 * 组合 StepIndicator + CanvasStage + PlaybackControls；
 * 移动端同样使用 Canvas 播放（不再降级为静态表）。
 */
export default forwardRef<AnimationPlayerHandle, Props>(function AnimationPlayer(
  {
    steps,
    dialectColor,
    autoPlay = true,
    onStepChange,
    className = '',
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // 容器 ref（用 useResizeObserver 内部创建）
  const { ref: containerRef, size } = useResizeObserver<HTMLDivElement>()
  const [speed, setSpeed] = useState(1)

  const handle = useAnimationController(canvasRef, size, {
    steps,
    dialectColor,
    autoPlay,
    speed,
    onStepChange,
  })
  const actions = usePlayerActions(handle)

  // 同步播放态到 UI（play/pause 即时反馈）
  const [uiState, setUiState] = useState<AnimState>(AnimState.IDLE)
  useEffect(() => {
    setUiState(handle.animState)
  }, [handle.animState])

  const onPlay = () => {
    if (handle.animState === AnimState.FINISHED) {
      handle.controller?.reset()
    }
    handle.controller?.play()
    setUiState(AnimState.PLAYING)
  }
  const onPause = () => {
    handle.controller?.pause()
    setUiState(AnimState.PAUSED)
  }
  const onReset = () => {
    handle.controller?.reset()
    setUiState(AnimState.IDLE)
  }
  const onGoToStep = (i: number) => {
    handle.controller?.goToStep(i)
    setUiState(AnimState.PAUSED)
  }

  // 对外暴露跳步能力（供 SC 模块 onLineClick 联动）与播放控制（供 §7.4 键盘快捷键）
  useImperativeHandle(
    ref,
    () => ({
      goToStep: (index: number) => {
        handle.controller?.goToStep(index)
        setUiState(AnimState.PAUSED)
      },
      togglePlay: () => {
        if (handle.animState === AnimState.PLAYING) onPause()
        else onPlay()
      },
      prevStep: () => {
        actions.prevStep()
        setUiState(AnimState.PAUSED)
      },
      nextStep: () => {
        actions.nextStep()
        setUiState(AnimState.PAUSED)
      },
      reset: () => onReset(),
    }),
    // 依赖列表需覆盖闭包内引用，避免动作执行旧 state
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handle.controller, handle.animState],
  )

  if (steps.length === 0) {
    return (
      <EmptyState
        title="该函数暂无动画演示"
        description="此函数未配置可视化动画步骤"
      />
    )
  }

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <StepIndicator
        steps={steps}
        current={handle.currentStep}
        finished={uiState === AnimState.FINISHED}
        onStepClick={onGoToStep}
      />

      {/* Canvas：移动端同样显示，使其尺寸非零 → engine 初始化 → 可播放 */}
      <div ref={containerRef} className="h-[320px]">
        <CanvasStage ref={canvasRef} className="h-full border border-gray-200 bg-white dark:border-gray-800" />
      </div>

      <PlaybackControls
        state={uiState}
        speed={speed}
        onPlay={onPlay}
        onPause={onPause}
        onReset={onReset}
        onPrevStep={actions.prevStep}
        onNextStep={actions.nextStep}
        onSpeedChange={setSpeed}
      />
    </div>
  )
})
