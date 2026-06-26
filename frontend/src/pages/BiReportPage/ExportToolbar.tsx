import { useRef, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import { Download, FileJson, ImageDown, RotateCcw, Sheet, Upload } from 'lucide-react'
import type { AggregateResponse, ChartType, DashboardModel, DatasetMeta } from '@/types/bi'
import type { EChartHandle } from '@/components/bi/EChart'
import { exportCsv } from '@/lib/exporters/exportCsv'
import { exportXlsx } from '@/lib/exporters/exportXlsx'
import { downloadFile } from '@/lib/exporters/downloadFile'
import ConfirmDialog from '@/components/bi/ConfirmDialog'

interface Props {
  dataset: DatasetMeta
  model: DashboardModel
  /** 当前主图聚合结果（F-EX-02 数据导出来源）。 */
  data?: AggregateResponse
  chartType: ChartType
  /** 主图 ECharts 句柄（F-EX-01 PNG）。table 类型为 null。 */
  chartRef: RefObject<EChartHandle | null>
  importModel: (model: DashboardModel) => void
  resetModel: () => void
}

const btn =
  'inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 px-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'

/** 校验导入配置：结构合法且引用字段均存在于当前数据集。返回错误文案或 null。 */
function validateImported(raw: unknown, dataset: DatasetMeta): string | null {
  if (!raw || typeof raw !== 'object') return '配置文件格式不正确'
  const m = raw as Partial<DashboardModel>
  if (!Array.isArray(m.metrics) || !Array.isArray(m.drillPath) || typeof m.chartType !== 'string') {
    return '配置文件缺少必要字段（metrics / drillPath / chartType）'
  }
  const names = new Set(dataset.columns.map((c) => c.name))
  const referenced = [...m.metrics.map((x) => x.field), ...m.drillPath]
  const missing = referenced.filter((f) => !names.has(f))
  if (missing.length > 0) return `字段与当前数据集不匹配：${[...new Set(missing)].join('、')}`
  return null
}

/** ExportToolbar（F-EX-01~05）：PNG / 数据(xlsx,csv) / 配置 JSON / 导入 / 重置。
 *  导出源均为当前大屏状态（PRD §5.5）；导入与重置为破坏性操作，走二次确认（§7.3）。 */
export default function ExportToolbar({
  dataset,
  model,
  data,
  chartType,
  chartRef,
  importModel,
  resetModel,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [pending, setPending] = useState<DashboardModel | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const hasData = !!data && data.rows.length > 0

  // F-EX-01：导出 PNG（ECharts getDataURL → Blob）
  const exportPng = async () => {
    const url = chartRef.current?.getPngDataURL()
    if (!url) {
      toast.error('当前图表不可导出图片')
      return
    }
    const blob = await fetch(url).then((r) => r.blob())
    const filename = `${dataset.name}.png`
    downloadFile(blob, filename)
    toast.success(`已导出：${filename}`)
  }

  // F-EX-02：导出当前聚合结果为 xlsx / csv
  const exportData = (format: 'xlsx' | 'csv') => {
    setMenuOpen(false)
    if (!data || data.rows.length === 0) {
      toast.error('暂无可导出的数据')
      return
    }
    const blob = format === 'xlsx' ? exportXlsx(data.columns, data.rows) : exportCsv(data.columns, data.rows)
    const filename = `${dataset.name}-聚合.${format}`
    downloadFile(blob, filename)
    toast.success(`已导出：${filename}`)
  }

  // F-EX-03：导出建模配置 JSON（DashboardModel）
  const exportConfig = () => {
    const blob = new Blob([JSON.stringify(model, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const filename = `${dataset.name}-config.json`
    downloadFile(blob, filename)
    toast.success(`已导出：${filename}`)
  }

  // F-EX-04：选择配置文件 → 校验 → 二次确认覆盖
  const handleFile = async (file: File) => {
    let raw: unknown
    try {
      raw = JSON.parse(await file.text())
    } catch {
      toast.error('配置文件不是合法 JSON')
      return
    }
    const err = validateImported(raw, dataset)
    if (err) {
      toast.error(err)
      return
    }
    setPending(raw as DashboardModel)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={exportPng} disabled={chartType === 'table'} className={btn}>
        <ImageDown className="h-4 w-4" />
        PNG
      </button>

      {/* 数据导出：xlsx / csv 下拉 */}
      <div className="relative">
        <button type="button" onClick={() => setMenuOpen((v) => !v)} disabled={!hasData} className={btn}>
          <Download className="h-4 w-4" />
          数据
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
            <div className="absolute right-0 z-20 mt-1 w-32 overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
              <button
                type="button"
                onClick={() => exportData('xlsx')}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <Sheet className="h-4 w-4" />
                Excel (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => exportData('csv')}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <Sheet className="h-4 w-4" />
                CSV (.csv)
              </button>
            </div>
          </>
        )}
      </div>

      <button type="button" onClick={exportConfig} className={btn}>
        <FileJson className="h-4 w-4" />
        配置
      </button>

      {/* F-EX-04：导入配置（P1）。隐藏 file input，选中后校验 + 确认覆盖 */}
      <button type="button" onClick={() => fileRef.current?.click()} className={btn}>
        <Upload className="h-4 w-4" />
        导入
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleFile(f)
          e.target.value = '' // 允许重复选择同一文件
        }}
      />

      <button
        type="button"
        onClick={() => setResetOpen(true)}
        className={btn + ' text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10'}
      >
        <RotateCcw className="h-4 w-4" />
        重置
      </button>

      {/* F-EX-05：重置二次确认 */}
      <ConfirmDialog
        open={resetOpen}
        title="重置建模与可视化"
        message="确定清空当前数据集的建模与可视化配置？数据集本身不会被删除。"
        confirmLabel="重置"
        onCancel={() => setResetOpen(false)}
        onConfirm={() => {
          resetModel()
          setResetOpen(false)
          toast.success('已重置建模配置')
        }}
      />

      {/* F-EX-04：导入覆盖二次确认 */}
      <ConfirmDialog
        open={pending !== null}
        title="导入配置"
        message="导入将覆盖当前建模配置，是否继续？"
        confirmLabel="导入"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) {
            importModel(pending)
            toast.success('已导入配置')
          }
          setPending(null)
        }}
      />
    </div>
  )
}
