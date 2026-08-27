import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/bi/ConfirmDialog'
import EmptyState from '@/components/shared/EmptyState'
import Skeleton from '@/components/shared/Skeleton'
import { useChunkMutation, useIngestTableMutation } from '@/api/rag-sql'
import { useRagSqlStore } from '@/stores/useRagSqlStore'
import type { TableChunk } from '@/types/rag-sql'
import ChunkPreview from './components/ChunkPreview'
import DdlInput from './components/DdlInput'

/** 文本块生成面板（F-CK-01~10）：
 *  左：DDL 编辑器（生成 / 清空 / 字符护栏）；右：结构化文本块预览（编辑 / 草稿 / 上传）。 */
export default function ChunkPanel() {
  const ddlInput = useRagSqlStore((s) => s.ddlInput)
  const setDdlInput = useRagSqlStore((s) => s.setDdlInput)
  const currentChunks = useRagSqlStore((s) => s.currentChunks)
  const activeChunkIdx = useRagSqlStore((s) => s.activeChunkIdx)
  const setActiveChunkIdx = useRagSqlStore((s) => s.setActiveChunkIdx)
  const updateChunk = useRagSqlStore((s) => s.updateChunk)
  const saveDraft = useRagSqlStore((s) => s.saveDraft)
  const setIngestStatus = useRagSqlStore((s) => s.setIngestStatus)
  const ingestStatus = useRagSqlStore((s) => s.ingestStatus)
  const chunkDrafts = useRagSqlStore((s) => s.chunkDrafts)
  const setCurrentChunks = useRagSqlStore((s) => s.setCurrentChunks)

  const chunkMut = useChunkMutation()
  const ingestMut = useIngestTableMutation()
  const [refusedMsg, setRefusedMsg] = useState<string | null>(null)
  const [confirmOverwrite, setConfirmOverwrite] = useState<TableChunk | null>(null)
  const [savedNames, setSavedNames] = useState<Set<string>>(new Set())

  const handleGenerate = () => {
    setRefusedMsg(null)
    chunkMut.mutate(
      { ddl: ddlInput },
      {
        onSuccess: (data) => {
          if (data.refused) {
            setRefusedMsg(data.message ?? 'DDL 解析失败')
            setCurrentChunks([])
          } else {
            setCurrentChunks(data.chunks)
            setSavedNames(new Set())
          }
        },
        onError: (e) => setRefusedMsg(e.message || '生成失败'),
      },
    )
  }

  const handleUpload = (chunk: TableChunk, overwrite: boolean) => {
    ingestMut.mutate(
      {
        tableName: chunk.tableName,
        rawText: chunk.rawText,
        summary: chunk.summary,
        fields: chunk.fields,
        overwrite,
      },
      {
        onSuccess: (r) => {
          if (!r.ingested && r.alreadyExists) {
            // F-CK-08：同名已入库，交二次确认
            setConfirmOverwrite(chunk)
            return
          }
          setIngestStatus(r.tableName, {
            ingestedAt: r.ingestedAt ?? Math.floor(Date.now() / 1000),
            overwritten: r.overwritten,
          })
          toast.success(r.overwritten ? `已覆盖更新：${r.tableName}` : `已入库：${r.tableName}`)
          setConfirmOverwrite(null)
        },
        onError: (e) => toast.error(e.message || '入库失败'),
      },
    )
  }

  const activeChunk = currentChunks[activeChunkIdx]
  const uploadingName = ingestMut.variables?.tableName

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* 左：DDL 输入 */}
      <div className="space-y-3">
        <DdlInput
          value={ddlInput}
          onChange={setDdlInput}
          onGenerate={handleGenerate}
          pending={chunkMut.isPending}
        />
        {refusedMsg && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-500/10 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">{refusedMsg}</div>
            <button type="button" onClick={handleGenerate} className="shrink-0 font-medium underline">
              重试
            </button>
          </div>
        )}
        {chunkMut.isPending && <Skeleton lines={4} />}
        {chunkDrafts.length > 0 && (
          <p className="text-xs text-mute">已存 {chunkDrafts.length} 个草稿（可批量上传）</p>
        )}
      </div>

      {/* 右：文本块预览 */}
      <div className="md:h-full">
        {!activeChunk ? (
          <EmptyState
            className="min-h-[16rem] md:min-h-[24rem]"
            title="暂无文本块"
            description="粘贴 DDL 并点「生成文本块」，右侧将展示可编辑的表概要与字段详情。"
          />
        ) : (
          <div className="space-y-3 md:min-h-[24rem]">
            {currentChunks.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {currentChunks.map((c, i) => (
                  <button
                    key={c.tableName}
                    type="button"
                    onClick={() => setActiveChunkIdx(i)}
                    className={
                      'rounded-md px-2.5 py-1 text-xs font-medium transition-colors ' +
                      (i === activeChunkIdx
                        ? 'bg-accent text-white'
                        : 'bg-surface-2 text-ink-2 hover:bg-surface-2')
                    }
                  >
                    {c.tableName}
                  </button>
                ))}
              </div>
            )}
            <ChunkPreview
              chunk={activeChunk}
              ingestStatus={ingestStatus[activeChunk.tableName]}
              uploading={uploadingName === activeChunk.tableName && ingestMut.isPending}
              saved={savedNames.has(activeChunk.tableName)}
              onChange={(c) => updateChunk(activeChunkIdx, c)}
              onSaveDraft={() => {
                saveDraft(activeChunk)
                setSavedNames((s) => new Set(s).add(activeChunk.tableName))
                toast.success('已存草稿')
              }}
              onUpload={() => handleUpload(activeChunk, false)}
            />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmOverwrite}
        title="覆盖已入库表？"
        message={`表 ${confirmOverwrite?.tableName ?? ''} 已入库，是否覆盖更新？此操作不可撤销。`}
        confirmLabel="覆盖更新"
        confirmBusy={ingestMut.isPending}
        onConfirm={() => confirmOverwrite && handleUpload(confirmOverwrite, true)}
        onCancel={() => setConfirmOverwrite(null)}
      />
    </div>
  )
}
