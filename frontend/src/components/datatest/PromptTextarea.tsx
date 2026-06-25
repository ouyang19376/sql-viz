import { DT_LIMITS } from '@/types/datatest'

interface Props {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}

/** F-DT-02：自然语言提示词输入。多行 ≥6 行 + 实时字符计数 + 占位符示例。 */
export default function PromptTextarea({ value, onChange, disabled }: Props) {
  const len = value.length
  const overLimit = len > DT_LIMITS.PROMPT_MAX

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
        请描述你想要的数据
      </label>
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, DT_LIMITS.PROMPT_MAX))}
          disabled={disabled}
          rows={6}
          placeholder="例如：生成 10 条电商订单数据，包含订单号、用户名、商品、金额、下单时间…"
          className={
            'w-full resize-y rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:bg-gray-100 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800 ' +
            (overLimit
              ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-700')
          }
        />
        <span
          className={
            'pointer-events-none absolute bottom-2 right-3 text-xs ' +
            (overLimit ? 'text-red-500' : 'text-gray-400')
          }
        >
          {len}/{DT_LIMITS.PROMPT_MAX}
        </span>
      </div>
    </div>
  )
}
