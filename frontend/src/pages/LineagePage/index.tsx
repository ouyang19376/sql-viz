import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Database, Download, GitBranch, ListTree, Play, RotateCcw, Search } from 'lucide-react'
import { toast } from 'sonner'
import EmptyState from '@/components/shared/EmptyState'
import Skeleton from '@/components/shared/Skeleton'
import ScriptUploader from '@/components/lineage/ScriptUploader'
import SqlTextarea from '@/components/lineage/SqlTextarea'
import DialectSelector from '@/components/lineage/DialectSelector'
import WarningList from '@/components/lineage/WarningList'
import RefusalAlert from '@/components/lineage/RefusalAlert'
import DependencyTable from '@/components/lineage/DependencyTable'
import LineageGraph from '@/components/lineage/LineageGraph'
import { useLineageAnalysisMutation, useNeo4jPushMutation } from '@/api/lineage'
import { LINEAGE_LIMITS, type LineageAnalysisResult, type LineageInputSource, type ResultViewMode, type SqlDialect } from '@/types/lineage'
import { countSources, countTargets } from '@/lib/lineage/toDependencyRows'
import { generateCypher } from '@/lib/lineage/generateCypher'
import { generateLineageWorkbook } from '@/lib/lineage/generateLineageWorkbook'
import { exportWorkbook } from '@/lib/exporters/exportXlsx'
import { downloadFile } from '@/lib/exporters/downloadFile'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const STORAGE_KEY = 'sql-viz-lineage-last-input'

interface StoredLineageInput {
  sql: string
  dialect: SqlDialect
  source: LineageInputSource
  fileName?: string
  fileSize?: number
  fileCount?: number
}

function loadStoredInput(): StoredLineageInput {
  if (typeof window === 'undefined') return { sql: '', dialect: 'auto', source: 'paste' }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { sql: '', dialect: 'auto', source: 'paste' }
    const data = JSON.parse(raw) as Partial<StoredLineageInput>
    return {
      sql: typeof data.sql === 'string' ? data.sql : '',
      dialect: data.dialect ?? 'auto',
      source: data.source ?? 'paste',
      fileName: data.fileName,
      fileSize: data.fileSize,
      fileCount: data.fileCount,
    }
  } catch {
    return { sql: '', dialect: 'auto', source: 'paste' }
  }
}

function buildFilename(ext: 'cypher' | 'xlsx' | 'json'): string {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `sql-lineage-${ts}.${ext}`
}

