import type { Param } from '@/types'

interface Props {
  params: Param[]
}

/** 参数列表表格（F-FD-01）：参数名 / 类型 / 必填 / 说明。 */
export default function ParamsTable({ params }: Props) {
  if (params.length === 0) {
    return (
      <p className="text-sm text-mute">该函数无参数。</p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-mute">
            <th className="py-2 pr-3 font-medium">参数</th>
            <th className="py-2 pr-3 font-medium">类型</th>
            <th className="py-2 pr-3 font-medium">必填</th>
            <th className="py-2 font-medium">说明</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {params.map((p) => (
            <tr key={p.name} className="align-top">
              <td className="py-2 pr-3 font-mono text-ink">{p.name}</td>
              <td className="py-2 pr-3">
                <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-ink-2">
                  {p.type}
                </code>
              </td>
              <td className="py-2 pr-3">
                {p.required ? (
                  <span className="dialect-text">是</span>
                ) : (
                  <span className="text-mute">否</span>
                )}
                {p.default_value && (
                  <span className="ml-1 text-xs text-mute">
                    ={p.default_value}
                  </span>
                )}
              </td>
              <td className="py-2 text-ink-2">{p.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
