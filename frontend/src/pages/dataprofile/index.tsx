import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { useSources } from '@/api/dataprofile'
import { useDataProfileStore } from '@/stores/useDataProfileStore'
import type { ProfileTab } from '@/stores/useDataProfileStore'
import SourcesPanel from './SourcesPanel'
import WorkbenchPanel from './WorkbenchPanel'
import RuleLibraryPanel from './RuleLibraryPanel'
import GeneratePanel from './GeneratePanel'

const TABS: { key: ProfileTab; label: string }[] = [
  { key: 'sources', label: '数据源管理' },
  { key: 'bench', label: '查询工作台' },
  { key: 'rules', label: '探查规则库' },
  { key: 'generate', label: '脚本生成' },
]

const VALID_TABS: ProfileTab[] = ['sources', 'bench', 'rules', 'generate']

/** 数据探查主页（PRD §3.3）：4 Tab 容器，状态由 store 保活。
 *  ?tab= 定位 Tab（支持后续生成->工作台导入跳转）。 */
export default function DataProfilePage() {
  const activeTab = useDataProfileStore((s) => s.activeTab)
  const setActiveTab = useDataProfileStore((s) => s.setActiveTab)
  const [searchParams, setSearchParams] = useSearchParams()
  const { data } = useSources()
  const connectedCount = data?.length ?? 0

  // 挂载时按 ?tab= 定位（仅一次合法值）
  useEffect(() => {
    const t = searchParams.get('tab') as ProfileTab | null
    if (t && VALID_TABS.includes(t) && t !== activeTab) {
      setActiveTab(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleTab = (tab: ProfileTab) => {
    setActiveTab(tab)
    setSearchParams(tab === 'sources' ? {} : { tab }, { replace: true })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">数据探查</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          连接数据源 · 只读查询预览 · 生成数据质量探查脚本
          <span className="ml-2 text-gray-400">· 已连接 {connectedCount} 个数据源</span>
        </p>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700" aria-label="数据探查模块">
        {TABS.map((t) => {
          const active = t.key === activeTab
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => handleTab(t.key)}
              aria-current={active ? 'page' : undefined}
              className={
                '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ' +
                (active
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200')
              }
            >
              {t.label}
            </button>
          )
        })}
      </nav>

      {activeTab === 'sources' && <SourcesPanel />}
      {activeTab === 'bench' && <WorkbenchPanel />}
      {activeTab === 'rules' && <RuleLibraryPanel />}
      {activeTab === 'generate' && <GeneratePanel />}
    </div>
  )
}
