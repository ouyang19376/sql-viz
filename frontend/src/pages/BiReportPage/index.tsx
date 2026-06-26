import { useState } from 'react'
import { PanelLeft, X } from 'lucide-react'
import { useBiStore } from '@/stores/useBiStore'
import type { BiTab } from '@/types/bi'
import DataSourcePanel from './DataSourcePanel'
import BiTabs from './BiTabs'
import DetailPreviewTab from './DetailPreviewTab'
import ModelBuilderTab from './ModelBuilderTab'
import DashboardTab from './DashboardTab'

/** BI 报表工具主页外壳（CM 模块 F-CM-02 / F-CM-03）。
 *  布局：左侧数据源栏 + 右侧三 Tab；切换 Tab 不丢状态（activeTab 存于 useBiStore）。
 *  响应式：md 以下数据源栏折叠为抽屉；内容区横向滚动。 */
export default function BiReportPage() {
  const activeTab = useBiStore((s) => s.activeTab)
  const setActiveTab = useBiStore((s) => s.setActiveTab)
  const model = useBiStore((s) => s.model)

  // 无指标 → 「大屏可视化」Tab 禁用并提示（PRD §7.2 / §7.4 MD 边界）
  const disabledTabs: BiTab[] = !model || model.metrics.length === 0 ? ['dashboard'] : []

  // 移动端数据源抽屉开关（纯 UI 态）
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="mx-auto max-w-7xl">
      {/* PageHeader */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">BI 报表工具</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            上传 Excel / CSV，建模出图，支持上下钻与卡片联动
          </p>
        </div>
        {/* 移动端打开数据源抽屉（<768px） */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 md:hidden dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <PanelLeft className="h-4 w-4" />
          数据源
        </button>
      </div>

      <div className="flex gap-6">
        {/* 左侧数据源栏（>=768px 常驻） */}
        <aside className="hidden w-64 shrink-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:block dark:border-gray-800 dark:bg-gray-900">
          <DataSourcePanel />
        </aside>

        {/* 右侧三 Tab 区 */}
        <section className="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="px-4">
            <BiTabs value={activeTab} onChange={setActiveTab} disabled={disabledTabs} />
          </div>
          {/* 内容区：横向滚动避免表格 / 图表溢出（F-CM-03） */}
          <div className="overflow-x-auto p-6">
            {activeTab === 'preview' ? (
              <DetailPreviewTab />
            ) : activeTab === 'model' ? (
              <ModelBuilderTab />
            ) : (
              <DashboardTab />
            )}
          </div>
        </section>
      </div>

      {/* 移动端数据源抽屉（<768px） */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[80%] bg-white p-4 shadow-xl dark:bg-gray-900">
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="关闭"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <DataSourcePanel />
          </aside>
        </div>
      )}
    </div>
  )
}
