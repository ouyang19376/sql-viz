import { useEffect, useRef, useState } from 'react'
import { Download, History, Loader2, Play, Square, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ApiError } from '@/types'
import { useFormatSqlMutation, useRunQueryMutation, useSources } from '@/api/dataprofile'
import { downloadFile } from '@/lib/exporters/downloadFile'
import { exportCsv } from '@/lib/exporters/exportCsv'
import { exportJson } from '@/lib/exporters/exportJson'
import { exportXlsx } from '@/lib/exporters/exportXlsx'
import { useDataProfileStore } from '@/stores/useDataProfileStore'
import type { ProfileDialect, QueryHistoryEntry } from '@/types/dataprofile'
import { isBlockedResult } from '@/types/dataprofile'
import CodeEditor from './components/CodeEditor'
import DataSourcePicker from './components/DataSourcePicker'
import ResultPreview from './components/ResultPreview'

const PAGE_SIZES = [20, 50, 100, 200]

const rid = () => `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(
    d.getMinutes(),
  )}${p(d.getSeconds())}`
}

/** 查询工作台（F-QB-01 ~ F-QB-11）。
 *  运行：先由后端 /query 内部静态分析（拦截则返回 analysis，不执行），否则执行分页只读查询。
 *  取消：AbortController 中断在途请求（F-QB-06）。结果/历史/分页进 store 跨 Tab 保活。
 */
