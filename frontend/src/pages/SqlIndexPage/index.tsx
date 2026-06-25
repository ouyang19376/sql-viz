import { useDialects } from '@/api/queries'
import Skeleton from '@/components/shared/Skeleton'
import EmptyState from '@/components/shared/EmptyState'
import DialectGrid from './DialectGrid'

/** SQL 工具入口页（/sql）：原 HomePage 内容搬迁，7 种方言卡片网格 */
export default function SqlIndexPage() {
  const { data, isLoading, error, refetch } = useDialects()

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">SQL 函数可视化学习</h1>
      <p className="mb-8 text-gray-500 dark:text-gray-400">
        选择一种 SQL 方言，通过动画直观理解各函数的执行过程
      </p>

      {isLoading && <Skeleton lines={6} />}
      {error && (
        <EmptyState
          title="加载失败"
          description={(error as Error).message}
          actionLabel="重试"
          onAction={refetch}
        />
      )}
      {data && data.dialects.length === 0 && <EmptyState title="暂无方言数据" />}
      {data && <DialectGrid dialects={data.dialects} />}
    </div>
  )
}
