import { create } from 'zustand'
import type { AskSource } from '@/types/rag-sql'
import type { KbqaTurn } from '@/types/kbqa'

/** 聊天消息（本地态）：assistant 消息在流式期间逐步长出 content */
export interface KbqaMessage {
  role: 'user' | 'assistant'
  content: string
  ts: number
  sources?: AskSource[]
  degraded?: boolean
  degradeReason?: string | null
  error?: string
}

/** 会话：title 取首问截断 */
export interface KbqaSession {
  id: string
  title: string
  createdAt: number
  turns: KbqaMessage[]
}

/** 持久化键（§手动读写 localStorage，对齐 useRagSqlStore 范式，不引 persist 中间件） */
const STORE_KEY = 'kbqa.sessions'
/** 发给后端的历史轮数上限（与后端 RAG_HISTORY_MAX_TURNS=6 对齐） */
export const MAX_HISTORY_TURNS = 6
/** localStorage 护栏：最多留 20 个会话、每会话最近 80 条消息 */
const MAX_SESSIONS = 20
const MAX_STORED_TURNS = 80

interface PersistShape {
  sessions: KbqaSession[]
  currentSessionId: string | null
}

let _cached: PersistShape | null = null

function load(): PersistShape {
  if (_cached) return _cached
  const fallback: PersistShape = { sessions: [], currentSessionId: null }
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<PersistShape>
      _cached = {
        sessions: Array.isArray(p.sessions) ? p.sessions : [],
        currentSessionId: p.currentSessionId ?? null,
      }
      return _cached
    }
  } catch {
    // localStorage 不可用或解析失败 -> 退回内存态
  }
  _cached = fallback
  return _cached
}

function save(s: PersistShape): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s))
  } catch {
    // 忽略写入失败（隐私模式等）
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `kbqa-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function titleOf(question: string): string {
  const t = question.trim().replace(/\s+/g, ' ')
  return t.length > 24 ? `${t.slice(0, 24)}…` : t
}

interface KbqaStore extends PersistShape {
  newSession: () => string
  switchSession: (id: string) => void
  removeSession: (id: string) => void
  appendUserMessage: (id: string, content: string) => void
  startAssistant: (id: string) => void
  setAssistantMeta: (id: string, meta: { sources?: AskSource[]; degraded?: boolean; degradeReason?: string | null }) => void
  appendDelta: (id: string, delta: string) => void
  finishAssistant: (id: string, done: { answer: string; sources: AskSource[]; degraded: boolean; degradeReason?: string | null }) => void
  failAssistant: (id: string, message: string) => void
  stopAssistant: (id: string) => void
  getHistory: (id: string) => KbqaTurn[]
}

/** 修改指定会话 turns 的辅助（返回新数组，越界时静默忽略） */
function updateTurns(
  s: KbqaSession[],
  id: string,
  fn: (turns: KbqaMessage[]) => KbqaMessage[],
): KbqaSession[] {
  return s.map((sess) => (sess.id === id ? { ...sess, turns: fn(sess.turns) } : sess))
}

const _init = load()

function persist(get: () => KbqaStore): void {
  save({ sessions: get().sessions, currentSessionId: get().currentSessionId })
}

export const useKbqaStore = create<KbqaStore>((set, get) => ({
  ..._init,

  /** 新建会话并置为当前；返回新会话 id */
  newSession: () => {
    const id = newId()
    set((s) => ({
      sessions: [{ id, title: '新会话', createdAt: Date.now(), turns: [] }, ...s.sessions].slice(
        0,
        MAX_SESSIONS,
      ),
      currentSessionId: id,
    }))
    persist(get)
    return id
  },

  switchSession: (id) => {
    set({ currentSessionId: id })
    persist(get)
  },

  removeSession: (id) => {
    set((s) => {
      const sessions = s.sessions.filter((sess) => sess.id !== id)
      const currentSessionId =
        s.currentSessionId === id ? (sessions[0]?.id ?? null) : s.currentSessionId
      return { sessions, currentSessionId }
    })
    persist(get)
  },

  appendUserMessage: (id, content) => {
    set((s) => ({
      sessions: s.sessions.map((sess) => {
        if (sess.id !== id) return sess
        // 会话标题 = 首个问题
        const title = sess.turns.length === 0 ? titleOf(content) : sess.title
        return {
          ...sess,
          title,
          turns: [
            ...sess.turns,
            { role: 'user', content, ts: Date.now() } as KbqaMessage,
          ].slice(-MAX_STORED_TURNS),
        }
      }),
    }))
    persist(get)
  },

  /** 追加空 assistant 占位（流式开始） */
  startAssistant: (id) => {
    set((s) => ({
      sessions: updateTurns(s.sessions, id, (turns) => [
        ...turns,
        { role: 'assistant', content: '', ts: Date.now() },
      ]),
    }))
    persist(get)
  },

  setAssistantMeta: (id, meta) => {
    set((s) => ({
      sessions: updateTurns(s.sessions, id, (turns) => {
        if (!turns.length) return turns
        const i = turns.length - 1
        const last = turns[i]
        if (last.role !== 'assistant') return turns
        const next = [...turns]
        next[i] = { ...last, ...meta }
        return next
      }),
    }))
  },

  appendDelta: (id, delta) => {
    set((s) => ({
      sessions: updateTurns(s.sessions, id, (turns) => {
        if (!turns.length) return turns
        const i = turns.length - 1
        const last = turns[i]
        if (last.role !== 'assistant') return turns
        const next = [...turns]
        next[i] = { ...last, content: last.content + delta }
        return next
      }),
    }))
  },

  finishAssistant: (id, done) => {
    set((s) => ({
      sessions: updateTurns(s.sessions, id, (turns) => {
        if (!turns.length) return turns
        const i = turns.length - 1
        const last = turns[i]
        if (last.role !== 'assistant') return turns
        const next = [...turns]
        next[i] = {
          ...last,
          content: done.answer,
          sources: done.sources,
          degraded: done.degraded,
          degradeReason: done.degradeReason ?? null,
        }
        return next
      }),
    }))
    persist(get)
  },

  failAssistant: (id, message) => {
    set((s) => ({
      sessions: updateTurns(s.sessions, id, (turns) => {
        if (!turns.length) return turns
        const i = turns.length - 1
        const last = turns[i]
        if (last.role !== 'assistant') return turns
        const next = [...turns]
        next[i] = { ...last, error: message }
        return next
      }),
    }))
    persist(get)
  },

  /** 用户主动停止：已生成的部分内容保留（不标错误），仅落盘 */
  stopAssistant: () => {
    persist(get)
  },

  /** 取当前会话最近 N 轮历史发给后端（空 assistant 占位跳过；后端二次截断） */
  getHistory: (id) => {
    const sess = get().sessions.find((x) => x.id === id)
    if (!sess) return []
    return sess.turns
      .filter((t) => t.content.trim() !== '' && !t.error)
      .slice(-MAX_HISTORY_TURNS)
      .map((t) => ({ role: t.role, content: t.content }))
  },
}))
