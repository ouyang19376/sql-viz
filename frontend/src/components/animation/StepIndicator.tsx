import type { AnimationStep } from '@/types/animation'

interface Props {
  steps: AnimationStep[]
  current: number
  /** 动画是否已完成：true 时所有圆点按已播放态渲染（PRD §7.2 / §7.6）。 */
  finished?: boolean
  onStepClick: (index: number) => void
}

/**
 * 步骤指示器（F-AN-02 / F-AN-03）：
 * ● 已播放 ◎ 当前 ○ 未播放；hover 显示标题；点击跳转。
 * 完成态（finished=true）：全部圆点显示为已播放态，与 ▶ 按钮一同向用户表明动画已结束。
 */
export default function StepIndicator({ steps, current, finished, onStepClick }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        {steps.map((step, i) => {
          const isCurrent = !finished && i === current
          const isPlayed = finished || i < current
          return (
            <button
              key={i}
              type="button"
              title={step.title}
              aria-label={`步骤 ${i + 1}：${step.title}`}
              onClick={() => onStepClick(i)}
              className="group relative flex h-5 w-5 items-center justify-center"
            >
              {isCurrent ? (
                <span className="dialect-bg block h-3 w-3 rounded-full ring-2 ring-offset-1" style={{ ['--tw-ring-color' as string]: 'var(--dialect-color)' }} />
              ) : isPlayed ? (
                <span className="dialect-bg block h-2.5 w-2.5 rounded-full transition-opacity group-hover:opacity-80" />
              ) : (
                <span className="block h-2.5 w-2.5 rounded-full border border-gray-300 bg-white transition-colors group-hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800" />
              )}
            </button>
          )
        })}
      </div>
      <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
        {current + 1} / {steps.length}
        {steps[current]?.title ? ` · ${steps[current].title}` : ''}
      </span>
    </div>
  )
}
