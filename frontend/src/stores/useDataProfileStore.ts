import { create } from 'zustand'
import type {
  GenerateHistoryEntry,
  QueryHistoryEntry,
  QueryResult,
  ScriptSegment,
  SqlAnalysis,
} from '@/types/dataprofile'

/** sessionId 持久化（PRD §8.1）：仅此项落 localStorage，其余状态不持久化。
 *  既有 store 范式均不引 persist 中间件，故手动读写。 */
const SESSION_KEY = 'dp.sessionId'
let _cachedSessionId: string | null = null

export function ensureSessionId(): string {
  if (_cachedSessionId) return _cachedSessionId
  try {
    const existing = localStorage.getItem(SESSION_KEY)
    if (existing) {
      _cachedSessionId = existing
      return existing
    }
  } catch {
    // localStorage 不可用（隐私模式等）-> 退回内存态
  }
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  try {
    localStorage.setItem(SESSION_KEY, id)
  } catch {
    // 忽略写入失败
  }
  _cachedSessionId = id
  return id
}

export type ProfileTab = 'sources' | 'bench' | 'rules' | 'generate'

/** 数据探查交互态（plan §5.3）：切 Tab 不丢输入；响应态由 TanStack Query 缓存。
 *  pendingImport 用于「生成 -> 工作台」导入中转（PG 模块后续接入，先预留）。
 *  工作台结果/历史/分页进 store，因 Tab 条件渲染会卸载面板，靠 store 保活（F-QB-10）。 */
interface DataProfileStore {
  sessionId: string
  activeTab: ProfileTab
  selectedDatasourceId: string | null
  workbenchSql: string
  pendingImport: ScriptSegment[] | null

  setActiveTab: (tab: ProfileTab) => void
  selectDatasource: (id: string | null) => void
  setWorkbenchSql: (sql: string) => void
  setPendingImport: (segs: ScriptSegment[] | null) => void
  consumePendingImport: () => ScriptSegment[] | null

  // 工作台（QB）：结果 / 拦截 / 分页 / 历史（F-QB-05/10）
  lastResult: QueryResult | null
  lastViolation: SqlAnalysis | null
  currentPage: number
  pageSize: number
  queryHistory: QueryHistoryEntry[]
  setLastResult: (r: QueryResult | null) => void
  setLastViolation: (v: SqlAnalysis | null) => void
  setCurrentPage: (p: number) => void
  setPageSize: (s: number) => void
  pushQueryHistory: (entry: QueryHistoryEntry) => void

  // 生成历史（F-PG-14，会话内最近 10 次，可回填配置）
  generateHistory: GenerateHistoryEntry[]
  pushGenerateHistory: (entry: GenerateHistoryEntry) => void
}

export const useDataProfileStore = create<DataProfileStore>((set, get) => ({
  sessionId: ensureSessionId(),
  activeTab: 'sources',
  selectedDatasourceId: null,
  workbenchSql: '',
  pendingImport: null,

  setActiveTab: (activeTab) => set({ activeTab }),
  selectDatasource: (selectedDatasourceId) => set({ selectedDatasourceId }),
  setWorkbenchSql: (workbenchSql) => set({ workbenchSql }),
  setPendingImport: (pendingImport) => set({ pendingImport }),
  consumePendingImport: () => {
    const pending = get().pendingImport
    set({ pendingImport: null })
    return pending
  },

  lastResult: null,
  lastViolation: null,
  currentPage: 1,
  pageSize: 50,
  queryHistory: [],
  setLastResult: (lastResult) => set({ lastResult }),
  setLastViolation: (lastViolation) => set({ lastViolation }),
  setCurrentPage: (currentPage) => set({ currentPage }),
  setPageSize: (pageSize) => set({ pageSize, currentPage: 1 }),
  pushQueryHistory: (entry) =>
    set((s) => ({ queryHistory: [entry, ...s.queryHistory].slice(0, 20) })),

  generateHistory: [],
  pushGenerateHistory: (entry) =>
    set((s) => ({ generateHistory: [entry, ...s.generateHistory].slice(0, 10) })),
}))
