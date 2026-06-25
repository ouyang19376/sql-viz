import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Search, X } from 'lucide-react'
import { useSearch } from '@/api/queries'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useKeyboardShortcuts, type ShortcutHandlers } from '@/hooks/useKeyboardShortcuts'
import DialectBadge from '@/components/shared/DialectBadge'
import EmptyState from '@/components/shared/EmptyState'
import Skeleton from '@/components/shared/Skeleton'
import type { SearchResultItem } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
}

/** category_id → 展示名称（数据中分类名跨方言一致；本地映射避免多查询）。 */
const CATEGORY_LABELS: Record<string, string> = {
  aggregate: '聚合函数',
  window: '窗口函数',
  string: '字符串函数',
  datetime: '日期时间函数',
  math: '数学函数',
  conditional: '条件逻辑',
  conversion: '类型转换',
  json: 'JSON 函数',
  system: '系统函数',
  ddl: 'DDL',
}

interface DialectGroup {
  dialectId: string
  dialectName: string
  dialectColor: string
  byCategory: Map<string, SearchResultItem[]>
}

/** 把扁平 results 按 dialect → category_id 两级分组（F-SH-02）。 */
function groupResults(results: SearchResultItem[]): DialectGroup[] {
  const map = new Map<string, DialectGroup>()
  for (const r of results) {
    const did = r.dialect.id
    let g = map.get(did)
    if (!g) {
      g = {
        dialectId: did,
        dialectName: r.dialect.name,
        dialectColor: r.dialect.color,
        byCategory: new Map(),
      }
      map.set(did, g)
    }
    const cat = r.category_id || 'other'
    const arr = g.byCategory.get(cat)
    if (arr) arr.push(r)
    else g.byCategory.set(cat, [r])
  }
  return Array.from(map.values())
}

/** 全局搜索弹层（F-SH-01 / F-SH-02 / F-SH-03 的弹层主体）。 */
export default function SearchModal({ open, onClose }: Props) {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 300)
  const { data, isLoading } = useSearch(debouncedQuery)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  // 打开时自动聚焦 + 重置（关闭后再次打开是新一轮搜索）
  useEffect(() => {
    if (open) {
      setQuery('')
      // 等弹层渲染完再 focus
      const t = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open])

  // Esc 关闭（用 useMemo 稳定 handlers 引用，避免每次渲染都重绑 keydown）
  const shortcuts = useMemo<ShortcutHandlers>(
    () => (open ? { esc: onClose } : {} as ShortcutHandlers),
    [open, onClose],
  )
  useKeyboardShortcuts(shortcuts)

  const groups = useMemo(
    () => (data ? groupResults(data.results) : []),
    [data],
  )

  const handlePick = (dialectId: string, functionId: string) => {
    onClose()
    navigate(`/dialect/${dialectId}/function/${functionId}`)
  }

  if (!open) return null

  const trimmed = debouncedQuery.trim()
  const showLoading = trimmed.length > 0 && isLoading
  const showEmpty = trimmed.length > 0 && !isLoading && data?.total === 0
  const showHint = trimmed.length === 0
  const showResults = trimmed.length > 0 && !isLoading && (data?.total ?? 0) > 0

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 px-4 pt-20"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="函数搜索"
    >
      <div
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 输入条 */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
          <Search className="h-5 w-5 flex-shrink-0 text-gray-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入函数名或关键词…"
            className="flex-1 bg-transparent text-base text-gray-900 placeholder-gray-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 结果区 */}
        <div className="max-h-[60vh] overflow-y-auto px-4 py-4">
          {showHint && (
            <p className="py-8 text-center text-sm text-gray-500">
              输入函数名或关键词搜索（支持函数名 / 签名 / 描述）
            </p>
          )}

          {showLoading && <Skeleton lines={3} />}

          {showEmpty && (
            <EmptyState
              title="未找到相关函数"
              description="试试其他关键词"
            />
          )}

          {showResults && (
            <div className="space-y-6">
              {groups.map((g) => (
                <section key={g.dialectId}>
                  <div className="mb-2">
                    <DialectBadge name={g.dialectName} color={g.dialectColor} size="sm" />
                  </div>
                  <div className="space-y-4">
                    {Array.from(g.byCategory.entries()).map(([catId, items]) => (
                      <div key={catId}>
                        <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-500">
                          {CATEGORY_LABELS[catId] ?? catId}
                          <span className="ml-2 text-gray-400">{items.length}</span>
                        </h3>
                        <ul className="space-y-1">
                          {items.map((r) => (
                            <li key={`${r.dialect.id}-${r.function.id}`}>
                              <button
                                type="button"
                                onClick={() => handlePick(r.dialect.id, r.function.id)}
                                className="flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-gray-50"
                              >
                                <span className="flex items-baseline gap-2">
                                  <span className="font-medium text-gray-900">
                                    {r.function.name}
                                  </span>
                                  <span className="truncate text-xs text-gray-500">
                                    {r.function.signature}
                                  </span>
                                </span>
                                {r.function.description && (
                                  <span className="line-clamp-1 text-xs text-gray-500">
                                    {r.function.description}
                                  </span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
