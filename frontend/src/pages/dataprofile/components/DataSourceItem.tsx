import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Pencil, RefreshCw, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import type { ApiError } from '@/types'
import DialectBadge from '@/components/shared/DialectBadge'
import EmptyState from '@/components/shared/EmptyState'
import Skeleton from '@/components/shared/Skeleton'
import { PROFILE_DIALECTS } from '@/types/dataprofile'
import type { DataSource, DataSourceStatus } from '@/types/dataprofile'
import {
  useColumns,
  useDeleteSourceMutation,
  useReconnectSourceMutation,
  useSchemas,
  useTables,
} from '@/api/dataprofile'

interface Props {
  ds: DataSource
  onEdit: (ds: DataSource) => void
}

const STATUS_DOT: Record<DataSourceStatus, string> = {
  connected: 'bg-green-500',
  expired: 'bg-yellow-500',
  error: 'bg-red-500',
  disconnected: 'bg-gray-400',
}
const STATUS_LABEL: Record<DataSourceStatus, string> = {
  connected: '已连接',
  expired: '已失效',
  error: '错误',
  disconnected: '已断开',
}

/** 单个已连接数据源卡片（F-DS-04/05/06/07）。 */
export default function DataSourceItem({ ds, onEdit }: Props) {
  const reconnectMut = useReconnectSourceMutation()
  const deleteMut = useDeleteSourceMutation()
  const [expanded, setExpanded] = useState(false)
  const [schema, setSchema] = useState<string | undefined>(undefined)
  const [table, setTable] = useState<string | null>(null)

  const dialectInfo = PROFILE_DIALECTS[ds.dialect]
  const canReconnect = ds.status === 'expired' || ds.status === 'error'

  const handleReconnect = () => {
    reconnectMut.mutate(ds.id, {
      onSuccess: () => toast.success('已重连'),
      onError: (e: ApiError) => toast.error(e.message),
    })
  }

  const handleDisconnect = () => {
    if (!window.confirm('断开后正在执行的查询将失败，是否继续？')) return
    deleteMut.mutate(ds.id, {
      onSuccess: () => toast.success('已断开'),
      onError: (e: ApiError) => toast.error(e.message),
    })
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[ds.status]}`} title={STATUS_LABEL[ds.status]} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-gray-800 dark:text-gray-100">{ds.name}</span>
            <DialectBadge name={dialectInfo.name} color={dialectInfo.color} />
          </div>
          <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
            {ds.host}:{ds.port}{ds.database ? ` / ${ds.database}` : ''} · {ds.username}
            {ds.lastError && <span className="ml-2 text-red-500">{ds.lastError}</span>}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {canReconnect && (
            <button
              type="button"
              onClick={handleReconnect}
              disabled={reconnectMut.isPending}
              title="重连"
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {reconnectMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              重连
            </button>
          )}
          <button
            type="button"
            onClick={() => onEdit(ds)}
            title="编辑"
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <Pencil className="h-3.5 w-3.5" />
            编辑
          </button>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={deleteMut.isPending}
            title="断开"
            className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            {deleteMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
            断开
          </button>
        </div>
      </div>

      {/* F-DS-07：Schema 反射查看器 */}
      {ds.status === 'connected' && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            查看表结构
          </button>
          {expanded && (
            <SchemaBrowser
              dsId={ds.id}
              dialect={ds.dialect}
              defaultSchema={ds.database}
              schema={schema}
              setSchema={(s) => { setSchema(s); setTable(null) }}
              table={table}
              setTable={setTable}
            />
          )}
        </div>
      )}
    </div>
  )
}

/** 库/表/列 三级浏览（F-DS-07）。 */
function SchemaBrowser({
  dsId, dialect, defaultSchema, schema, setSchema, table, setTable,
}: {
  dsId: string
  dialect: DataSource['dialect']
  defaultSchema?: string
  schema?: string
  setSchema: (s: string | undefined) => void
  table: string | null
  setTable: (t: string | null) => void
}) {
  const schemasQ = useSchemas(dsId)
  const resolvedSchema = schema ?? defaultSchema ?? (dialect === 'postgresql' ? 'public' : undefined)
  const tablesQ = useTables(dsId, resolvedSchema)
  const columnsQ = useColumns(dsId, table, resolvedSchema)

  // schemas 加载后自动选第一个
  useEffect(() => {
    if (!schema && schemasQ.data && schemasQ.data.length > 0) {
      setSchema(schemasQ.data[0])
    }
  }, [schemasQ.data, schema, setSchema])

  if (schemasQ.isLoading) return <Skeleton lines={1} className="mt-2" />
  if (schemasQ.isError) return <EmptyState title="反射失败" description="无法读取库结构，请检查权限" />

  return (
    <div className="mt-2 space-y-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">库</span>
        <select
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          value={resolvedSchema ?? ''}
          onChange={(e) => setSchema(e.target.value || undefined)}
        >
          {(schemasQ.data ?? []).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">表</div>
          {tablesQ.isLoading ? (
            <Skeleton lines={3} />
          ) : tablesQ.isError ? (
            <EmptyState title="读取表失败" />
          ) : (tablesQ.data ?? []).length === 0 ? (
            <p className="text-xs text-gray-400">无表</p>
          ) : (
            <div className="max-h-48 overflow-auto rounded-md border border-gray-200 dark:border-gray-700">
              {(tablesQ.data ?? []).map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => setTable(t.name)}
                  className={
                    'block w-full truncate px-2 py-1 text-left text-xs hover:bg-blue-50 dark:hover:bg-blue-900/20 ' +
                    (table === t.name ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300')
                  }
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">列{table ? ` · ${table}` : ''}</div>
          {!table ? (
            <p className="text-xs text-gray-400">选择左侧表查看列</p>
          ) : columnsQ.isLoading ? (
            <Skeleton lines={3} />
          ) : columnsQ.isError ? (
            <EmptyState title="读取列失败" />
          ) : (
            <div className="max-h-48 overflow-auto rounded-md border border-gray-200 dark:border-gray-700">
              <table className="w-full text-xs">
                <tbody>
                  {(columnsQ.data ?? []).map((c) => (
                    <tr key={c.name} className="border-b border-gray-100 last:border-0 dark:border-gray-700">
                      <td className="px-2 py-1 font-mono text-gray-800 dark:text-gray-200">{c.name}</td>
                      <td className="px-2 py-1 text-gray-500 dark:text-gray-400">{c.type}</td>
                      <td className="px-2 py-1 text-gray-400">{c.nullable ? 'NULL' : 'NOT NULL'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
