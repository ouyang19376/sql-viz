import { useState } from 'react'
import { PanelLeft, X } from 'lucide-react'
import { useBiStore } from '@/stores/useBiStore'
import type { BiTab } from '@/types/bi'
import PageHeader from '@/components/shared/PageHeader'
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
      <PageHeader
        title="BI 报表工具"
        subtitle="上传 Excel / CSV，建模出图，支持上下钻与卡片联动"
        actions={
          /* 移动端打开数据源抽屉（<768px） */
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 md:hidden"
          >
            <PanelLeft className="h-4 w-4" />
            数据源
          </button>
        }
      />

      <div className="flex gap-6">
        {/* 左侧数据源栏（>=768px 常驻） */}
        <aside className="hidden w-64 shrink-0 rounded-2xl border border-line bg-surface p-4 md:block">
          <DataSourcePanel />
        </aside>

        {/* 右侧三 Tab 区 */}
        <section className="min-w-0 flex-1 rounded-2xl border border-line bg-surface">
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
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[80%] bg-surface p-4 shadow-xl">
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="关闭"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-mute hover:bg-surface-2"
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
