import { AlertTriangle } from 'lucide-react'

interface Props {
  message: string
  onDismiss?: () => void
}

export default function RefusalAlert({ message, onDismiss }: Props) {
  return (
    <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            分析请求被拒
          </div>
          <p className="mt-1">{message}</p>
        </div>
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="text-xs text-red-500 hover:text-red-700 dark:text-red-300">
            关闭
          </button>
        )}
      </div>
    </div>
  )
}