export default function WorkbenchPanel() {
  const sql = useDataProfileStore((s) => s.workbenchSql)
  const setWorkbenchSql = useDataProfileStore((s) => s.setWorkbenchSql)
  const selectedId = useDataProfileStore((s) => s.selectedDatasourceId)
  const selectDatasource = useDataProfileStore((s) => s.selectDatasource)
  const lastResult = useDataProfileStore((s) => s.lastResult)
  const lastViolation = useDataProfileStore((s) => s.lastViolation)
  const setLastResult = useDataProfileStore((s) => s.setLastResult)
  const setLastViolation = useDataProfileStore((s) => s.setLastViolation)
  const currentPage = useDataProfileStore((s) => s.currentPage)
  const pageSize = useDataProfileStore((s) => s.pageSize)
  const setCurrentPage = useDataProfileStore((s) => s.setCurrentPage)
  const setPageSize = useDataProfileStore((s) => s.setPageSize)
  const pushHistory = useDataProfileStore((s) => s.pushQueryHistory)
  const history = useDataProfileStore((s) => s.queryHistory)
  const pendingImport = useDataProfileStore((s) => s.pendingImport)
  const consumePendingImport = useDataProfileStore((s) => s.consumePendingImport)

  const { data: sources } = useSources()
  const runMut = useRunQueryMutation()
  const fmtMut = useFormatSqlMutation()

  const abortRef = useRef<AbortController | null>(null)
  const [downloadOpen, setDownloadOpen] = useState(false)

  const selectedDs = sources?.find((s) => s.id === selectedId)
  const dialect: ProfileDialect = selectedDs?.dialect ?? 'mysql'

  // 自动选第一个已连接数据源（首次进入或所选被删除后）
  useEffect(() => {
    if (sources && sources.length > 0) {
      const exists = sources.some((s) => s.id === selectedId)
      if (!exists) {
        const first = sources.find((s) => s.status === 'connected') ?? sources[0]
        selectDatasource(first.id)
      }
    }
  }, [sources, selectedId, selectDatasource])

  // 消费生成->工作台导入（F-PG-11）：代码区空则直接回填，非空确认追加/覆盖
  useEffect(() => {
    if (!pendingImport) return
    const segs = consumePendingImport()
    if (!segs || segs.length === 0) return
    const incoming = segs.map((s) => s.sql).join(';\n\n')
    if (!sql.trim()) {
      setWorkbenchSql(incoming)
    } else {
      const append = window.confirm('代码区已有内容，是否追加到末尾？\n「确定」追加 / 「取消」覆盖')
      setWorkbenchSql(append ? `${sql}\n;\n\n${incoming}` : incoming)
    }
    toast.success(`已导入 ${segs.length} 段脚本到代码区`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingImport])

  const run = (page: number = 1) => {
    if (!selectedId) {
      toast.error('请先选择数据源')
      return
    }
    if (!sql.trim()) {
      toast.error('请输入 SQL')
      return
    }
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    runMut.mutate(
      { req: { datasourceId: selectedId, sql, page, pageSize }, signal: ctrl.signal },
      {
        onSuccess: (data) => {
          if (isBlockedResult(data)) {
            setLastViolation(data.analysis)
            setLastResult(null)
            pushHistory({
              id: rid(),
              sql,
              datasourceId: selectedId,
              dialect,
              createdAt: Date.now(),
              status: 'blocked',
              violations: data.analysis.violations,
            })
            toast.error('查询被拦截，未执行')
          } else {
            setLastResult(data)
            setLastViolation(null)
            setCurrentPage(page)
            pushHistory({
              id: rid(),
              sql,
              datasourceId: selectedId,
              dialect,
              createdAt: Date.now(),
              status: 'ok',
              rows: data.rows.length,
            })
          }
        },
        onError: (e: Error) => {
          if (e.name === 'AbortError') {
            toast('已取消')
            return
          }
          const code = (e as ApiError).code
          if (code === 504) toast.error('查询超时（>30s），已取消')
          else toast.error(e.message || '查询失败')
          pushHistory({
            id: rid(),
            sql,
            datasourceId: selectedId,
            dialect,
            createdAt: Date.now(),
            status: 'error',
          })
        },
      },
    )
  }

  const cancel = () => abortRef.current?.abort()

  const format = () => {
    if (!sql.trim()) {
      toast.error('请输入 SQL')
      return
    }
    fmtMut.mutate(
      { sql, dialect },
      {
        onSuccess: (r) => {
          setWorkbenchSql(r.sql)
          toast.success('已格式化')
        },
        onError: (e: ApiError) => toast.error(e.message || '格式化失败'),
      },
    )
  }

  const download = (fmt: 'csv' | 'json' | 'xlsx') => {
    if (!lastResult) return
    const blob =
      fmt === 'csv'
        ? exportCsv(lastResult.columns, lastResult.rows)
        : fmt === 'json'
          ? exportJson(lastResult.columns, lastResult.rows)
          : exportXlsx(lastResult.columns, lastResult.rows)
    downloadFile(blob, `query-${stamp()}.${fmt}`)
    setDownloadOpen(false)
  }

  const refill = (h: QueryHistoryEntry) => {
    setWorkbenchSql(h.sql)
    selectDatasource(h.datasourceId)
    toast.success('已回填代码区')
  }

  const running = runMut.isPending

  return (
    <div className="space-y-4">
      <p className="text-sm text-mute">
        选择数据源后输入只读 SELECT 查询。所有 SQL 经静态分析拦截 DML/DDL 后执行，结果分页预览，可下载。
      </p>

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <DataSourcePicker value={selectedId} onChange={selectDatasource} />

        <div className="flex items-center gap-1.5">
          {!running ? (
            <button
              type="button"
              onClick={() => run()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
            >
              <Play className="h-4 w-4" />
              运行
              <kbd className="ml-1 rounded bg-accent/40 px-1 text-xs">Ctrl+↵</kbd>
            </button>
          ) : (
            <button
              type="button"
              onClick={cancel}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              <Square className="h-4 w-4" />
              取消
            </button>
          )}

          <button
            type="button"
            onClick={format}
            disabled={fmtMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 disabled:opacity-40"
          >
            {fmtMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            格式化
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setDownloadOpen((o) => !o)}
              disabled={!lastResult}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              下载
            </button>
            {downloadOpen && (
              <div className="absolute right-0 z-20 mt-1 w-28 rounded-md border border-line bg-surface py-1 shadow-lg">
                {(['csv', 'json', 'xlsx'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => download(f)}
                    className="block w-full px-3 py-1.5 text-left text-sm text-ink-2 hover:bg-surface-2"
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5 text-xs text-mute">
          <span>每页</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 代码编辑器 */}
      <CodeEditor
        value={sql}
        onChange={setWorkbenchSql}
        onRun={() => run()}
        placeholder="输入只读 SELECT 查询，Ctrl+Enter 运行…"
      />

      {/* 拦截提示 */}
      {lastViolation && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          <div className="font-medium">查询被拦截，未执行：</div>
          <ul className="mt-1 list-disc pl-5">
            {lastViolation.violations.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 执行中 / 结果 */}
      {running && (
        <div className="flex items-center gap-2 text-sm text-mute">
          <Loader2 className="h-4 w-4 animate-spin" />
          执行中…
        </div>
      )}
      {lastResult && !running && (
        <ResultPreview
          result={lastResult}
          page={currentPage}
          pageSize={pageSize}
          onPageChange={(p) => run(p)}
        />
      )}

      {/* 执行历史（F-QB-10） */}
      <details className="rounded-lg border border-line">
        <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-sm font-medium text-ink-2">
          <History className="h-4 w-4" />
          执行历史（{history.length}）
        </summary>
        <div className="max-h-64 overflow-auto px-3 pb-2">
          {history.length === 0 ? (
            <p className="py-3 text-xs text-mute">暂无历史</p>
          ) : (
            history.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => refill(h)}
                className="block w-full truncate px-2 py-1 text-left text-xs hover:bg-surface-2"
                title={h.sql}
              >
                <span
                  className={
                    h.status === 'ok'
                      ? 'text-green-600'
                      : h.status === 'blocked'
                        ? 'text-amber-600'
                        : 'text-red-600'
                  }
                >
                  ●
                </span>
                <span className="ml-2 font-mono text-ink-2">
                  {h.sql.split('\n')[0].slice(0, 80) || '(空)'}
                </span>
              </button>
            ))
          )}
        </div>
      </details>
    </div>
  )
}
