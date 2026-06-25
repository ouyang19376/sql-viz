import type { DataTestMode } from '@/types/datatest'

interface Props {
  value: DataTestMode
  onChange: (mode: DataTestMode) => void
  disabled?: boolean
}

const TABS: { value: DataTestMode; label: string }[] = [
  { value: 'natural_language', label: '自然语言生成' },
  { value: 'schema', label: '自定义字段生成' },
]

/** F-DT-01：模式切换 Tab。
 *  视觉：选中态浅色描边 + 下划线；未选中：灰色 hover 浅蓝。 */
export default function ModeTabs({ value, onChange, disabled }: Props) {
  return (
    <div className="flex border-b border-gray-200 dark:border-gray-800" role="tablist">
      {TABS.map((t) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(t.value)}
            className={
              'px-5 py-3 text-sm font-medium transition-colors -mb-px border-b-2 ' +
              (active
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200') +
              (disabled ? ' cursor-not-allowed opacity-60' : '')
            }
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
