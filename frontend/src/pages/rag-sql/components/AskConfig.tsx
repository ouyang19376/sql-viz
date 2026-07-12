import { useState } from 'react'
import { MessageSquarePlus, MessagesSquare } from 'lucide-react'
import ConfirmDialog from '@/components/bi/ConfirmDialog'
import { RAG_DIALECT_LABELS, type RagDialect } from '@/types/rag-sql'
import { hasActiveConversation, useRagSqlStore } from '@/stores/useRagSqlStore'

/** 问答配置（F-AS-01 方言 / F-AS-02 多轮开关 / F-AS-13 新建会话）。
 *  multiTurn + conversations 跨刷新持久化（store 内 localStorage）；关多轮若有未结会话二次确认（§7.3）。 */
export default function AskConfig() {
  const dialect = useRagSqlStore((s) => s.dialect)
  const setDialect = useRagSqlStore((s) => s.setDialect)
  const multiTurn = useRagSqlStore((s) => s.multiTurn)
  const setMultiTurn = useRagSqlStore((s) => s.setMultiTurn)
  const confirmToggleMultiTurnOff = useRagSqlStore((s) => s.confirmToggleMultiTurnOff)
  const newConversation = useRagSqlStore((s) => s.newConversation)
  const [confirmOff, setConfirmOff] = useState(false)

  const handleToggle = (next: boolean) => {
    if (!next && multiTurn && hasActiveConversation(useRagSqlStore.getState())) {
      setConfirmOff(true) // 关闭多轮且当前会话有历史 -> 二次确认
    } else {
      setMultiTurn(next)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500 dark:text-gray-400">方言</label>
        <select
          value={dialect}
          onChange={(e) => setDialect(e.target.value as RagDialect)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-700 focus:border-emerald-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        >
          {Object.entries(RAG_DIALECT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={multiTurn}
          onClick={() => handleToggle(!multiTurn)}
          className={
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors ' +
            (multiTurn ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600')
          }
        >
          <span
            className={
              'inline-block h-4 w-4 transform rounded-full bg-white transition-transform ' +
              (multiTurn ? 'translate-x-4' : 'translate-x-0.5')
            }
          />
        </button>
        <span className="inline-flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
          <MessagesSquare className="h-4 w-4 text-gray-400" />
          多轮会话
        </span>
      </div>

      {multiTurn && (
        <button
          type="button"
          onClick={newConversation}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <MessageSquarePlus className="h-4 w-4" />
          新建会话
        </button>
      )}

      <ConfirmDialog
        open={confirmOff}
        title="关闭多轮会话？"
        message="关闭多轮将清空当前会话历史，是否继续？"
        confirmLabel="关闭并清空"
        onConfirm={() => {
          confirmToggleMultiTurnOff()
          setConfirmOff(false)
        }}
        onCancel={() => setConfirmOff(false)}
      />
    </div>
  )
}
