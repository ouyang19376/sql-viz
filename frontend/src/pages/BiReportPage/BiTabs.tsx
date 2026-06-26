import type { BiTab } from '@/types/bi'

interface Props {
  value: BiTab
  onChange: (tab: BiTab) => void
  /** 禁用的 Tab（如无指标时禁用大屏可视化）。 */
  disabled?: BiTab[]
}

const TABS: { value: BiTab; label: string }[] = [
  { value: 'preview', label: '明细预览' },
  { value: 'model', label: '建模配置' },
  { value: 'dashboard', label: '大屏可视化' },
]

/** F-CM-02：右侧三 Tab 切换。视觉沿用 datatest/ModeTabs。 */
export default function BiTabs({ value, onChange, disabled = [] }: Props) {
  return (
    <div className="flex overflow-x-auto border-b border-gray-200 dark:border-gray-800" role="tablist">
      {TABS.map((t) => {
        const active = t.value === value
        const isDisabled = disabled.includes(t.value)
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={isDisabled}
            title={isDisabled ? '请先定义至少一个指标' : undefined}
            onClick={() => !isDisabled && onChange(t.value)}
            className={
              'shrink-0 whitespace-nowrap px-5 py-3 text-sm font-medium transition-colors -mb-px border-b-2 ' +
              (isDisabled
                ? 'cursor-not-allowed border-transparent text-gray-300 dark:text-gray-600'
                : active
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200')
            }
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
