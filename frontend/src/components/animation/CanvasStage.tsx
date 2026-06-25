import { forwardRef } from 'react'

interface Props {
  className?: string
}

/**
 * Canvas 舞台：仅承载 <canvas>，由父组件通过 ref 持有 canvas 引用，
 * 容器尺寸由父组件的 useResizeObserver 监听。高度按断点固定。
 */
const CanvasStage = forwardRef<HTMLCanvasElement, Props>(function CanvasStage(
  { className = '' },
  ref,
) {
  return (
    <div className={`relative w-full ${className}`}>
      <canvas ref={ref} className="block h-full w-full rounded-lg" />
    </div>
  )
})

export default CanvasStage
