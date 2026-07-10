import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { AlertCircle, History, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { ApiError } from '@/types'
import { useGenerateMutation } from '@/api/dataprofile'
import { downloadFile } from '@/lib/exporters/downloadFile'
import { useDataProfileStore } from '@/stores/useDataProfileStore'
import type {
  GenerateHistoryEntry,
  GenerateProfileRequest,
  GenerateProfileResponse,
  ScriptSegment,
} from '@/types/dataprofile'
import GenerateConfigForm from './components/GenerateConfigForm'
import GeneratedScriptList from './components/GeneratedScriptList'

const rid = () => `g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** 脚本生成 Tab（F-PG-01~14）。
 *  配置 -> 生成（模板 + LLM + 静态分析 + EXPLAIN）-> 脚本段列表 -> 导入代码区 / 下载。 */
export default function GeneratePanel() {
  const setPendingImport = useDataProfileStore((s) => s.setPendingImport)
  const setActiveTab = useDataProfileStore((s) => s.setActiveTab)
  const generateHistory = useDataProfileStore((s) => s.generateHistory)
  const pushGenerateHistory = useDataProfileStore((s) => s.pushGenerateHistory)
  const [, setSearchParams] = useSearchParams()

  const genMut = useGenerateMutation()
  const [result, setResult] = useState<GenerateProfileResponse | null>(null)
  const [lastReq, setLastReq] = useState<GenerateProfileRequest | null>(null)
  const [refill, setRefill] = useState<GenerateHistoryEntry | null>(null)
  const [formKey, setFormKey] = useState(0)

  const handleGenerate = (req: GenerateProfileRequest) => {
    setLastReq(req)
    genMut.mutate(req, {
      onSuccess: (resp) => {
        setResult(resp)
        pushGenerateHistory({
          id: rid(),
          datasourceId: req.datasourceId,
          dialect: req.dialect,
          sourceType: req.sourceType,
          tables: req.tables,
          database: req.database,
          metricIds: req.metricIds,
          customRuleIds: req.customRuleIds,
          outputMode: req.outputMode,
          createdAt: Date.now(),
          segmentCount: resp.segments.length,
        })
        if (resp.refused) toast.error(resp.message ?? '生成失败')
        else if (resp.partialFailures.length > 0)
          toast.warning(`生成完成，${resp.partialFailures.length} 段失败`)
        else toast.success(`已生成 ${resp.segments.length} 段脚本`)
      },
      onError: (e: Error) => {
        const code = (e as ApiError).code
        if (code === 504) toast.error('生成超时（LLM 调用超时），请稍后重试')
        else toast.error(e.message || '生成失败')
      },
    })
  }

  const goToBench = (segs: ScriptSegment[]) => {
    setPendingImport(segs)
    setActiveTab('bench')
    setSearchParams({ tab: 'bench' }, { replace: true })
  }

  const handleRefill = (h: GenerateHistoryEntry) => {
    setRefill(h)
    setFormKey((k) => k + 1)
    setResult(null)
    toast.success('已回填生成配置')
  }

  const handleDownload = () => {
    if (!result || result.segments.length === 0) return
    const sql = result.segments.map((s) => s.sql).join(';\n\n')
    const blob = new Blob([sql + ';\n'], { type: 'text/sql;charset=utf-8' })
    downloadFile(blob, `profile-${result.dialect}-${stamp()}.sql`)
  }

  const generating = genMut.isPending

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        配置数据源与指标，一键生成数据质量探查脚本。内置指标走模板（零 LLM），自定义规则走 LLM 仿写；
        所有段经静态分析与 EXPLAIN 校验后可导入工作台或下载。
      </p>

      <GenerateConfigForm key={formKey} initial={refill} onGenerate={handleGenerate} generating={generating} />

      {generating && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          生成中，含静态分析与试运行…
        </div>
      )}

      {result?.refused && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <div className="font-medium">{result.message ?? '生成失败'}</div>
            {result.partialFailures.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs">
                {result.partialFailures.map((f, i) => (
                  <li key={i}>{f.title}：{f.error}</li>
                ))}
              </ul>
            )}
          </div>
          {lastReq && (
            <button
              type="button"
              onClick={() => lastReq && handleGenerate(lastReq)}
              disabled={generating}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs hover:bg-red-100 disabled:opacity-40 dark:border-red-700 dark:hover:bg-red-900/30"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              重试
            </button>
          )}
        </div>
      )}

      {result && !result.refused && (
        <GeneratedScriptList
          segments={result.segments}
          partialFailures={result.partialFailures}
          onImportSegment={(seg) => goToBench([seg])}
          onImportAll={() => goToBench(result.segments)}
          onDownload={handleDownload}
        />
      )}

      {/* 生成历史（F-PG-14） */}
      <details className="rounded-lg border border-gray-200 dark:border-gray-700">
        <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300">
          <History className="h-4 w-4" />
          生成历史（{generateHistory.length}）
        </summary>
        <div className="max-h-64 overflow-auto px-3 pb-2">
          {generateHistory.length === 0 ? (
            <p className="py-3 text-xs text-gray-400">暂无历史</p>
          ) : (
            generateHistory.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => handleRefill(h)}
                className="block w-full truncate px-2 py-1.5 text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
                title={`${h.metricIds.join(',')} ${h.customRuleIds.join(',')}`}
              >
                <span className="text-gray-400">{new Date(h.createdAt).toLocaleString()}</span>
                <span className="ml-2 text-gray-700 dark:text-gray-200">
                  {h.sourceType === 'tables' ? (h.tables?.join(', ') || '-') : h.database} · {h.metricIds.length + h.customRuleIds.length} 项 · {h.outputMode === 'split' ? '拆分' : '合并'} · {h.segmentCount} 段
                </span>
              </button>
            ))
          )}
        </div>
      </details>
    </div>
  )
}
