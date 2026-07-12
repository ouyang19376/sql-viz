import { useEffect, useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'

interface Props {
  label: string
  value?: string
  placeholder?: string
  /** 多行（描述等）用 textarea */
  multiline?: boolean
  onChange: (v: string) => void
}

/** 可编辑字段（F-CK-05）：默认只读展示，点「编辑」切输入态，保存后固定为只读。
 *  仅在保存时回写 onChange，避免编辑中途污染外部状态。 */
export default function EditableField({ label, value, placeholder, multiline, onChange }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  useEffect(() => {
    if (!editing) setDraft(value ?? '')
  }, [value, editing])

  if (editing) {
    const save = () => {
      onChange(draft)
      setEditing(false)
    }
    const cancel = () => {
      setDraft(value ?? '')
      setEditing(false)
    }
    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
        <div className="flex items-start gap-2">
          {multiline ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              rows={3}
              autoFocus
              className="min-w-0 flex-1 resize-y rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-800 outline-none focus:border-emerald-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          ) : (
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              autoFocus
              className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-800 outline-none focus:border-emerald-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          )}
          <button
            type="button"
            onClick={save}
            title="保存"
            className="shrink-0 rounded-md bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={cancel}
            title="取消"
            className="shrink-0 rounded-md border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <div className="min-w-0">
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</div>
        <div className="truncate text-sm text-gray-800 dark:text-gray-100">{value || '—'}</div>
      </div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="编辑"
        className="shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
