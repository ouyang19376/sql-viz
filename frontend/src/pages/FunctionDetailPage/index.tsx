import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { Copy } from 'lucide-react'
import { useDialectStore } from '@/stores/useDialectStore'
import { useRecentStore } from '@/stores/useRecentStore'
import { useFunction } from '@/api/queries'
import { ApiError } from '@/types'
import type { DialectId, AnimationStep } from '@/types'
import Skeleton from '@/components/shared/Skeleton'
import EmptyState from '@/components/shared/EmptyState'
import Breadcrumb from '@/components/shared/Breadcrumb'
import { useKeyboardShortcuts, type ShortcutHandlers } from '@/hooks/useKeyboardShortcuts'
import FunctionMeta from './FunctionMeta'
import CodeBlock from '@/components/code/CodeBlock'
import AnimationPlayer, {
  type AnimationPlayerHandle,
} from '@/components/animation/AnimationPlayer'

/** 函数详情页（FD + AN 模块）：
 * F-FD-01 函数详情 / F-FD-02 多签名切换（FunctionMeta 内 SignatureTabs）/
 * F-FD-03 跨方言对照（FunctionMeta 内 useCompatible）。
 * AN 模块：右侧 SQL 代码块（高亮联动）+ 动画播放器。
 * §7.1 方言不存在该函数 → 自动回方言页 + toast。
 * §7.4 Space/←/→/R 动画快捷键。 */
export default function FunctionDetailPage() {
  const { dialectId = '', functionId = '' } = useParams()
  const navigate = useNavigate()
  const setDialect = useDialectStore((s) => s.setDialect)
  const addRecent = useRecentStore((s) => s.add)
  const { data, isLoading, error, refetch, isFetching } = useFunction(
    dialectId,
    functionId,
  )

  // 动画联动：当前步骤高亮的 SQL 行号
  const [highlightedLines, setHighlightedLines] = useState<number[]>([])
  const playerRef = useRef<AnimationPlayerHandle>(null)

  // 区分 404（函数在当前方言不存在）与其他错误（网络/服务异常）
  const is404 =
    !!error && error instanceof ApiError && (error.code === 404 || error.code === 4040)

  // 进入方言页时同步全局 store（Navbar 主题色跟随）
  useEffect(() => {
    if (dialectId) {
      setDialect(dialectId as DialectId)
    }
  }, [dialectId, setDialect])

  // §7.1：函数详情 + 方言切换无对应函数 → 回方言页 + toast
  // 仅 404 触发；网络错误保留在当前页给出"重试"出口
  useEffect(() => {
    if (is404 && dialectId) {
      toast.error('该方言中不存在此函数', { duration: 2200 })
      navigate(`/dialect/${dialectId}`, { replace: true })
    }
  }, [is404, dialectId, navigate])

  // 记录最近查看（补全 F-FC-05 记录链路）
  useEffect(() => {
    if (dialectId && functionId && data) {
      addRecent(functionId, dialectId)
    }
  }, [dialectId, functionId, data, addRecent])

  // §7.4 动画快捷键：Space 播放/暂停、←/→ 上/下一步、R 重置
  // 仅在有数据时挂载，避免空步时按键报错；useKeyboardShortcuts 内已抑制输入框焦点
  const shortcuts = useMemo<ShortcutHandlers>(
    () =>
      data
        ? {
            space: () => playerRef.current?.togglePlay(),
            left: () => playerRef.current?.prevStep(),
            right: () => playerRef.current?.nextStep(),
            r: () => playerRef.current?.reset(),
          }
        : ({} as ShortcutHandlers),
    [data],
  )
  useKeyboardShortcuts(shortcuts)

  // 把所有 hook 集中在条件 return 之前调用，避免「rendered more hooks than previous」
  const fn = data?.function
  const dialect = data?.dialect
  const steps: AnimationStep[] = fn?.animation?.steps ?? []

  // F-SC-04：构建 line → step 映射；同一行被多 step 引用时取首个出现（tech-plan §7 难点 5）
  const lineToStep = useMemo(() => {
    const map = new Map<number, number>()
    steps.forEach((s, idx) => {
      s.highlight_lines?.forEach((ln) => {
        if (!map.has(ln)) map.set(ln, idx)
      })
    })
    return map
  }, [steps])
  const clickableLines = useMemo(() => Array.from(lineToStep.keys()), [lineToStep])

  if (isLoading) return <Skeleton lines={6} />

  // 404 已在上方 useEffect 触发跳转；这里渲染一帧占位防止闪现
  if (is404) return <Skeleton lines={6} />

  if (error || !data || !fn || !dialect) {
    return (
      <EmptyState
        title="加载失败"
        description="无法获取函数数据，请检查网络后重试"
        actionLabel={isFetching ? '重试中…' : '重试'}
        onAction={() => refetch()}
      />
    )
  }

  const handleStepChange = (_idx: number, step: AnimationStep) => {
    setHighlightedLines(step.highlight_lines ?? [])
  }

  const handleLineClick = (line: number) => {
    const idx = lineToStep.get(line)
    if (idx !== undefined) playerRef.current?.goToStep(idx)
  }

  // §7.2 复制 SQL + Toast
  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fn.example_code)
      } else {
        // 老浏览器兜底
        const ta = document.createElement('textarea')
        ta.value = fn.example_code
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      toast.success('已复制', { duration: 1500 })
    } catch {
      toast.error('复制失败，请手动选择')
    }
  }

  return (
    <div>
      {/* 面包屑（F-CM-04）+ 主题色头部 */}
      <Breadcrumb
        items={[
          { label: '首页', to: '/sql' },
          { label: dialect.name, to: `/dialect/${dialectId}` },
          { label: fn.name },
        ]}
        highlightLast
      />

      <div
        className="rounded-xl p-6 text-white"
        style={{ backgroundColor: dialect.color }}
      >
        <p className="text-sm opacity-90">{dialect.name} · 函数详情</p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* 左：函数元信息 */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <FunctionMeta fn={fn} dialectId={dialectId} />
        </div>

        {/* 右：SQL 代码块 + 动画播放器（AN 模块） */}
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                示例 SQL
              </h2>
              <button
                type="button"
                onClick={handleCopy}
                aria-label="复制 SQL"
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              >
                <Copy className="h-3.5 w-3.5" />
                复制
              </button>
            </div>
            <CodeBlock
              code={fn.example_code}
              highlightLines={highlightedLines}
              clickableLines={clickableLines}
              onLineClick={handleLineClick}
            />
            {fn.example_description && (
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                {fn.example_description}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              动画演示
            </h2>
            <AnimationPlayer
              ref={playerRef}
              steps={steps}
              dialectColor={dialect.color}
              autoPlay
              onStepChange={handleStepChange}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
