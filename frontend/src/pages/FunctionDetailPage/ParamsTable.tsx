import type { Param } from '@/types'

interface Props {
  params: Param[]
}

/** 参数列表表格（F-FD-01）：参数名 / 类型 / 必填 / 说明。 */
export default function ParamsTable({ params }: Props) {
  if (params.length === 0) {
    return (
      <p className="text-sm text-gray-400">该函数无参数。</p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs text-gray-400 dark:border-gray-800">
            <th className="py-2 pr-3 font-medium">参数</th>
            <th className="py-2 pr-3 font-medium">类型</th>
            <th className="py-2 pr-3 font-medium">必填</th>
            <th className="py-2 font-medium">说明</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {params.map((p) => (
            <tr key={p.name} className="align-top">
              <td className="py-2 pr-3 font-mono text-gray-900 dark:text-gray-100">{p.name}</td>
              <td className="py-2 pr-3">
                <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  {p.type}
                </code>
              </td>
              <td className="py-2 pr-3">
                {p.required ? (
                  <span className="dialect-text">是</span>
                ) : (
                  <span className="text-gray-400">否</span>
                )}
                {p.default_value && (
                  <span className="ml-1 text-xs text-gray-400">
                    ={p.default_value}
                  </span>
                )}
              </td>
              <td className="py-2 text-gray-600 dark:text-gray-300">{p.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
