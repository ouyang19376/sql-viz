import { DT_LIMITS } from '@/types/datatest'

interface Props {
  value: number
  onChange: (n: number) => void
  /** 当前估算字段数，用于二维警告（行数 × 字段数）。
   *  自然语言模式无法精确知道，传一个保守估计值即可（建议 8-10）。 */
  fieldCount: number
  disabled?: boolean
}

/** 触发「大数据量」警告的数据格阈值。
 *  默认 LLM_MAX_TOKENS=8192，按每格 ~12 tokens 估算，800 格已贴近预算上限；
 *  留 25% 余量取 600。超过即警告（不阻塞提交，由用户自行决定是否调高 .env）。 */
const WARN_CELLS = 600

/** F-DT-05：行数输入 [1, 1000]，默认 50。
 *  警告基于「行数 × 字段数」二维估算（旧版仅看行数对多字段场景过于乐观）。 */
export default function RowCountInput({
  value,
  onChange,
  fieldCount,
  disabled,
}: Props) {
  const invalid =
    value < DT_LIMITS.ROW_COUNT_MIN || value > DT_LIMITS.ROW_COUNT_MAX

  const cells = !invalid && fieldCount > 0 ? value * fieldCount : 0
  const warn = cells > WARN_CELLS

  const handleChange = (raw: string) => {
    if (raw === '') {
      onChange(NaN)
      return
    }
    const n = parseInt(raw, 10)
    if (Number.isNaN(n)) return
    onChange(n)
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-200">行数</label>
      <input
        type="number"
        min={DT_LIMITS.ROW_COUNT_MIN}
        max={DT_LIMITS.ROW_COUNT_MAX}
        step={1}
        value={Number.isNaN(value) ? '' : value}
        onChange={(e) => handleChange(e.target.value)}
        disabled={disabled}
        className={
          'w-32 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:bg-gray-100 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800 ' +
          (invalid
            ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
            : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-700')
        }
      />
      {invalid && (
        <p className="text-xs text-red-500">
          请输入 {DT_LIMITS.ROW_COUNT_MIN} ~ {DT_LIMITS.ROW_COUNT_MAX} 之间的整数
        </p>
      )}
      {warn && (
        <p className="text-xs text-amber-600">
          预估约 {cells} 数据格，可能超时或超出 LLM 输出预算；
          可减少行数 / 字段，或调高 backend/.env 中 LLM_MAX_TOKENS
        </p>
      )}
    </div>
  )
}
