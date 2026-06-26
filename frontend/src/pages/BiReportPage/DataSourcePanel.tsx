import { useState } from 'react'
import { Database, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useDatasets, useDeleteMutation } from '@/api/bi'
import { useBiStore } from '@/stores/useBiStore'
import type { DatasetMeta } from '@/types/bi'
import Skeleton from '@/components/shared/Skeleton'
import ConfirmDialog from '@/components/bi/ConfirmDialog'
import DatasetUploader from '@/components/bi/DatasetUploader'
import DatasetList from '@/components/bi/DatasetList'

/** F-DS-05/06/07：数据源栏 —— 上传 + 列表 + 单选选中 + 勾选删除。
 *  删除当前活跃集后清空右侧三 Tab（reset，难点 8）。 */
export default function DataSourcePanel() {
  const { data: datasets, isLoading, isError, refetch } = useDatasets()
  const del = useDeleteMutation()

  const activeDataset = useBiStore((s) => s.activeDataset)
  const setActiveDataset = useBiStore((s) => s.setActiveDataset)
  const reset = useBiStore((s) => s.reset)

  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)

  const toggleCheck = (id: string) =>
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const handleSelect = (ds: DatasetMeta) => setActiveDataset(ds)

  const confirmDelete = () => {
    const ids = [...checkedIds]
    del.mutate(ids, {
      onSuccess: () => {
        // 删除的若含当前活跃集 → 清空右侧建模 / 可视化
        if (activeDataset && checkedIds.has(activeDataset.id)) reset()
        toast.success(`已删除 ${ids.length} 个数据集`)
        setCheckedIds(new Set())
        setConfirmOpen(false)
      },
      onError: (err) => toast.error(err.message || '删除失败'),
    })
  }

  const checkedCount = checkedIds.size
  const activeChecked = !!activeDataset && checkedIds.has(activeDataset.id)

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <Database className="h-4 w-4" />
          数据源
        </span>
        {checkedCount > 0 && (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除 {checkedCount}
          </button>
        )}
      </div>

      <DatasetUploader />

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <Skeleton lines={3} />
        ) : isError ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-400 dark:border-gray-700">
            列表加载失败
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-2 block w-full text-xs text-indigo-600 hover:underline"
            >
              重试
            </button>
          </div>
        ) : !datasets || datasets.length === 0 ? (
          <p className="px-1 pt-2 text-center text-xs text-gray-400 dark:text-gray-500">
            暂无数据集，上传开始
          </p>
        ) : (
          <DatasetList
            datasets={datasets}
            activeId={activeDataset?.id ?? null}
            checkedIds={checkedIds}
            onSelect={handleSelect}
            onToggleCheck={toggleCheck}
          />
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={`确定删除选中的 ${checkedCount} 个数据集？`}
        message={
          '磁盘文件将被移除，不可恢复。' +
          (activeChecked ? '其中包含当前数据集，将清空右侧建模与可视化。' : '')
        }
        confirmBusy={del.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}
