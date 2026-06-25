import { create } from 'zustand'
import type {
  DataTestMode,
  ExportFormat,
  FieldDef,
} from '@/types/datatest'
import { DT_LIMITS } from '@/types/datatest'

/** DataTest 输入态（plan §5.1）：mode / prompt / fields / rowCount / format。
 *  设计要点：
 *  - 两种模式的输入态各自独立保存（plan §6.7），切 Tab 互不覆盖；
 *  - 不持久化（MVP 决定，刷新即清）；响应态由 TanStack Query 内存缓存。 */
interface DataTestStore {
  mode: DataTestMode
  prompt: string
  fields: FieldDef[]
  rowCount: number
  format: ExportFormat

  setMode: (mode: DataTestMode) => void
  setPrompt: (p: string) => void
  setFields: (f: FieldDef[]) => void
  /** 上传表头追加：传入若干字段名，type 默认 string，description 留空 */
  appendFields: (names: string[]) => void
  setRowCount: (n: number) => void
  setFormat: (f: ExportFormat) => void
  reset: () => void
}

const initialState = {
  mode: 'natural_language' as DataTestMode,
  prompt: '',
  fields: [] as FieldDef[],
  rowCount: DT_LIMITS.ROW_COUNT_DEFAULT,
  format: 'csv' as ExportFormat,
}

export const useDataTestStore = create<DataTestStore>((set) => ({
  ...initialState,

  setMode: (mode) => set({ mode }),
  setPrompt: (prompt) => set({ prompt }),
  setFields: (fields) => set({ fields }),
  appendFields: (names) =>
    set((state) => {
      const additions: FieldDef[] = names.map((name) => ({
        name,
        type: 'string',
      }))
      // 维持 ≤ FIELDS_MAX；超出截断（用户已被前端 toast 告知）
      const next = [...state.fields, ...additions].slice(0, DT_LIMITS.FIELDS_MAX)
      return { fields: next }
    }),
  setRowCount: (rowCount) => set({ rowCount }),
  setFormat: (format) => set({ format }),
  reset: () => set({ ...initialState }),
}))
