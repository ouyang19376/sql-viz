import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Copy, Download, ExternalLink, Loader2 } from 'lucide-react'
import CodeBlock from '@/components/code/CodeBlock'
import { downloadFile } from '@/lib/exporters/downloadFile'
import { useDataProfileStore } from '@/stores/useDataProfileStore'
import type { AskSource, AskValidation, RagDialect } from '@/types/rag-sql'
import SourceList from './SourceList'

interface Props {
  sql: string
  sources: AskSource[]
  degraded: boolean
  degradeReason?: string | null
  validation?: AskValidation
  dialect: RagDialect
  streaming: boolean
  done: boolean
}

/** 生成结果展示（F-AS-08 结果展示与导出 / F-AS-07 校验徽标 / F-AS-09 来源 / F-AS-10/11 降级 / F-AS-14 联动工作台）。 */
export default function AskResult({
  sql,
  sources,
  degraded,
  degradeReason,
  validation,
  dialect,
  streaming,
  done,
}: Props) {
  const navigate = useNavigate()
  const setWorkbenchSql = useDataProfileStore((s) => s.setWorkbenchSql)
  const setActiveTab = useDataProfileStore((s) => s.setActiveTab)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sql)
      setCopied(true)
      toast.success('已复制 SQL')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('复制失败')
    }
  }

  const handleDownload = () => {
    downloadFile(new Blob([sql], { type: 'text/plain;charset=utf-8' }), `query-${dialect}.sql`)
  }

  /** F-AS-14：导入 dataprofile 查询工作台执行（store 即注入点，不改 dataprofile 后端/路由）。 */
  const handleImportWorkbench = () => {
    if (!sql) return
    setWorkbenchSql(sql)
    setActiveTab('bench')
    navigate('/dataprofile?tab=bench')
    toast.success('已导入查询工作台，选择数据源后可执行')
  }

  const allowed = validation?.allowed
  const violations = validation?.violations ?? []

  return (
    <div className="space-y-4">
      {/* SQL 块 + 工具栏 */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink-2">生成 SQL</span>
            {streaming && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                生成中…
              </span>
            )}
            {done && allowed === true && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                校验通过
              </span>
            )}
            {done && allowed === false && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/10 dark:text-red-400">
                <AlertTriangle className="h-3 w-3" />
                校验未过
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!sql}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-2 transition-colors hover:bg-surface-2 disabled:opacity-40"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? '已复制' : '复制'}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!sql}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-2 transition-colors hover:bg-surface-2 disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              下载 .sql
            </button>
            {done && (
              <button
                type="button"
                onClick={handleImportWorkbench}
                disabled={!sql}
                title="导入 dataprofile 查询工作台执行"
                className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-40"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                导入工作台执行
              </button>
            )}
          </div>
        </div>

        {/* F-AS-07：校验未过 -> SQL 标红边框 + 违规项（不交付坏 SQL 执行，但仍展示供重试） */}
        <div className={done && allowed === false ? 'rounded-lg ring-2 ring-red-400' : ''}>
          <CodeBlock code={sql || ''} />
        </div>
        {done && allowed === false && violations.length > 0 && (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-500/10 dark:text-red-300">
            <p className="font-medium">违规项：</p>
            <ul className="ml-4 list-disc">
              {violations.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* F-AS-10/11 降级提示 */}
      {degraded && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            {degradeReason || '结果未对齐业务模型'}
            <span className="ml-1 text-xs opacity-75">基于通用能力生成，建议核对表名/字段</span>
          </div>
        </div>
      )}

      {/* F-AS-09 来源追溯 */}
      <SourceList sources={sources} />
    </div>
  )
}
