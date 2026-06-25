import { Sparkles } from 'lucide-react'
import { useDataTestStore } from '@/stores/useDataTestStore'
import { DT_LIMITS, type FieldDef } from '@/types/datatest'
import FieldEditor from './FieldEditor'
import HeaderUploader from './HeaderUploader'
import RowCountInput from './RowCountInput'
import FormatSelector from './FormatSelector'

interface Props {
  loading: boolean
  onSubmit: () => void
  onReset: () => void
}

/** 校验单个字段是否可提交。
 *  规则：name 非空、长度 ≤ 64；enum 类型必须有 enumValues。 */
function isFieldValid(f: FieldDef): boolean {
  const name = f.name.trim()
  if (!name || name.length > DT_LIMITS.FIELD_NAME_MAX) return false
  if (f.type === 'enum' && (!f.enumValues || f.enumValues.length === 0)) return false
  return true
}

/** 自定义字段生成面板（F-DT-03 字段表 + F-DT-04 上传 + F-DT-05/06/07）。 */
export default function SchemaBuilderPanel({ loading, onSubmit, onReset }: Props) {
  const fields = useDataTestStore((s) => s.fields)
  const setFields = useDataTestStore((s) => s.setFields)
  const appendFields = useDataTestStore((s) => s.appendFields)
  const rowCount = useDataTestStore((s) => s.rowCount)
  const setRowCount = useDataTestStore((s) => s.setRowCount)
  const format = useDataTestStore((s) => s.format)
  const setFormat = useDataTestStore((s) => s.setFormat)

  const allValid = fields.length > 0 && fields.every(isFieldValid)
  const rowCountValid =
    Number.isInteger(rowCount) &&
    rowCount >= DT_LIMITS.ROW_COUNT_MIN &&
    rowCount <= DT_LIMITS.ROW_COUNT_MAX
  const canSubmit = allValid && rowCountValid && !loading

  // 提交禁用提示文案（F-DT-03 / PRD §7.2）
  const hint =
    fields.length === 0
      ? '请至少添加一个字段'
      : !allValid
        ? '存在无效字段：检查字段名是否填写、enum 类型是否提供枚举值'
        : null

  return (
    <div className="space-y-5">
      <FieldEditor fields={fields} onChange={setFields} disabled={loading} />

      <HeaderUploader onParsed={appendFields} disabled={loading} />

      <div className="flex flex-wrap items-end gap-6">
        <RowCountInput
          value={rowCount}
          onChange={setRowCount}
          fieldCount={fields.length}
          disabled={loading}
        />
        <FormatSelector value={format} onChange={setFormat} disabled={loading} />
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">{hint}</span>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onReset}
            disabled={loading}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            重置
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-500 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {loading ? '生成中…' : '生成'}
          </button>
        </div>
      </div>
    </div>
  )
}
