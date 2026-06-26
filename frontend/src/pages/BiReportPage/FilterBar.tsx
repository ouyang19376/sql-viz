import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { ColumnSchema, FilterClause, FilterOp } from '@/types/bi'

interface Props {
  columns: ColumnSchema[]
  filters: FilterClause[]
  onAdd: (filter: FilterClause) => void
  onRemove: (index: number) => void
}

const OP_LABEL: Record<FilterOp, string> = {
  eq: '等于',
  neq: '不等于',
  in: '属于',
  contains: '包含',
  gt: '大于',
  gte: '不小于',
  lt: '小于',
  lte: '不大于',
}

/** 按列角色/类型给出可用算子（PRD 难点 9）：
 *  measure(数值) → 范围算子；dimension → 等值 / 包含 / in。 */
function opsForColumn(col: ColumnSchema): FilterOp[] {
  if (col.role === 'measure') return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte']
  return ['eq', 'neq', 'contains', 'in']
}

/** 按列类型与算子解析输入值：in → 字符串数组；数值列 → 数字；否则字符串。 */
function parseValue(col: ColumnSchema, op: FilterOp, raw: string): FilterClause['value'] | null {
  const trimmed = raw.trim()
  if (op === 'in') {
    const list = trimmed.split(',').map((s) => s.trim()).filter(Boolean)
    return list.length > 0 ? list : null
  }
  if (trimmed === '') return null
  if (col.type === 'number') {
    const n = Number(trimmed)
    return Number.isNaN(n) ? null : n
  }
  return trimmed
}

function valueLabel(value: FilterClause['value']): string {
  return Array.isArray(value) ? value.join(', ') : String(value)
}

/** F-PV-03：列筛选条。维度等值/包含、数值范围，作用于后端查询。 */
export default function FilterBar({ columns, filters, onAdd, onRemove }: Props) {
  const [field, setField] = useState(columns[0]?.name ?? '')
  const [op, setOp] = useState<FilterOp>('eq')
  const [raw, setRaw] = useState('')

  const selectedCol = useMemo(() => columns.find((c) => c.name === field), [columns, field])
  const ops = selectedCol ? opsForColumn(selectedCol) : (['eq'] as FilterOp[])

  const handleFieldChange = (name: string) => {
    setField(name)
    const col = columns.find((c) => c.name === name)
    const nextOps = col ? opsForColumn(col) : (['eq'] as FilterOp[])
    setOp(nextOps[0])
  }

  const handleAdd = () => {
    if (!selectedCol) return
    const value = parseValue(selectedCol, op, raw)
    if (value === null) return
    onAdd({ field, op, value })
    setRaw('')
  }

  const inputType = selectedCol?.type === 'number' && op !== 'in' ? 'number' : 'text'

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={field}
          onChange={(e) => handleFieldChange(e.target.value)}
          className="h-8 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
        >
          {columns.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={op}
          onChange={(e) => setOp(e.target.value as FilterOp)}
          className="h-8 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
        >
          {ops.map((o) => (
            <option key={o} value={o}>
              {OP_LABEL[o]}
            </option>
          ))}
        </select>
        <input
          type={inputType}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={op === 'in' ? '多个值用逗号分隔' : '筛选值'}
          className="h-8 w-44 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex h-8 items-center gap-1 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          <Plus className="h-3.5 w-3.5" />
          添加筛选
        </button>
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((f, i) => (
            <span
              key={`${f.field}-${f.op}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 py-1 pr-1 pl-2.5 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-200"
            >
              <span>
                {f.field} {OP_LABEL[f.op]} {valueLabel(f.value)}
              </span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label="移除筛选"
                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
