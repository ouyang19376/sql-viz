import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { useRagSqlStatsQuery } from '@/api/rag-sql'
import { useRagSqlStore } from '@/stores/useRagSqlStore'
import type { RagSqlTab } from '@/types/rag-sql'
import AskPanel from './AskPanel'
import ChunkPanel from './ChunkPanel'
import KbPanel from './KbPanel'

const TABS: { key: RagSqlTab; label: string }[] = [
  { key: 'chunk', label: '文本块生成' },
  { key: 'kb', label: '知识管理' },
  { key: 'ask', label: 'NL2SQL 问答' },
]

const VALID_TABS: RagSqlTab[] = ['chunk', 'kb', 'ask']

/** RAG for NL2SQL 主页（PRD §3.3）：3 Tab 容器，状态由 store 保活；?tab= 定位。
 *  CK=chunk / KB=kb / AS=ask 三子模块已接入。 */
export default function RagSqlPage() {
  const activeTab = useRagSqlStore((s) => s.activeTab)
  const setActiveTab = useRagSqlStore((s) => s.setActiveTab)
  const [searchParams, setSearchParams] = useSearchParams()
  const stats = useRagSqlStatsQuery().data

  // 挂载时按 ?tab= 定位（仅一次合法值）
  useEffect(() => {
    const t = searchParams.get('tab') as RagSqlTab | null
    if (t && VALID_TABS.includes(t) && t !== activeTab) {
      setActiveTab(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleTab = (tab: RagSqlTab) => {
    setActiveTab(tab)
    setSearchParams(tab === 'chunk' ? {} : { tab }, { replace: true })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">RAG 自然语言转 SQL</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          解析建表语句构建知识库 · 自然语言生成对齐业务模型的 SQL
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span>表 <b className="text-gray-700 dark:text-gray-200">{stats?.tableCount ?? '-'}</b></span>
          <span>文档 <b className="text-gray-700 dark:text-gray-200">{stats?.docCount ?? '-'}</b></span>
          <span>分片 <b className="text-gray-700 dark:text-gray-200">{stats?.chunkCount ?? '-'}</b></span>
        </div>
      </div>

      <nav
        className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700"
        aria-label="RAG for NL2SQL 模块"
      >
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
                  ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
                  : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200')
              }
            >
              {t.label}
            </button>
          )
        })}
      </nav>

      {activeTab === 'chunk' && <ChunkPanel />}
      {activeTab === 'kb' && <KbPanel />}
      {activeTab === 'ask' && <AskPanel />}
    </div>
  )
}
