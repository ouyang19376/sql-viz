import { Play, Pause, SkipBack, SkipForward, RotateCcw } from 'lucide-react'
import type { AnimState } from '@/types/engine'

interface Props {
  state: AnimState
  speed: number
  onPlay: () => void
  onPause: () => void
  onReset: () => void
  onPrevStep: () => void
  onNextStep: () => void
  onSpeedChange: (speed: number) => void
}

const SPEEDS = [0.5, 1, 2]

/** 播放控制条（F-AN-01 / F-AN-03 / F-AN-04） */
export default function PlaybackControls({
  state,
  speed,
  onPlay,
  onPause,
  onReset,
  onPrevStep,
  onNextStep,
  onSpeedChange,
}: Props) {
  const isPlaying = state === 'playing'
  const playBtn = (
    <button
      type="button"
      onClick={isPlaying ? onPause : onPlay}
      aria-label={isPlaying ? '暂停' : '播放'}
      className="dialect-bg flex h-9 w-9 items-center justify-center rounded-full text-white transition-opacity hover:opacity-90"
    >
      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
    </button>
  )

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onPrevStep}
          aria-label="上一步"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        {playBtn}
        <button
          type="button"
          onClick={onNextStep}
          aria-label="下一步"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <SkipForward className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onReset}
          aria-label="重置"
          className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-1">
        <span className="mr-1 text-xs text-gray-400">速度</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSpeedChange(s)}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              speed === s
                ? 'dialect-bg-soft dialect-text'
                : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  )
}