/** SQL 血缘分析页（F-LN-01 ~ F-LN-14）。 */
export default function LineagePage() {
  const [storedInputLoaded, setStoredInputLoaded] = useState(false)
  const [sql, setSql] = useState('')
  const [dialect, setDialect] = useState<SqlDialect>('auto')
  const [source, setSource] = useState<LineageInputSource>('paste')
  const [fileName, setFileName] = useState<string | undefined>()
  const [fileSize, setFileSize] = useState<number | undefined>()
  const [fileCount, setFileCount] = useState<number | undefined>()
  const [result, setResult] = useState<LineageAnalysisResult | null>(null)
  const [refusalMessage, setRefusalMessage] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ResultViewMode>('graph')
  const [searchText, setSearchText] = useState('')
  const [targetFilter, setTargetFilter] = useState('all')

  useEffect(() => {
    const stored = loadStoredInput()
    setSql(stored.sql)
    setDialect(stored.dialect)
    setSource(stored.source)
    setFileName(stored.fileName)
    setFileSize(stored.fileSize)
    setFileCount(stored.fileCount)
    setStoredInputLoaded(true)
  }, [])

  useEffect(() => {
    if (!storedInputLoaded) return
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ sql, dialect, source, fileName, fileSize, fileCount }),
    )
  }, [dialect, fileCount, fileName, fileSize, source, sql, storedInputLoaded])

  const filteredResult = useMemo(() => {
    if (!result) return null
    let dependencies = result.dependencies
    if (targetFilter !== 'all') dependencies = dependencies.filter((dep) => dep.target === targetFilter)
    const q = searchText.trim().toLowerCase()
    if (q) dependencies = dependencies.filter((dep) => {
      const source = result.tables.find((table) => table.id === dep.source)?.name ?? dep.source
      const target = result.tables.find((table) => table.id === dep.target)?.name ?? dep.target
      return source.toLowerCase().includes(q) || target.toLowerCase().includes(q)
    })
    if (dependencies === result.dependencies) return result
    const ids = new Set(dependencies.flatMap((dep) => [dep.source, dep.target]))
    return { ...result, tables: result.tables.filter((table) => ids.has(table.id)), dependencies }
  }, [result, searchText, targetFilter])

  const targetOptions = useMemo(() => {
    if (!result) return []
    const ids = [...new Set(result.dependencies.map((dep) => dep.target))]
    return ids.map((id) => ({ id, name: result.tables.find((table) => table.id === id)?.name ?? id }))
  }, [result])

  const mutation = useLineageAnalysisMutation()
  const neo4jMutation = useNeo4jPushMutation()
  const isAnalyzing = mutation.isPending
  const overLimit = sql.length > LINEAGE_LIMITS.SQL_MAX_CHARS
  const canAnalyze = sql.trim().length > 0 && !overLimit && !isAnalyzing

  const handleSqlChange = (nextSql: string) => {
    setSql(nextSql)
    setSource('paste')
    setFileName(undefined)
    setFileSize(undefined)
    setFileCount(undefined)
  }

  const handleFileLoaded = (content: string, nextFileName: string, nextFileSize: number) => {
    setSql(content)
    setSource('upload')
    setFileName(nextFileName)
    setFileSize(nextFileSize)
    setFileCount(undefined)
  }

  const handleBatchLoaded = (content: string, nextFileName: string, nextFileSize: number, nextFileCount: number) => {
    setSql(content)
    setSource('batch')
    setFileName(nextFileName)
    setFileSize(nextFileSize)
    setFileCount(nextFileCount)
  }

  const handleAnalyze = () => {
    if (!canAnalyze) return
    setRefusalMessage(null)
    mutation.mutate(
      { sql, dialect },
      {
        onSuccess: (data) => {
          if (data.refused) {
            setResult(null)
            setRefusalMessage(data.message)
            toast.error('分析请求被拒')
            return
          }
          setResult(data.result)
          setSearchText('')
          setTargetFilter('all')
          setViewMode('graph')
          toast.success(`分析完成，共识别 ${data.result.tables.length} 张表、${data.result.dependencies.length} 条依赖`)
          requestAnimationFrame(() => {
            document.getElementById('lineage-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          })
        },
        onError: (err) => {
          toast.error(`分析失败：${err.message}`, {
            action: { label: '重试', onClick: handleAnalyze },
          })
        },
      },
    )
  }

  const handleReset = () => {
    if (sql || result || refusalMessage) {
      if (!window.confirm('确定要清空当前输入和分析结果吗？')) return
    }
    setSql('')
    setSource('paste')
    setFileName(undefined)
    setFileSize(undefined)
    setFileCount(undefined)
    setResult(null)
    setRefusalMessage(null)
    setSearchText('')
    setTargetFilter('all')
    mutation.reset()
    window.localStorage.removeItem(STORAGE_KEY)
  }

  const handleDownloadCypher = () => {
    if (!result) return
    const filename = buildFilename('cypher')
    downloadFile(new Blob([generateCypher(result)], { type: 'text/plain;charset=utf-8' }), filename)
    toast.success(`Cypher 脚本下载已开始：${filename}`)
  }

  const handleDownloadExcel = () => {
    if (!result) return
    const filename = buildFilename('xlsx')
    const sheets = generateLineageWorkbook(result)
    downloadFile(exportWorkbook(sheets), filename)
    toast.success(`Excel 清单下载已开始：${filename}`)
  }

  const handleDownloadJson = () => {
    if (!result) return
    const filename = buildFilename('json')
    downloadFile(
      new Blob([JSON.stringify(result, null, 2)], { type: 'application/json;charset=utf-8' }),
      filename,
    )
    toast.success(`JSON 原始结构下载已开始：${filename}`)
  }

  const handlePushNeo4j = () => {
    if (!result || neo4jMutation.isPending) return
    if (!window.confirm('将当前血缘结果写入已配置的 Neo4j 数据库，是否继续？')) return
    neo4jMutation.mutate(
      { result },
      {
        onSuccess: (data) => {
          toast.success(`Neo4j 写入完成：${data.tables} 个节点、${data.dependencies} 条关系`)
        },
        onError: (err) => {
          toast.error(`Neo4j 写入失败：${err.message}`)
        },
      },
    )
  }

  const summaryCards = result
    ? [
        { label: '目标表', value: countTargets(result).toString(), description: '有入边的产出表' },
        { label: '源表', value: countSources(result).toString(), description: '被读取的上游表' },
        { label: '依赖关系', value: result.dependencies.length.toString(), description: 'source → target' },
        { label: 'Warnings', value: result.warnings.length.toString(), description: '需人工复核项' },
      ]
    : [
        { label: '目标表', value: '--', description: '等待解析后展示' },
        { label: '源表', value: '--', description: '等待解析后展示' },
        { label: '依赖关系', value: '--', description: '等待解析后展示' },
        { label: 'Warnings', value: '--', description: '等待解析后展示' },
      ]

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
          <GitBranch className="h-3.5 w-3.5" />
          SQL Lineage
        </div>
        <h1 className="mt-3 text-2xl font-bold text-gray-900 dark:text-gray-100">SQL 血缘分析</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
          粘贴 SQL / HQL 脚本或上传脚本文件，解析表级依赖并生成图谱、清单与治理导出。
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
            <Database className="h-5 w-5 text-teal-600" />
            输入区
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            支持粘贴脚本或上传 .sql / .hql / .txt 文件，当前最多 {LINEAGE_LIMITS.SQL_MAX_CHARS.toLocaleString()} 字符。
          </p>

          <div className="mt-5 space-y-4">
            <SqlTextarea
              value={sql}
              onChange={handleSqlChange}
              disabled={isAnalyzing}
              onAnalyze={handleAnalyze}
            />

            <ScriptUploader
              onFileLoaded={handleFileLoaded}
              onBatchLoaded={handleBatchLoaded}
              hasExistingContent={sql.trim().length > 0}
              disabled={isAnalyzing}
            />

            {(source === 'upload' || source === 'batch') && fileName && typeof fileSize === 'number' && (
              <div className="rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-xs text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300">
                已加载{source === 'batch' ? `批量文件：${fileCount ?? 0} 个` : '文件'}：<span className="font-medium">{fileName}</span>（{formatFileSize(fileSize)}）
              </div>
            )}

            <DialectSelector value={dialect} onChange={setDialect} disabled={isAnalyzing} />

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={handleReset}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              >
                <RotateCcw className="h-4 w-4" />
                重置
              </button>
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={!canAnalyze}
                className="inline-flex items-center gap-1.5 rounded-md bg-teal-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                {isAnalyzing ? '分析中…' : '分析血缘'}
              </button>
            </div>
          </div>
        </section>

        <section id="lineage-result" className="min-w-0 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                <ListTree className="h-5 w-5 text-teal-600" />
                结果区
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {result ? result.summary : '分析完成后展示摘要、图谱、依赖清单与导出按钮。'}
              </p>
            </div>
            <div className="flex rounded-lg bg-gray-100 p-1 text-sm dark:bg-gray-800">
              {(['graph', 'table'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  disabled={!result}
                  className={
                    'rounded-md px-3 py-1.5 font-medium disabled:cursor-not-allowed disabled:opacity-50 ' +
                    (viewMode === mode
                      ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                      : 'text-gray-500 dark:text-gray-400')
                  }
                >
                  {mode === 'graph' ? '图谱' : '表格'}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <div key={card.label} className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{card.label}</div>
                <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">{card.value}</div>
                <div className="mt-1 text-xs text-gray-400">{card.description}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-4">
            {isAnalyzing && <Skeleton lines={4} />}
            {mutation.isError && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  分析失败
                </div>
                <p className="mt-1">{mutation.error.message}</p>
              </div>
            )}
            {refusalMessage && <RefusalAlert message={refusalMessage} onDismiss={() => setRefusalMessage(null)} />}
            {result && <WarningList warnings={result.warnings} />}
            {result && (
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={handleDownloadCypher} className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                  <Download className="h-4 w-4" />
                  下载 Cypher
                </button>
                <button type="button" onClick={handleDownloadExcel} className="inline-flex items-center gap-1.5 rounded-md bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700">
                  <Download className="h-4 w-4" />
                  下载 Excel
                </button>
                <button type="button" onClick={handleDownloadJson} className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                  <Download className="h-4 w-4" />
                  下载 JSON
                </button>
                <button type="button" onClick={handlePushNeo4j} disabled={neo4jMutation.isPending} className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-700">
                  <Database className="h-4 w-4" />
                  {neo4jMutation.isPending ? '推送中…' : '推送 Neo4j'}
                </button>
              </div>
            )}
            {result && (
              <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  节点搜索（P1）
                  <span className="relative">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <input
                      value={searchText}
                      onChange={(event) => setSearchText(event.target.value)}
                      placeholder="按源表或目标表搜索"
                      className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    />
                  </span>
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  按目标表过滤（P1）
                  <select
                    value={targetFilter}
                    onChange={(event) => setTargetFilter(event.target.value)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  >
                    <option value="all">全部目标表</option>
                    {targetOptions.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {result && filteredResult && filteredResult !== result && (
              <div className="rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-xs text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300">
                当前筛选结果：{filteredResult.tables.length} 张表、{filteredResult.dependencies.length} 条依赖。
              </div>
            )}
            {result ? (viewMode === 'graph' ? <LineageGraph result={filteredResult ?? result} /> : <DependencyTable result={filteredResult ?? result} />) : (
              !isAnalyzing && !refusalMessage && (
                <EmptyState
                  title="暂无血缘结果"
                  description="请粘贴 SQL 脚本或上传文件后点击分析血缘。"
                />
              )
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
