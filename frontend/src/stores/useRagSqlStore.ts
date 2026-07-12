import { create } from 'zustand'
import type {
  AskTurn,
  KbDocInput,
  RagDialect,
  RagSqlTab,
  TableChunk,
} from '@/types/rag-sql'

/** 已入库状态（F-CK-07：「已入库」徽标 + 时间戳） */
export interface IngestStatus {
  ingestedAt: number
  overwritten: boolean
}

/** AS 多轮会话持久化键（§6.8：multiTurn + conversations 落 localStorage，跨刷新保活）。
 *  既有 store 范式不引 persist 中间件，手动读写（对齐 useDataProfileStore SESSION_KEY）。 */
const ASK_KEY = 'rag-sql.ask'
/** 发给后端的历史轮数上限（与后端 RAG_HISTORY_MAX_TURNS=6 对齐） */
const MAX_HISTORY_TURNS = 6
/** localStorage 内单会话留存上限（防无限增长，超出截断保留最近） */
const MAX_STORED_TURNS = 20

interface AskPersist {
  dialect: RagDialect
  multiTurn: boolean
  conversations: Record<string, AskTurn[]>
  currentConversationId: string | null
}

let _cachedAsk: AskPersist | null = null

function loadAsk(): AskPersist {
  if (_cachedAsk) return _cachedAsk
  const fallback: AskPersist = {
    dialect: 'mysql',
    multiTurn: false,
    conversations: {},
    currentConversationId: null,
  }
  try {
    const raw = localStorage.getItem(ASK_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<AskPersist>
      _cachedAsk = {
        dialect: p.dialect ?? fallback.dialect,
        multiTurn: p.multiTurn ?? false,
        conversations: p.conversations ?? {},
        currentConversationId: p.currentConversationId ?? null,
      }
      return _cachedAsk
    }
  } catch {
    // localStorage 不可用或解析失败 -> 退回内存态
  }
  _cachedAsk = fallback
  return fallback
}

