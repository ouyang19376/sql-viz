import { FileSpreadsheet } from 'lucide-react'
import type { DatasetMeta } from '@/types/bi'

interface Props {
  datasets: DatasetMeta[]
  activeId: string | null
  checkedIds: Set<string>
  onSelect: (dataset: DatasetMeta) => void
  onToggleCheck: (id: string) => void
}

/** 时间裁剪到「分钟」展示；createdAt 为 ISO（如 2026-06-26T10:00:00）。 */
function shortTime(iso: string): string {
  return iso.replace('T', ' ').slice(5, 16)
}

/** F-DS-06：单选选中（行点击）+ F-DS-07：勾选框多选（批量删除）。 */
export default function DatasetList({
  datasets,
  activeId,
  checkedIds,
  onSelect,
  onToggleCheck,
}: Props) {
  return (
    <ul className="space-y-1.5">
      {datasets.map((ds) => {
        const active = ds.id === activeId
        return (
          <li key={ds.id}>
            <div
              className={
                'flex items-start gap-2 rounded-lg border px-2.5 py-2 transition-colors ' +
                (active
                  ? 'border-indigo-300 bg-indigo-50/60 dark:border-indigo-500/50 dark:bg-indigo-500/10'
                  : 'border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50')
              }
            >
              <input
                type="checkbox"
                checked={checkedIds.has(ds.id)}
                onChange={() => onToggleCheck(ds.id)}
                aria-label={`勾选 ${ds.name}`}
                className="mt-1 h-3.5 w-3.5 shrink-0 cursor-pointer accent-indigo-600"
              />
              <button
                type="button"
                onClick={() => onSelect(ds)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800 dark:text-gray-100">
                  <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <span className="truncate">{ds.name}</span>
                </span>
                <span className="mt-0.5 block text-xs text-gray-400 dark:text-gray-500">
                  {ds.rowCount} 行 · {shortTime(ds.createdAt)}
                </span>
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
