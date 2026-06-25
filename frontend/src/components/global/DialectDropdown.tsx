import { useMatch, useNavigate } from 'react-router'
import { useDialectStore } from '@/stores/useDialectStore'
import { useDialects } from '@/api/queries'
import type { DialectId } from '@/types'

/** 全局方言切换下拉（F-DS-03） */
export default function DialectDropdown() {
  const currentDialectId = useDialectStore((s) => s.currentDialectId)
  const setDialect = useDialectStore((s) => s.setDialect)
  const { data } = useDialects()
  const navigate = useNavigate()
  /** 在函数详情页切换方言时保留 functionId（PRD §3.3 导航流程）。
   *  若新方言下该函数不存在，由 FunctionDetailPage 的 EmptyState 回退路径承接。
   *  两个 useMatch 必须无条件调用（不可用 ?? 短路），否则违反 Hooks 规则。 */
  const fnMatchPrd = useMatch('/dialect/:dialectId/function/:functionId')
  const fnMatchLegacy = useMatch('/sql/dialect/:dialectId/function/:functionId')
  const fnMatch = fnMatchPrd ?? fnMatchLegacy

  const handleChange = (id: string) => {
    setDialect(id as DialectId)
    const fid = fnMatch?.params.functionId
    navigate(fid ? `/dialect/${id}/function/${fid}` : `/dialect/${id}`)
  }

  return (
    <select
      value={currentDialectId}
      onChange={(e) => handleChange(e.target.value)}
      aria-label="切换方言"
      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-[var(--dialect-color)] focus:outline-none focus:ring-1 focus:ring-[var(--dialect-color)]"
    >
      {data?.dialects.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
  )
}
