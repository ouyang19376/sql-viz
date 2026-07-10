import { useState } from 'react'
import { Plus } from 'lucide-react'
import EmptyState from '@/components/shared/EmptyState'
import Skeleton from '@/components/shared/Skeleton'
import { useSources } from '@/api/dataprofile'
import type { DataSource } from '@/types/dataprofile'
import DataSourceForm from './components/DataSourceForm'
import DataSourceItem from './components/DataSourceItem'

type FormState = { mode: 'create' } | { mode: 'edit'; ds: DataSource } | null

/** 数据源管理 Tab（F-DS-01~07）。 */
export default function SourcesPanel() {
  const { data, isLoading, isError } = useSources()
  const [form, setForm] = useState<FormState>(null)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          配置并连接 MySQL / Hive / PostgreSQL 数据源。连接信息仅存于当前会话内存，不落盘（刷新后需重连）。
        </p>
        {!form && (
          <button
            type="button"
            onClick={() => setForm({ mode: 'create' })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            新建数据源
          </button>
        )}
      </div>

      {form && (
        <DataSourceForm
          editingId={form.mode === 'edit' ? form.ds.id : undefined}
          initial={form.mode === 'edit' ? form.ds : undefined}
          onDone={() => setForm(null)}
        />
      )}

      {isLoading && <Skeleton lines={3} />}
      {isError && (
        <EmptyState title="加载失败" description="无法获取数据源列表，请检查后端服务是否启动" />
      )}
      {data && data.length === 0 && !form && (
        <EmptyState
          title="尚未连接数据源"
          description="点击「新建数据源」配置一个连接"
          actionLabel="新建数据源"
          onAction={() => setForm({ mode: 'create' })}
        />
      )}
      {data && data.length > 0 && (
        <div className="space-y-3">
          {data.map((ds) => (
            <DataSourceItem key={ds.id} ds={ds} onEdit={(d) => setForm({ mode: 'edit', ds: d })} />
          ))}
        </div>
      )}
    </div>
  )
}
