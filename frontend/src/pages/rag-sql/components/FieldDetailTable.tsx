import type { TableFieldDetail } from '@/types/rag-sql'

interface Props {
  fields: TableFieldDetail[]
  onChange: (fields: TableFieldDetail[]) => void
}

/** 表结构详情（F-CK-04 详情 / F-CK-05 行内编辑）：
 *  name 结构层只读；type / comment / nullable / extra 行内可编辑（输入即回写）。 */
export default function FieldDetailTable({ fields, onChange }: Props) {
  const update = (idx: number, patch: Partial<TableFieldDetail>) => {
    const next = fields.slice()
    next[idx] = { ...next[idx], ...patch }
    onChange(next)
  }

  if (fields.length === 0) {
    return <p className="text-sm text-gray-400">未解析到字段</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
            <th className="py-1.5 pr-2 font-medium">字段</th>
            <th className="py-1.5 pr-2 font-medium">类型</th>
            <th className="py-1.5 pr-2 font-medium">可空</th>
            <th className="py-1.5 pr-2 font-medium">注释</th>
            <th className="py-1.5 font-medium">业务含义补充</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f, i) => (
            <tr key={f.name + i} className="border-b border-gray-100 dark:border-gray-800">
              <td className="py-1 pr-2 align-top font-mono text-gray-800 dark:text-gray-100">{f.name}</td>
              <td className="py-1 pr-2 align-top">
                <input
                  value={f.type}
                  onChange={(e) => update(i, { type: e.target.value })}
                  className="w-28 rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-xs text-gray-700 hover:border-gray-300 focus:border-emerald-500 focus:bg-white dark:text-gray-300 dark:focus:bg-gray-900"
                />
              </td>
              <td className="py-1 pr-2 align-top">
                <input
                  type="checkbox"
                  checked={f.nullable}
                  onChange={(e) => update(i, { nullable: e.target.checked })}
                  title="是否可空"
                  className="h-4 w-4"
                />
              </td>
              <td className="py-1 pr-2 align-top">
                <input
                  value={f.comment ?? ''}
                  onChange={(e) => update(i, { comment: e.target.value })}
                  placeholder="-"
                  className="w-32 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-gray-700 hover:border-gray-300 focus:border-emerald-500 focus:bg-white dark:text-gray-300 dark:focus:bg-gray-900"
                />
              </td>
              <td className="py-1 align-top">
                <input
                  value={f.extra ?? ''}
                  onChange={(e) => update(i, { extra: e.target.value })}
                  placeholder="如 可关联用户维度表"
                  className="w-40 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-gray-700 hover:border-gray-300 focus:border-emerald-500 focus:bg-white dark:text-gray-300 dark:focus:bg-gray-900"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
