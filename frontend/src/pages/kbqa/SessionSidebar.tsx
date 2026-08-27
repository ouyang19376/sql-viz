import { useState } from 'react'
import { MessageSquare, Plus, Trash2, X } from 'lucide-react'
import ConfirmDialog from '@/components/bi/ConfirmDialog'
import type { KbqaSession } from '@/stores/useKbqaStore'

interface Props {
  sessions: KbqaSession[]
  currentSessionId: string | null
  onNew: () => void
  onSwitch: (id: string) => void
  onRemove: (id: string) => void
  onClose?: () => void // 移动端抽屉关闭
}

/** 会话侧边栏：新建 / 切换 / 删除（二次确认）。>=768px 常驻，移动端为抽屉内容。 */
export default function SessionSidebar({
  sessions,
  currentSessionId,
  onNew,
  onSwitch,
  onRemove,
  onClose,
}: Props) {
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)

  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line p-3">
        <span className="flex-1 px-1 text-xs font-semibold uppercase tracking-wider text-mute">
          会话
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭会话列表"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-mute transition-colors hover:bg-surface-2 hover:text-ink md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="p-2">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
        >
          <Plus className="h-4 w-4" />
          新建会话
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2 pt-0" aria-label="会话列表">
        {sessions.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-mute">暂无历史会话</p>
        )}
        {sessions.map((s) => {
          const active = s.id === currentSessionId
          return (
            <div
              key={s.id}
              className={
                'group flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors ' +
                (active
                  ? 'bg-accent-soft text-accent'
                  : 'text-ink-2 hover:bg-surface-2 hover:text-ink')
              }
            >
              <MessageSquare className="h-4 w-4 shrink-0" />
              <button
                type="button"
                onClick={() => onSwitch(s.id)}
                className="min-w-0 flex-1 truncate text-left"
                title={s.title}
              >
                {s.title}
              </button>
              <button
                type="button"
                onClick={() => setPendingRemove(s.id)}
                aria-label={`删除会话 ${s.title}`}
                className="shrink-0 text-mute opacity-0 transition-opacity hover:text-red-500 focus:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </nav>

      <ConfirmDialog
        open={pendingRemove !== null}
        title="删除会话"
        message="删除后该会话的全部问答记录将无法恢复，确定删除吗？"
        onConfirm={() => {
          if (pendingRemove) onRemove(pendingRemove)
          setPendingRemove(null)
        }}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  )
}