function saveAsk(state: AskPersist): void {
  try {
    localStorage.setItem(ASK_KEY, JSON.stringify(state))
  } catch {
    // 忽略写入失败（隐私模式等）
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** RAG for NL2SQL 交互态（plan §5.3）：切 Tab 不丢输入；服务端态由 TanStack Query 缓存。
 *  CK：ddlInput / currentChunks / chunkDrafts / ingestStatus。
 *  KB：kbDraft 上传表单跨 Tab 保活。
 *  AS：dialect / multiTurn / conversations（持久化）+ 多轮历史管理（F-AS-02/13）。 */
interface RagSqlStore extends AskPersist {
  activeTab: RagSqlTab
  ddlInput: string
  currentChunks: TableChunk[]
  activeChunkIdx: number
  chunkDrafts: TableChunk[]
  ingestStatus: Record<string, IngestStatus>
  kbDraft: KbDocInput

  setActiveTab: (tab: RagSqlTab) => void
  setDdlInput: (v: string) => void
  setCurrentChunks: (chunks: TableChunk[]) => void
  setActiveChunkIdx: (i: number) => void
  updateChunk: (idx: number, chunk: TableChunk) => void
  saveDraft: (chunk: TableChunk) => void
  removeDraft: (tableName: string) => void
  clearCurrent: () => void
  setIngestStatus: (name: string, status: IngestStatus) => void
  updateKbDraft: (patch: Partial<KbDocInput>) => void
  resetKbDraft: () => void

  // AS（F-AS-02/13）
  setDialect: (d: RagDialect) => void
  setMultiTurn: (b: boolean) => void
  confirmToggleMultiTurnOff: () => void
  newConversation: () => void
  recordTurns: (question: string, sql: string) => void
  getCurrentHistory: () => AskTurn[]
}

const _initAsk = loadAsk()

export const useRagSqlStore = create<RagSqlStore>((set, get) => ({
  activeTab: 'chunk',
  ddlInput: '',
  currentChunks: [],
  activeChunkIdx: 0,
  chunkDrafts: [],
  ingestStatus: {},
  kbDraft: { title: '', category: 'sql_standard', content: '', overwrite: false },
  ..._initAsk,

  setActiveTab: (activeTab) => set({ activeTab }),
  setDdlInput: (ddlInput) => set({ ddlInput }),
  setCurrentChunks: (currentChunks) => set({ currentChunks, activeChunkIdx: 0 }),
  setActiveChunkIdx: (activeChunkIdx) => set({ activeChunkIdx }),
  updateChunk: (idx, chunk) =>
    set((s) => {
      const next = s.currentChunks.slice()
      next[idx] = chunk
      return { currentChunks: next }
    }),
  saveDraft: (chunk) =>
    set((s) => {
      // 同名草稿覆盖
      const drafts = s.chunkDrafts.filter((d) => d.tableName !== chunk.tableName)
      return { chunkDrafts: [...drafts, chunk] }
    }),
  removeDraft: (tableName) =>
    set((s) => ({ chunkDrafts: s.chunkDrafts.filter((d) => d.tableName !== tableName) })),
  clearCurrent: () => set({ currentChunks: [], activeChunkIdx: 0 }),
  setIngestStatus: (name, status) =>
    set((s) => ({ ingestStatus: { ...s.ingestStatus, [name]: status } })),
  updateKbDraft: (patch) => set((s) => ({ kbDraft: { ...s.kbDraft, ...patch } })),
  // 入库成功后清表单：保留上次类别（category），清标题/正文/来源/overwrite
  resetKbDraft: () =>
    set((s) => ({
      kbDraft: { ...s.kbDraft, title: '', content: '', sourceName: undefined, overwrite: false },
    })),

  // ─── AS（F-AS-02/13 多轮会话） ─────────────────────────
  setDialect: (dialect) => {
    set({ dialect })
    saveAsk(_askSlice(get()))
  },
  setMultiTurn: (multiTurn) => {
    set({ multiTurn })
    saveAsk(_askSlice(get()))
  },
  /** 关闭多轮时经二次确认后调用：清空当前会话历史并关闭（§7.3） */
  confirmToggleMultiTurnOff: () => {
    const id = get().currentConversationId
    const conversations = { ...get().conversations }
    if (id) delete conversations[id]
    set({ multiTurn: false, currentConversationId: null, conversations })
    saveAsk(_askSlice(get()))
  },
  /** 新建会话（F-AS-13）：重置 currentConversationId 为新 uuid，空历史 */
  newConversation: () => {
    const id = newId()
    const conversations = { ...get().conversations, [id]: [] }
    set({ currentConversationId: id, conversations })
    saveAsk(_askSlice(get()))
  },
  /** 记录一轮问答（多轮开时调用）；无 currentConversationId 则按需新建 */
  recordTurns: (question, sql) => {
    let id = get().currentConversationId
    const conversations = { ...get().conversations }
    if (!id) {
      id = newId()
      conversations[id] = []
    }
    const prev = conversations[id] ?? []
    const userTurn: AskTurn = { role: 'user', content: question }
    const asstTurn: AskTurn = { role: 'assistant', content: sql }
    conversations[id] = [...prev, userTurn, asstTurn].slice(-MAX_STORED_TURNS)
    set({ currentConversationId: id, conversations })
    saveAsk(_askSlice(get()))
  },
  /** 取最近 N 轮历史发给后端（F-AS-13，后端二次截断） */
  getCurrentHistory: () => {
    const id = get().currentConversationId
    if (!id) return []
    const turns = get().conversations[id] ?? []
    return turns.slice(-MAX_HISTORY_TURNS)
  },
}))

function _askSlice(s: RagSqlStore): AskPersist {
  return {
    dialect: s.dialect,
    multiTurn: s.multiTurn,
    conversations: s.conversations,
    currentConversationId: s.currentConversationId,
  }
}

/** 当前会话是否已有轮次（组件判定关闭多轮是否需二次确认，§7.3） */
export function hasActiveConversation(s: RagSqlStore): boolean {
  const id = s.currentConversationId
  return !!id && (s.conversations[id]?.length ?? 0) > 0
}
