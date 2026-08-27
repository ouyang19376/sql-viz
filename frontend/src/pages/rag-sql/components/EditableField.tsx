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
        <label className="text-xs font-medium text-mute">{label}</label>
        <div className="flex items-start gap-2">
          {multiline ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              rows={3}
              autoFocus
              className="min-w-0 flex-1 resize-y rounded-md border border-line px-2 py-1 text-sm text-ink outline-none focus:border-accent bg-surface"
            />
          ) : (
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              autoFocus
              className="min-w-0 flex-1 rounded-md border border-line px-2 py-1 text-sm text-ink outline-none focus:border-accent bg-surface"
            />
          )}
          <button
            type="button"
            onClick={save}
            title="保存"
            className="shrink-0 rounded-md bg-accent p-1.5 text-white hover:bg-accent-strong"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={cancel}
            title="取消"
            className="shrink-0 rounded-md border border-line p-1.5 text-ink-2 hover:bg-surface-2"
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
        <div className="text-xs font-medium text-mute">{label}</div>
        <div className="truncate text-sm text-ink">{value || '—'}</div>
      </div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="编辑"
        className="shrink-0 rounded-md p-1 text-mute transition-colors hover:bg-surface-2 hover:text-ink-2"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
