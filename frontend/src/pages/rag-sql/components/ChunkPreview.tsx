import type { TableChunk } from '@/types/rag-sql'
import type { IngestStatus } from '@/stores/useRagSqlStore'
import SummaryFields from './SummaryFields'
import FieldDetailTable from './FieldDetailTable'
import ChunkActions from './ChunkActions'

interface Props {
  chunk: TableChunk
  ingestStatus?: IngestStatus
  uploading: boolean
  saved?: boolean
  onChange: (chunk: TableChunk) => void
  onSaveDraft: () => void
  onUpload: () => void
}

/** 文本块预览（F-CK-04）：表概要 + 表结构详情 + 操作。
 *  rawText 不展示（入 RAG 内部产物；上传时后端据 summary/fields 重写，保证编辑后一致）。 */
export default function ChunkPreview({
  chunk,
  ingestStatus,
  uploading,
  saved,
  onChange,
  onSaveDraft,
  onUpload,
}: Props) {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink-2">表概要</h3>
        <div className="rounded-lg border border-line p-3">
          <SummaryFields
            summary={chunk.summary}
            onChange={(s) => onChange({ ...chunk, summary: s })}
          />
        </div>
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink-2">表结构详情</h3>
        <div className="rounded-lg border border-line p-3">
          <FieldDetailTable
            fields={chunk.fields}
            onChange={(f) => onChange({ ...chunk, fields: f })}
          />
        </div>
      </section>
      <ChunkActions
        ingestStatus={ingestStatus}
        uploading={uploading}
        saved={saved}
        onSaveDraft={onSaveDraft}
        onUpload={onUpload}
      />
    </div>
  )
}
