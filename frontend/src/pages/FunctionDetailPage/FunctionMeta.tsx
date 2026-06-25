import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import type { FunctionDef } from '@/types'
import { useCompatible } from '@/api/queries'
import { useDialects } from '@/api/queries'
import SignatureTabs from './SignatureTabs'
import ParamsTable from './ParamsTable'

interface Props {
  fn: FunctionDef
  /** 当前方言 ID（用于收藏键与跨方言跳转过滤） */
  dialectId: string
}

/** 函数元信息（F-FD-01）：标题 + 签名 + 参数表 + 返回值 + 注意事项。
 * 内含跨方言对照（F-FD-03）。 */
export default function FunctionMeta({ fn, dialectId }: Props) {
  const { data: dialectsData } = useDialects()
  const dialectName = (id: string) =>
    dialectsData?.dialects.find((d) => d.id === id)?.name ?? id
  const dialectColor = (id: string) =>
    dialectsData?.dialects.find((d) => d.id === id)?.color ?? '#999'

  // 跨方言对照（F-FD-03）
  const { data: compatible } = useCompatible(fn.id)
  // 仅展示其他方言的同名函数
  const others =
    compatible?.mappings.filter((m) => m.dialect_id !== dialectId) ?? []

  return (
    <div className="space-y-5">
      {/* 标题 + 返回类型 */}
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="font-mono text-2xl font-bold text-gray-900 dark:text-gray-100">{fn.name}</h1>
        {fn.return_type && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            返回 <code className="font-mono text-gray-700 dark:text-gray-200">{fn.return_type}</code>
          </span>
        )}
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-300">{fn.description}</p>

      {/* 签名（含多签名切换 F-FD-02） */}
      <div>
        <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
          签名
        </h2>
        <SignatureTabs signature={fn.signature} />
      </div>

      {/* 参数表 */}
      <div>
        <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
          参数
        </h2>
        <ParamsTable params={fn.params} />
      </div>

      {/* 注意事项 */}
      {fn.note && (
        <div className="rounded-lg border-l-4 dialect-border bg-gray-50 px-4 py-3 dark:bg-gray-800/50">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
            注意事项
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-200">{fn.note}</p>
        </div>
      )}

      {/* 跨方言对照（F-FD-03） */}
      {others.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            跨方言对照
          </h2>
          <ul className="space-y-2">
            {others.map((m) => (
              <li key={m.dialect_id}>
                <Link
                  to={`/dialect/${m.dialect_id}/function/${fn.id}`}
                  className="group flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:border-[var(--dialect-color)] dark:border-gray-800 dark:bg-gray-900"
                >
                  <span
                    className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: dialectColor(m.dialect_id) }}
                  >
                    {dialectName(m.dialect_id)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <code className="block truncate font-mono text-sm text-gray-800 dark:text-gray-200">
                      {m.signature}
                    </code>
                    {m.note && (
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{m.note}</p>
                    )}
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-gray-300 group-hover:dialect-text" />
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-gray-400">
            其他方言中未找到同名函数时不会列出。
          </p>
        </div>
      )}
    </div>
  )
}
