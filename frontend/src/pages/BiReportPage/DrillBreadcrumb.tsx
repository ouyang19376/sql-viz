import { ChevronRight } from 'lucide-react'
import type { DrillLevel } from '@/types/bi'

interface Props {
  stack: DrillLevel[]
  /** 当前正在分组展示的维度（尚未下钻的层级），作为末尾灰字提示。 */
  currentField?: string
  /** 回退到指定深度：0 = 全部（清空下钻）。 */
  onJump: (depth: number) => void
}

/** F-VZ-04：面包屑上钻。展示当前下钻路径，点击层级回退到上层。 */
export default function DrillBreadcrumb({ stack, currentField, onJump }: Props) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="下钻路径">
      <button
        type="button"
        onClick={() => onJump(0)}
        className={
          'rounded px-1.5 py-0.5 transition-colors ' +
          (stack.length === 0
            ? 'font-medium text-gray-700 dark:text-gray-200'
            : 'text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10')
        }
      >
        全部
      </button>
      {stack.map((lvl, i) => {
        const isLast = i === stack.length - 1
        return (
          <span key={`${lvl.field}-${i}`} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
            <button
              type="button"
              onClick={() => onJump(i + 1)}
              disabled={isLast}
              className={
                'rounded px-1.5 py-0.5 transition-colors ' +
                (isLast
                  ? 'cursor-default font-medium text-gray-700 dark:text-gray-200'
                  : 'text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10')
              }
            >
              {lvl.field}: {lvl.value}
            </button>
          </span>
        )
      })}
      {currentField && (
        <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500">
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="px-1.5 py-0.5">{currentField}</span>
        </span>
      )}
    </nav>
  )
}
