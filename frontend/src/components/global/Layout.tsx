import { useEffect } from 'react'
import { Outlet } from 'react-router'
import Navbar from './Navbar'
import { useDialectStore } from '@/stores/useDialectStore'
import { useThemeStore } from '@/stores/useThemeStore'
import { useDialects } from '@/api/queries'

/** 全局布局壳：Navbar + 路由出口。
 *  注入当前方言主题色（F-DS-02）+ 暗色模式 class（F-CM-03，P2）。 */
export default function Layout() {
  const currentDialectId = useDialectStore((s) => s.currentDialectId)
  const theme = useThemeStore((s) => s.theme)
  const { data } = useDialects()

  // 方言主题色 → CSS 变量
  const currentColor =
    data?.dialects.find((d) => d.id === currentDialectId)?.color

  useEffect(() => {
    if (currentColor) {
      document.documentElement.style.setProperty('--dialect-color', currentColor)
    }
  }, [currentColor])

  // 主题模式 → <html>.dark class，全局 dark: 变体生效
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <div className="min-h-screen bg-[#F7F8FA] dark:bg-gray-950">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}
