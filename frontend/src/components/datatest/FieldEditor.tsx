import { Plus } from 'lucide-react'
import { DT_LIMITS, type FieldDef } from '@/types/datatest'
import FieldRow from './FieldRow'

interface Props {
  fields: FieldDef[]
  onChange: (fields: FieldDef[]) => void
  disabled?: boolean
}

/** F-DT-03：字段表（行内增删改）。
 *  视觉：sticky 表头 + 横向滚动（XS/SM 断点，PRD §7.5）。 */
export default function FieldEditor({ fields, onChange, disabled }: Props) {
  const atMax = fields.length >= DT_LIMITS.FIELDS_MAX

  const addField = () => {
    if (atMax) return
    onChange([...fields, { name: '', type: 'string' }])
  }

  const updateAt = (i: number, next: FieldDef) => {
    const copy = [...fields]
    copy[i] = next
    onChange(copy)
  }

  const removeAt = (i: number) => {
    const copy = [...fields]
    copy.splice(i, 1)
    onChange(copy)
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="bg-gray-50 text-xs font-medium uppercase text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
            <tr>
              <th className="p-2 text-left">字段名 *</th>
              <th className="p-2 text-left">类型</th>
              <th className="p-2 text-left">描述</th>
              <th className="p-2 text-left">枚举值</th>
              <th className="p-2 text-right" aria-label="操作" />
            </tr>
          </thead>
          <tbody>
            {fields.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-sm text-gray-400">
                  尚未添加字段，请点击下方「+ 添加字段」或上传 xlsx/csv 解析表头
                </td>
              </tr>
            ) : (
              fields.map((f, i) => (
                <FieldRow
                  key={i}
                  field={f}
                  onChange={(next) => updateAt(i, next)}
                  onRemove={() => removeAt(i)}
                  disabled={disabled}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2 dark:border-gray-800">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {fields.length} / {DT_LIMITS.FIELDS_MAX} 字段
        </span>
        <button
          type="button"
          onClick={addField}
          disabled={disabled || atMax}
          className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25"
        >
          <Plus className="h-4 w-4" />
          添加字段
        </button>
      </div>
    </div>
  )
}
