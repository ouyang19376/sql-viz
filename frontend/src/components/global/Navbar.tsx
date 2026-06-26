import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { BarChart3, Database, GitBranch, Menu, Sparkles, X } from 'lucide-react'
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
  {
    key: 'bi',
    label: 'BI 报表',
    to: '/bi',
    icon: BarChart3,
    match: (p: string) => p === '/bi',
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

  const [menuOpen, setMenuOpen] = useState(false)

  const shortcuts = useMemo(() => ({ 'mod+k': openSearch }), [openSearch])
  useKeyboardShortcuts(shortcuts)

  const { pathname } = useLocation()
  const inSqlScope = pathname.startsWith('/sql') || pathname.startsWith('/dialect')

  // 路由变化时收起移动端模块菜单
  useEffect(() => setMenuOpen(false), [pathname])

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6 lg:px-8">
          {/* Logo = 返回首页 */}
          <Link
            to="/"
            title="返回首页"
            className="flex items-center gap-2 text-lg font-semibold dark:text-gray-100"
          >
            <Database className="h-5 w-5 dialect-text" />
            <span className="hidden sm:inline">SQL Viz</span>
          </Link>

          {/* 移动端汉堡按钮（<768px）：展开模块菜单 */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="菜单"
            aria-expanded={menuOpen}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 md:hidden dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {/* ModuleNav（>=768px）：当前模块高亮 */}
          <nav className="hidden items-center gap-1 md:flex" aria-label="模块导航">
            {MODULES.map((m) => {
              const active = m.match(pathname)
              const Icon = m.icon
              return (
                <Link
                  key={m.key}
                  to={m.to}
                  aria-current={active ? 'page' : undefined}
                  className={
                    'inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors ' +
                    (active
                      ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200')
                  }
                >
                  <Icon className="h-4 w-4" />
                  {m.label}
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

        {/* 移动端模块菜单（<768px） */}
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 top-14 z-40 md:hidden"
              onClick={() => setMenuOpen(false)}
              aria-hidden
            />
            <nav
              className="absolute inset-x-0 top-14 z-50 border-b border-gray-200 bg-white px-4 py-2 shadow-lg md:hidden dark:border-gray-800 dark:bg-gray-900"
              aria-label="模块菜单"
            >
              {MODULES.map((m) => {
                const active = m.match(pathname)
                const Icon = m.icon
                return (
                  <Link
                    key={m.key}
                    to={m.to}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setMenuOpen(false)}
                    className={
                      'flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ' +
                      (active
                        ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300'
                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800')
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {m.label}
                  </Link>
                )
              })}
            </nav>
          </>
        )}
      </header>
      <SearchModal open={searchOpen} onClose={closeSearch} />
    </>
  )
}
