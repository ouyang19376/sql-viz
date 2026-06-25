import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DialectId } from '@/types'

interface DialectStore {
  currentDialectId: DialectId
  setDialect: (id: DialectId) => void
}

export const useDialectStore = create<DialectStore>()(
  persist(
    (set) => ({
      currentDialectId: 'mysql',
      setDialect: (id) => set({ currentDialectId: id }),
    }),
    { name: 'sqlviz_dialect' },
  ),
)
