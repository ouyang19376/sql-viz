import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router'
import {
  BarChart3,
  BookOpen,
  Boxes,
  Database,
  GitBranch,
  Menu,
  MessageSquareCode,
  ScanSearch,
  Sparkles,
  X,
} from 'lucide-react'
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
  {
    key: 'dataprofile',
    label: '数据探查',
    to: '/dataprofile',
    icon: ScanSearch,
    match: (p: string) => p === '/dataprofile',
  },
  {
    key: 'rag-sql',
    label: 'RAG 转 SQL',
    to: '/rag-sql',
    icon: MessageSquareCode,
    match: (p: string) => p === '/rag-sql',
  },
  {
    key: 'kbqa',
    label: '知识库问答',
    to: '/kbqa',
    icon: BookOpen,
    match: (p: string) => p === '/kbqa',
  },
  // 数据建模平台是全屏 iframe 路由（不走 Layout），Navbar 不会在其页面内渲染，
  // 故此处仅作为其余页面的入口，match 不会命中。
  {
    key: 'modeling',
    label: '数据建模平台',
    to: '/modeling',
    icon: Boxes,
    match: (p: string) => p === '/modeling',
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
      <header className="sticky top-0 z-50 border-b border-line bg-paper/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6 lg:px-8">
          {/* Logo = 返回首页 */}
          <Link
            to="/"
            title="返回首页"
            className="flex items-center gap-2 font-display text-lg font-semibold text-ink"
          >
            <Database className="h-5 w-5 text-accent" />
            <span className="hidden sm:inline">SQL Viz</span>
          </Link>

          {/* 移动端汉堡按钮（<768px）：展开模块菜单 */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="菜单"
            aria-expanded={menuOpen}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-surface-2 md:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {/* ModuleNav（>=768px）：当前模块高亮（琥珀荧光条） */}
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
                      ? 'bg-accent text-white'
                      : 'text-mute hover:bg-surface-2 hover:text-ink')
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
              className="absolute inset-x-0 top-14 z-50 border-b border-line bg-paper px-4 py-2 shadow-lg md:hidden"
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
                        ? 'bg-accent text-white'
                        : 'text-ink-2 hover:bg-surface-2')
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
