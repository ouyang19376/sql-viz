import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useGenerateMutation } from '@/api/datatest'
import { useDataTestStore } from '@/stores/useDataTestStore'
import type {
  DataTestMode,
  GenerateRequest,
  GenerateResponseRefused,
  GenerateResponseSuccess,
} from '@/types/datatest'
import ModeTabs from '@/components/datatest/ModeTabs'
import NaturalLanguagePanel from '@/components/datatest/NaturalLanguagePanel'
import SchemaBuilderPanel from '@/components/datatest/SchemaBuilderPanel'
import ResultPreview from '@/components/datatest/ResultPreview'
import RefusalAlert from '@/components/datatest/RefusalAlert'

/** 测试数据集工具主页（DT 模块 F-DT-01 ~ F-DT-11）。 */
export default function DataTestPage() {
  const mode = useDataTestStore((s) => s.mode)
  const setMode = useDataTestStore((s) => s.setMode)
  const reset = useDataTestStore((s) => s.reset)
  const prompt = useDataTestStore((s) => s.prompt)
  const fields = useDataTestStore((s) => s.fields)
  const rowCount = useDataTestStore((s) => s.rowCount)
  const format = useDataTestStore((s) => s.format)

  const mutation = useGenerateMutation()

  // 拒答态单独存（不与 success 共存；后续提交清空）
  const [refused, setRefused] = useState<GenerateResponseRefused | null>(null)

  // 成功结果（缓存上一次提交的成功响应；切 Tab/重置/再提交时清）
  const [result, setResult] = useState<GenerateResponseSuccess | null>(null)
  // result 也记下生成时的 mode/format，确保下载文件名与生成时一致（之后用户改 format 也不影响）
  const [resultCtx, setResultCtx] = useState<{
    mode: DataTestMode
    format: GenerateRequest['format']
  } | null>(null)

  const loading = mutation.isPending

  // F-DT-07 提交流程
  const handleSubmit = () => {
    setRefused(null)
    const req: GenerateRequest = {
      mode,
      prompt: mode === 'natural_language' ? prompt : undefined,
      fields: mode === 'schema' ? fields : undefined,
      rowCount,
      format,
    }
    mutation.mutate(req, {
      onSuccess: (data) => {
        if (data.refused) {
          setResult(null)
          setResultCtx(null)
          setRefused(data)
          toast.error('请求被拒')
        } else {
          setResult(data)
          setResultCtx({ mode, format })
          toast.success(`生成成功，共 ${data.rows.length} 行`)
          // 滚动到结果区
          requestAnimationFrame(() => {
            document
              .getElementById('dt-result')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          })
        }
      },
      onError: (err) => {
        toast.error(`生成失败：${err.message}`, {
          action: { label: '重试', onClick: handleSubmit },
        })
      },
    })
  }

  // F-DT-11 重置（含二次确认 PRD §7.3）
  const handleReset = () => {
    if (result || refused || prompt || fields.length > 0) {
      if (!window.confirm('确定要清空所有输入和结果？')) return
    }
    setResult(null)
    setResultCtx(null)
    setRefused(null)
    mutation.reset()
    reset()
  }

  // F-DT-01 Tab 切换：有结果时二次确认（PRD §7.3 / plan §6.7）
  const handleModeChange = (next: DataTestMode) => {
    if (next === mode) return
    if (result || refused) {
      if (!window.confirm('切换会清空当前结果，是否继续？')) return
      setResult(null)
      setResultCtx(null)
      setRefused(null)
    }
    setMode(next)
  }

  // PRD §7.4：Ctrl/Cmd + Enter 提交
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (!loading) handleSubmit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, prompt, fields, rowCount, format, loading])

  // 生成中提示
  const loadingHint = useMemo(
    () => (loading ? 'LLM 正在生成中，请稍候…' : null),
    [loading],
  )

  return (
    <div className="mx-auto max-w-[960px]">
      {/* PageHeader */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">测试数据集工具</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          用 LLM 一键生成结构化测试数据，支持 xlsx / json / csv 三格式导出
        </p>
      </div>

      {/* 主面板卡片 */}
      <div className="relative rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <ModeTabs value={mode} onChange={handleModeChange} disabled={loading} />

        <div className="mt-6">
          {mode === 'natural_language' ? (
            <NaturalLanguagePanel
              loading={loading}
              onSubmit={handleSubmit}
              onReset={handleReset}
            />
          ) : (
            <SchemaBuilderPanel
              loading={loading}
              onSubmit={handleSubmit}
              onReset={handleReset}
            />
          )}
        </div>

        {/* 加载蒙层 */}
        {loadingHint && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur-sm dark:bg-gray-900/70">
            <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm text-gray-700 shadow-md dark:bg-gray-800 dark:text-gray-200">
              <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
              {loadingHint}
            </div>
          </div>
        )}
      </div>

      {/* F-DT-10：拒答 Alert */}
      {refused && (
        <RefusalAlert
          message={refused.message}
          onDismiss={() => setRefused(null)}
        />
      )}

      {/* F-DT-08 / F-DT-09：结果预览 + 下载 */}
      {result && resultCtx && (
        <div id="dt-result">
          <ResultPreview result={result} mode={resultCtx.mode} format={resultCtx.format} />
        </div>
      )}
    </div>
  )
}
