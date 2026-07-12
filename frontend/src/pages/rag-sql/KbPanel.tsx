import { useState } from 'react'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/bi/ConfirmDialog'
import EmptyState from '@/components/shared/EmptyState'
import Skeleton from '@/components/shared/Skeleton'
import {
  useDeleteKbDocMutation,
  useIngestDocMutation,
  useKbDocQuery,
  useKbDocsQuery,
  useTableMetaQuery,
} from '@/api/rag-sql'
import { useRagSqlStore } from '@/stores/useRagSqlStore'
import type { KbDocInput, KbDocRef } from '@/types/rag-sql'
import ChunkPreviewDrawer from './components/ChunkPreviewDrawer'
import KbList from './components/KbList'
import KbUploader from './components/KbUploader'
import TableMetaList from './components/TableMetaList'

/** 知识管理面板（F-KB-01~08）：上传 + 列表 + 预览抽屉 + 删除/覆盖二次确认。
 *  服务端态由 TanStack Query 缓存（列表 30s stale，详情按需拉）；表单态由 store kbDraft 保活。 */
export default function KbPanel() {
  const resetKbDraft = useRagSqlStore((s) => s.resetKbDraft)
  const docsQ = useKbDocsQuery()
  const tablesQ = useTableMetaQuery()
  const ingestMut = useIngestDocMutation()
  const deleteMut = useDeleteKbDocMutation()

  const [previewId, setPreviewId] = useState<string | null>(null)
  const docQ = useKbDocQuery(previewId)
  const [confirmOverwrite, setConfirmOverwrite] = useState<KbDocInput | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<KbDocRef | null>(null)

  const handleUpload = (draft: KbDocInput, overwrite = false) => {
    ingestMut.mutate(
      { ...draft, overwrite },
      {
        onSuccess: (r) => {
          // F-KB-07：同标题已入库且未确认 -> 交二次确认
          if (!r.ingested && r.alreadyExists) {
            setConfirmOverwrite(draft)
            return
          }
          toast.success(
            r.overwritten
              ? `已覆盖更新：${r.title}（${r.chunkCount} 分片）`
              : `已入库：${r.title}（${r.chunkCount} 分片）`,
          )
          setConfirmOverwrite(null)
          resetKbDraft()
        },
        onError: (e) => toast.error(e.message || '入库失败'),
      },
    )
  }

  const confirmDeleteDoc = () => {
    if (!confirmDelete) return
    deleteMut.mutate(confirmDelete.id, {
      onSuccess: (r) => {
        toast.success(`已删除 ${r.deleted} 个分片`)
        setConfirmDelete(null)
      },
      onError: (e) => toast.error(e.message || '删除失败'),
    })
  }

  return (
    <div className="space-y-5">
      <KbUploader onUpload={(d) => handleUpload(d, false)} pending={ingestMut.isPending} />

      {tablesQ.isLoading ? (
        <Skeleton lines={2} />
      ) : tablesQ.isError ? (
        <EmptyState title="加载失败" description={tablesQ.error?.message ?? '请稍后重试'} />
      ) : (
        <TableMetaList tables={tablesQ.data ?? []} />
      )}

      {docsQ.isLoading ? (
        <Skeleton lines={3} />
      ) : docsQ.isError ? (
        <EmptyState title="加载失败" description={docsQ.error?.message ?? '请稍后重试'} />
      ) : (
        <KbList
          docs={docsQ.data ?? []}
          onPreview={setPreviewId}
          onDelete={setConfirmDelete}
          deletingId={deleteMut.variables ?? undefined}
        />
      )}

      <ChunkPreviewDrawer
        open={!!previewId}
        title={docQ.data?.title ?? ''}
        chunks={docQ.data?.chunks ?? []}
        loading={docQ.isLoading}
        onClose={() => setPreviewId(null)}
      />

      <ConfirmDialog
        open={!!confirmOverwrite}
        title="覆盖已入库文档？"
        message={`文档《${confirmOverwrite?.title ?? ''}》已存在，是否覆盖更新？此操作不可撤销。`}
        confirmLabel="覆盖更新"
        confirmBusy={ingestMut.isPending}
        onConfirm={() => confirmOverwrite && handleUpload(confirmOverwrite, true)}
        onCancel={() => setConfirmOverwrite(null)}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        title="删除文档？"
        message={`删除《${confirmDelete?.title ?? ''}》及其 ${confirmDelete?.chunkCount ?? 0} 个分片？不可撤销。`}
        confirmLabel="删除"
        confirmBusy={deleteMut.isPending}
        onConfirm={confirmDeleteDoc}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
