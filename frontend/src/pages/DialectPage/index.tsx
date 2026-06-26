import { useEffect, useMemo } from 'react'
import { useParams } from 'react-router'
import { useDialect } from '@/api/queries'
import { useDialectStore } from '@/stores/useDialectStore'
import { useFavoriteStore } from '@/stores/useFavoriteStore'
import { useRecentStore } from '@/stores/useRecentStore'
import { useScrollRestore } from '@/hooks/useScrollRestore'
import { ApiError } from '@/types'
import Skeleton from '@/components/shared/Skeleton'
import EmptyState from '@/components/shared/EmptyState'
import Breadcrumb from '@/components/shared/Breadcrumb'
import { getDialectIcon } from '@/components/shared/dialectIcon'
import type { DialectId, FunctionSummary } from '@/types'
import CategorySidebar from './CategorySidebar'
import FunctionList from './FunctionList'
import FunctionItem from './FunctionItem'

/** 方言详情页（FC 模块）：
 * F-FC-01 分类列表 / F-FC-02 排序 / F-FC-03 签名预览 /
 * F-FC-04 我的收藏分组 / F-FC-05 最近查看分组。
 * §7.1 从函数详情返回时恢复列表滚动位置；§7.2 错误态区分 404/网络错误。 */
export default function DialectPage() {
  const { dialectId = '' } = useParams()
  const setDialect = useDialectStore((s) => s.setDialect)
  const { data, isLoading, error, refetch, isFetching } = useDialect(dialectId)

  // §7.1 滚动位置恢复：按 dialectId 隔离，从函数详情返回时回到原位
  useScrollRestore(`dialect:${dialectId}`)

  // 所有 Hook 必须无条件调用，故提前于早 return 之前
  const functions: FunctionSummary[] = data?.dialect.functions ?? []
  const categories = data?.dialect.categories ?? []

  const favorites = useFavoriteStore((s) => s.favorites)
  const recents = useRecentStore((s) => s.recents)
  // selector 必须返回稳定引用，过滤/映射放到 useMemo 中派生，避免 useSyncExternalStore 死循环
  const favoriteIds = useMemo(
    () =>
      favorites
        .filter((f) => f.dialectId === dialectId)
        .map((f) => f.functionId),
    [favorites, dialectId],
  )
  const recentIds = useMemo(
    () =>
      recents
        .filter((r) => r.dialectId === dialectId)
        .map((r) => r.functionId),
    [recents, dialectId],
  )

  const fnById = useMemo(() => {
    const m = new Map<string, FunctionSummary>()
    for (const f of functions) m.set(f.id, f)
    return m
  }, [functions])

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const f of functions) m[f.category_id] = (m[f.category_id] ?? 0) + 1
    return m
  }, [functions])

  // 进入方言页时同步全局 store（Navbar 主题色跟随）
  useEffect(() => {
    if (dialectId) {
      setDialect(dialectId as DialectId)
    }
  }, [dialectId, setDialect])

  if (isLoading) return <Skeleton lines={4} />

  if (error || !data) {
    // §7.2：404（方言不存在）vs 其他错误（网络/服务端）分流提示
    const is404 = error instanceof ApiError && (error.code === 404 || error.code === 4040)
    if (is404) {
      return (
        <EmptyState
          title="方言不存在"
          description="该方言 ID 无对应数据，请返回首页选择其他方言"
          actionLabel="返回首页"
          actionTo="/sql"
        />
      )
    }
    return (
      <EmptyState
        title="加载失败"
        description="无法获取方言数据，请检查网络后重试"
        actionLabel={isFetching ? '重试中…' : '重试'}
        onAction={() => refetch()}
      />
    )
  }

  const dialect = data.dialect
  const Icon = getDialectIcon(dialect.icon)

  const favoriteFns = favoriteIds.map((id) => fnById.get(id)).filter(Boolean) as FunctionSummary[]
  const recentFns = recentIds.map((id) => fnById.get(id)).filter(Boolean) as FunctionSummary[]

  return (
    <div>
      {/* 面包屑（F-CM-04）：首页 > 方言名 */}
      <Breadcrumb items={[{ label: '首页', to: '/sql' }, { label: dialect.name }]} />

      {/* 主题色头部 */}
      <div
        className="rounded-xl p-6 text-white"
        style={{ backgroundColor: dialect.color }}
      >
        <div className="flex items-center gap-3">
          <Icon className="h-8 w-8" />
          <div>
            <h1 className="text-2xl font-bold">{dialect.name}</h1>
            {dialect.version && (
              <span className="text-sm opacity-90">v{dialect.version}</span>
            )}
          </div>
        </div>
        <p className="mt-3 text-sm opacity-90">{dialect.description}</p>
      </div>

      {/* 我的收藏（F-FC-04） */}
      {favoriteFns.length > 0 && (
        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
            我的收藏
            <span className="text-gray-400">{favoriteFns.length}</span>
          </h2>
          <div className="space-y-2">
            {favoriteFns.map((fn) => (
              <FunctionItem key={fn.id} fn={fn} dialectId={dialectId} />
            ))}
          </div>
        </section>
      )}

      {/* 最近查看（F-FC-05）：横向排列，最多 3 条（store MAX_RECENTS=3） */}
      {recentFns.length > 0 && (
        <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
            最近查看
            <span className="text-gray-400">{recentFns.length}</span>
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {recentFns.map((fn) => (
              <FunctionItem key={fn.id} fn={fn} dialectId={dialectId} />
            ))}
          </div>
        </section>
      )}

      {/* 主体：左侧分类导航 + 右侧函数列表（移动端纵向堆叠） */}
      <div className="mt-6 flex flex-col gap-4 md:flex-row md:gap-8">
        <CategorySidebar categories={categories} counts={counts} />
        <div className="min-w-0 flex-1">
          {functions.length === 0 ? (
            <EmptyState title="该方言暂无函数数据" />
          ) : (
            <FunctionList
              categories={categories}
              functions={functions}
              dialectId={dialectId}
            />
          )}
        </div>
      </div>
    </div>
  )
}
