import type { DialectSummary } from '@/types'
import DialectCard from './DialectCard'

interface Props {
  dialects: DialectSummary[]
}

/** 方言卡片网格（F-DS-01）：展示 7 种方言入口卡片。 */
export default function DialectGrid({ dialects }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {dialects.map((dialect) => (
        <DialectCard key={dialect.id} dialect={dialect} />
      ))}
    </div>
  )
}
