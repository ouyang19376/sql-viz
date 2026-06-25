import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark'

interface ThemeStore {
  theme: Theme
  toggle: () => void
  setTheme: (t: Theme) => void
}

/** 主题（F-CM-03，P2）：localStorage 持久化。
 *  实际暗色样式由 index.css 中的 @custom-variant dark 与各组件 dark: 变体生效；
 *  Layout 监听 theme 在 <html> 上 toggle '.dark' class。
 *  P2 阶段仅 Layout/Navbar 已适配，页面级深色样式后续增量补全。 */
export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'light',
      toggle: () =>
        set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'sqlviz_theme' },
  ),
)
