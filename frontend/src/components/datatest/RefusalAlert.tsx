import { useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'

interface Props {
  message: string
  onDismiss: () => void
}

/** F-DT-10：偏离意图拦截提示（红色 Alert）。
 *  Esc 关闭（PRD §7.4）。 */
export default function RefusalAlert({ message, onDismiss }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  return (
    <div
      role="alert"
      className="mt-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <p className="flex-1">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="关闭"
        className="rounded p-0.5 text-red-400 hover:bg-red-100 hover:text-red-600"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
