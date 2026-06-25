import { useNavigate } from 'react-router'
import { Heart, Moon, Sun } from 'lucide-react'
import { useDialectStore } from '@/stores/useDialectStore'
import { useFavoriteStore } from '@/stores/useFavoriteStore'
import { useThemeStore } from '@/stores/useThemeStore'

/** Navbar 右侧操作区：
 *  - 我的收藏入口（F-CM-01）：跳转到当前方言页（收藏分组在那里渲染），徽标显示总数
 *  - 主题切换（F-CM-03，P2）：light / dark 二态切换 */
export default function NavActions() {
  const navigate = useNavigate()
  const currentDialectId = useDialectStore((s) => s.currentDialectId)
  const favoriteCount = useFavoriteStore((s) => s.favorites.length)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => navigate(`/dialect/${currentDialectId}`)}
        aria-label="我的收藏"
        title="我的收藏"
        className="relative rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
      >
        <Heart className="h-4 w-4" />
        {favoriteCount > 0 && (
          <span
            aria-label={`${favoriteCount} 个收藏`}
            className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--dialect-color)] px-1 text-[10px] font-medium leading-none text-white"
          >
            {favoriteCount > 99 ? '99+' : favoriteCount}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === 'light' ? '切换到暗色模式' : '切换到亮色模式'}
        title={theme === 'light' ? '暗色模式' : '亮色模式'}
        className="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
      >
        {theme === 'light' ? (
          <Moon className="h-4 w-4" />
        ) : (
          <Sun className="h-4 w-4" />
        )}
      </button>
    </div>
  )
}
