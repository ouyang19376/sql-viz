import type { ColumnSchema, FieldRole, InferredType } from '@/types/bi'

interface Props {
  columns: ColumnSchema[]
  onChange: (name: string, role: FieldRole) => void
}

const TYPE_LABEL: Record<InferredType, string> = {
  string: '文本',
  number: '数值',
  date: '日期',
  boolean: '布尔',
}

const ROLE_OPTIONS: { value: FieldRole; label: string }[] = [
  { value: 'dimension', label: '维度' },
  { value: 'measure', label: '指标' },
]

/** F-MD-01：逐列切换维度 / 指标角色。维度用于分组下钻，指标用于聚合。 */
export default function FieldRolePanel({ columns, onChange }: Props) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-ink">字段角色</h3>
      <p className="mt-0.5 mb-3 text-xs text-mute">
        维度用于分组与下钻，指标用于聚合计算
      </p>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {columns.map((c) => (
          <li key={c.name} className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm text-ink">
              {c.name}
            </span>
            <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-mute">
              {TYPE_LABEL[c.type]}
            </span>
            <div
              role="group"
              className="inline-flex shrink-0 overflow-hidden rounded-md border border-line"
            >
              {ROLE_OPTIONS.map((opt) => {
                const active = c.role === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onChange(c.name, opt.value)}
                    className={
                      'px-2.5 py-1 text-xs font-medium transition-colors ' +
                      (active
                        ? 'bg-accent text-white'
                        : 'bg-surface text-ink-2 hover:bg-surface-2')
                    }
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
