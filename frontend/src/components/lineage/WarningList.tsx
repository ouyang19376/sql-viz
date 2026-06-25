import { AlertTriangle } from 'lucide-react'

interface Props {
  warnings: string[]
}

/** F-LN-09：解析警告展示。 */
export default function WarningList({ warnings }: Props) {
  if (warnings.length === 0) return null
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4" />
        解析警告
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {warnings.map((warning, index) => (
          <li key={`${warning}-${index}`}>{warning}</li>
        ))}
      </ul>
    </div>
  )
}
