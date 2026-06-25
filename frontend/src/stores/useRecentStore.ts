import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface RecentEntry {
  functionId: string
  dialectId: string
  timestamp: number
}

interface RecentStore {
  recents: RecentEntry[]
  /** 记录一次浏览：去重后置顶，保留最近 10 条 */
  add: (functionId: string, dialectId: string) => void
}

const MAX_RECENTS = 3

/** 最近查看（F-FC-05）：localStorage 持久化，key 同 tech-plan §5.1 */
export const useRecentStore = create<RecentStore>()(
  persist(
    (set, get) => ({
      recents: [],

      add: (functionId, dialectId) => {
        const { recents } = get()
        const filtered = recents.filter(
          (r) => !(r.functionId === functionId && r.dialectId === dialectId),
        )
        set({
          recents: [
            { functionId, dialectId, timestamp: Date.now() },
            ...filtered,
          ].slice(0, MAX_RECENTS),
        })
      },
    }),
    { name: 'sqlviz_recents' },
  ),
)
