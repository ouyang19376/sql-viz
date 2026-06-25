import { Sparkles } from 'lucide-react'
import { useDataTestStore } from '@/stores/useDataTestStore'
import { DT_LIMITS } from '@/types/datatest'
import PromptTextarea from './PromptTextarea'
import RowCountInput from './RowCountInput'
import FormatSelector from './FormatSelector'

interface Props {
  loading: boolean
  onSubmit: () => void
  onReset: () => void
}

/** 从自然语言 prompt 粗估字段数：
 *  规则 = max(中英文逗号数 + 1, 6)。下限 6 是常见测试数据集的保守估计；
 *  上限不卡（用户写多少算多少）。仅用于驱动 RowCountInput 的二维警告。 */
function estimateFieldCountFromPrompt(prompt: string): number {
  if (!prompt.trim()) return 6
  const commaMatches = prompt.match(/[,，]/g)
  const fromCommas = (commaMatches?.length ?? 0) + 1
  return Math.max(fromCommas, 6)
}

/** 自然语言生成面板（F-DT-02 输入 + F-DT-05/06 共享控件 + F-DT-07 提交）。 */
export default function NaturalLanguagePanel({ loading, onSubmit, onReset }: Props) {
  const prompt = useDataTestStore((s) => s.prompt)
  const setPrompt = useDataTestStore((s) => s.setPrompt)
  const rowCount = useDataTestStore((s) => s.rowCount)
  const setRowCount = useDataTestStore((s) => s.setRowCount)
  const format = useDataTestStore((s) => s.format)
  const setFormat = useDataTestStore((s) => s.setFormat)

  const promptValid = prompt.trim().length > 0 && prompt.length <= DT_LIMITS.PROMPT_MAX
  const rowCountValid =
    Number.isInteger(rowCount) &&
    rowCount >= DT_LIMITS.ROW_COUNT_MIN &&
    rowCount <= DT_LIMITS.ROW_COUNT_MAX
  const canSubmit = promptValid && rowCountValid && !loading

  return (
    <div className="space-y-5">
      <PromptTextarea value={prompt} onChange={setPrompt} disabled={loading} />

      <div className="flex flex-wrap items-end gap-6">
        <RowCountInput
          value={rowCount}
          onChange={setRowCount}
          fieldCount={estimateFieldCountFromPrompt(prompt)}
          disabled={loading}
        />
        <FormatSelector value={format} onChange={setFormat} disabled={loading} />
      </div>

      <div className="flex justify-end gap-3 pt-2">
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
  )
}
