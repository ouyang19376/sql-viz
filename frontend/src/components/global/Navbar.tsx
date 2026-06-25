import { useCallback, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { Database, GitBranch, Sparkles } from 'lucide-react'
import DialectDropdown from './DialectDropdown'
import SearchBox from './SearchBox'
import SearchModal from './SearchModal'
import NavActions from './NavActions'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

/** 模块定义：F-CM-01 顶部模块切换。 */
const MODULES = [
  {
    key: 'sql',
    label: 'SQL 函数学习',
    to: '/sql',
    icon: Database,
    match: (p: string) => p.startsWith('/sql') || p.startsWith('/dialect'),
  },
  {
    key: 'datatest',
    label: '测试数据集',
    to: '/datatest',
    icon: Sparkles,
    match: (p: string) => p === '/datatest',
  },
  {
    key: 'lineage',
    label: '血缘分析',
    to: '/lineage',
    icon: GitBranch,
    match: (p: string) => p === '/lineage',
  },
] as const

/** 全局顶部导航栏：
 *  - F-CM-01：Logo 兼任「返回首页」（PRD §7.1）+ ModuleNav 高亮当前模块；
 *    DialectDropdown / SearchBox 仅在 SQL 路由下渲染。
 *  - F-SH-03：Ctrl+K 打开搜索弹层（保持全局可用）。
 *  - F-CM-03（P2）：暗色样式由 dark: 变体生效。 */
export default function Navbar() {
  const [searchOpen, setSearchOpen] = useState(false)
  const openSearch = useCallback(() => setSearchOpen(true), [])
  const closeSearch = useCallback(() => setSearchOpen(false), [])

  const shortcuts = useMemo(() => ({ 'mod+k': openSearch }), [openSearch])
  useKeyboardShortcuts(shortcuts)

  const { pathname } = useLocation()
  const inSqlScope = pathname.startsWith('/sql') || pathname.startsWith('/dialect')

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          {/* Logo = 返回首页 */}
          <Link
            to="/"
            title="返回首页"
            className="flex items-center gap-2 text-lg font-semibold dark:text-gray-100"
          >
            <Database className="h-5 w-5 dialect-text" />
            <span>SQL Viz</span>
          </Link>

          {/* ModuleNav：当前模块高亮 */}
          <nav className="flex items-center gap-1" aria-label="模块导航">
            {MODULES.map((m) => {
              const active = m.match(pathname)
              const Icon = m.icon
              return (
                <Link
                  key={m.key}
                  to={m.to}
                  aria-current={active ? 'page' : undefined}
                  className={
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
                    (active
                      ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200')
                  }
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{m.label}</span>
                </Link>
              )
            })}
          </nav>

          {/* SQL 模块专属控件：仅在 SQL 路由下渲染 */}
          {inSqlScope && (
            <>
              <DialectDropdown />
              <SearchBox onOpen={openSearch} />
            </>
          )}

          {/* 占位让 NavActions 永远靠右（非 SQL 路由下没有 SearchBox 占据 flex-1） */}
          {!inSqlScope && <div className="flex-1" />}

          <NavActions />
        </div>
      </header>
      <SearchModal open={searchOpen} onClose={closeSearch} />
    </>
  )
}
