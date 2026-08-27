import { useRef, useState } from 'react'
import { PanelLeft } from 'lucide-react'
import { streamChat } from '@/api/kbqa'
import { useKbqaStore } from '@/stores/useKbqaStore'
import ChatComposer from './ChatComposer'
import ChatWindow from './ChatWindow'
import SessionSidebar from './SessionSidebar'

/** 知识库问答主页：左侧多会话侧边栏（移动端抽屉）+ 右侧聊天窗口。
 *  流式链路复用 rag-sql 的检索/embedding/rerank 设施，SSE：meta -> delta* -> done。 */
export default function KbqaPage() {
  const sessions = useKbqaStore((s) => s.sessions)
  const currentSessionId = useKbqaStore((s) => s.currentSessionId)

  const [streaming, setStreaming] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const ctrlRef = useRef<AbortController | null>(null)

  const current = sessions.find((s) => s.id === currentSessionId) ?? null

  const send = (question: string) => {
    const st = useKbqaStore.getState()
    const q = question.trim()
    if (!q || streaming) return
    // 无会话则先新建（含当前会话为空会话的场景）
    const id = st.currentSessionId ?? st.newSession()
    st.appendUserMessage(id, q)
    st.startAssistant(id)
    setStreaming(true)

    const history = useKbqaStore.getState().getHistory(id)
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    streamChat(
      { question: q, conversationId: id, history },
      {
        onMeta: (m) =>
          useKbqaStore
            .getState()
            .setAssistantMeta(id, {
              sources: m.sources,
              degraded: m.degraded,
              degradeReason: m.degradeReason ?? null,
            }),
        onDelta: (d) => useKbqaStore.getState().appendDelta(id, d),
        onDone: (done) => {
          useKbqaStore.getState().finishAssistant(id, done)
          setStreaming(false)
        },
        onError: (message) => {
          useKbqaStore.getState().failAssistant(id, message)
          setStreaming(false)
        },
      },
      ctrl.signal,
    )
  }

  const stop = () => {
    ctrlRef.current?.abort()
    setStreaming(false)
    // 流式中断：把已生成的部分落盘（不标错误）
    if (currentSessionId) useKbqaStore.getState().stopAssistant(currentSessionId)
  }

  const handleNew = () => {
    useKbqaStore.getState().newSession()
    setDrawerOpen(false)
  }

  return (
    <div className="flex h-[calc(100vh-7.5rem)] gap-4">
      {/* 会话侧边栏：>=768px 常驻 */}
      <aside className="hidden w-56 shrink-0 md:block lg:w-64">
        <SessionSidebar
          sessions={sessions}
          currentSessionId={currentSessionId}
          onNew={handleNew}
          onSwitch={(id) => useKbqaStore.getState().switchSession(id)}
          onRemove={(id) => useKbqaStore.getState().removeSession(id)}
        />
      </aside>

      {/* 聊天区 */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface">
        <header className="flex items-center gap-2 border-b border-line px-3 py-2.5 sm:px-4">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="打开会话列表"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-mute transition-colors hover:bg-surface-2 hover:text-ink md:hidden"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <h1 className="truncate text-sm font-semibold text-ink">
            {current?.title ?? '知识库问答'}
          </h1>
          {streaming && (
            <span className="ml-auto shrink-0 text-xs text-accent">生成中…</span>
          )}
        </header>

        <div className="min-h-0 flex-1">
          <ChatWindow turns={current?.turns ?? []} streaming={streaming} onAsk={send} />
        </div>

        <ChatComposer onSend={send} onStop={stop} streaming={streaming} />
      </section>

      {/* 移动端会话抽屉 */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div className="fixed inset-y-0 left-0 z-50 w-64 max-w-[80vw] p-3 md:hidden">
            <SessionSidebar
              sessions={sessions}
              currentSessionId={currentSessionId}
              onNew={handleNew}
              onSwitch={(id) => {
                useKbqaStore.getState().switchSession(id)
                setDrawerOpen(false)
              }}
              onRemove={(id) => useKbqaStore.getState().removeSession(id)}
              onClose={() => setDrawerOpen(false)}
            />
          </div>
        </>
      )}
    </div>
  )
}
