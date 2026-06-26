import { Trash2 } from 'lucide-react'
import {
  DT_LIMITS,
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  type FieldDef,
} from '@/types/datatest'

interface Props {
  field: FieldDef
  onChange: (next: FieldDef) => void
  onRemove: () => void
  disabled?: boolean
}

/** F-DT-03：单行字段编辑（name / type / description / enumValues）。
 *  enum 类型时 enumValues 必填；这里仅做实时提示，提交禁用由 FieldEditor 汇总。 */
export default function FieldRow({ field, onChange, onRemove, disabled }: Props) {
  const nameEmpty = field.name.trim().length === 0
  const nameTooLong = field.name.length > DT_LIMITS.FIELD_NAME_MAX
  const enumMissing =
    field.type === 'enum' && (!field.enumValues || field.enumValues.length === 0)

  // enumValues 用「逗号分隔字符串」做编辑，提交前再 split
  const enumEditValue = (field.enumValues ?? []).join(', ')

  const updateEnum = (raw: string) => {
    const arr = raw
      .split(/[,，]/)
      .map((s) => s.trim().slice(0, DT_LIMITS.ENUM_VALUE_MAX))
      .filter((s) => s.length > 0)
      .slice(0, DT_LIMITS.ENUM_COUNT_MAX)
    onChange({ ...field, enumValues: arr.length > 0 ? arr : undefined })
  }

  return (
    <tr className="block border-b border-gray-100 last:border-b-0 dark:border-gray-800 md:table-row">
      {/* 字段名 */}
      <td className="block p-2 md:table-cell">
        <input
          type="text"
          value={field.name}
          onChange={(e) =>
            onChange({ ...field, name: e.target.value.slice(0, DT_LIMITS.FIELD_NAME_MAX) })
          }
          disabled={disabled}
          placeholder="例如 user_id"
          className={
            'w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:bg-gray-100 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800 ' +
            (nameEmpty || nameTooLong
              ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-700')
          }
        />
      </td>

      {/* 类型 */}
      <td className="block p-2 md:table-cell">
        <select
          value={field.type}
          onChange={(e) => {
            const type = e.target.value as FieldDef['type']
            // 切到非 enum 时清掉 enumValues，避免脏数据
            const next: FieldDef =
              type === 'enum'
                ? { ...field, type }
                : { ...field, type, enumValues: undefined }
            onChange(next)
          }}
          disabled={disabled}
          className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800"
        >
          {FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {FIELD_TYPE_LABELS[t]}（{t}）
            </option>
          ))}
        </select>
      </td>

      {/* 描述 */}
      <td className="block p-2 md:table-cell">
        <input
          type="text"
          value={field.description ?? ''}
          onChange={(e) =>
            onChange({
              ...field,
              description: e.target.value.slice(0, DT_LIMITS.FIELD_DESC_MAX) || undefined,
            })
          }
          disabled={disabled}
          placeholder="可选，中文语义描述"
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800"
        />
      </td>

      {/* 枚举值 */}
      <td className="block p-2 md:table-cell">
        <input
          type="text"
          value={enumEditValue}
          onChange={(e) => updateEnum(e.target.value)}
          disabled={disabled || field.type !== 'enum'}
          placeholder={
            field.type === 'enum' ? 'A, B, C（逗号分隔）' : '仅 enum 类型可填'
          }
          className={
            'w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:bg-gray-100 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800 ' +
            (enumMissing
              ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-700')
          }
        />
      </td>

      {/* 删除 */}
      <td className="block p-2 text-right md:table-cell">
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label="删除字段"
          title="删除字段"
          className="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  )
}
