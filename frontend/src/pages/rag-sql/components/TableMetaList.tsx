import { useState } from 'react'
import { Database, Eye } from 'lucide-react'
import type { TableMetaRef } from '@/types/rag-sql'
import ChunkPreviewDrawer from './ChunkPreviewDrawer'

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false })
}

interface Props {
  tables: TableMetaRef[]
}

/** SQL数据表元数据列表（CK 入库的 table_meta）。
 *  与规范文档列表同构：每张表一项，点击「预览」展示该表解析后的文本块原文（build_raw_text 产物）。 */
export default function TableMetaList({ tables }: Props) {
  const [preview, setPreview] = useState<TableMetaRef | null>(null)

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
        SQL数据表元数据
        <span className="ml-1.5 text-xs font-normal text-gray-400">({tables.length})</span>
      </h3>
      {tables.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 px-3 py-4 text-center text-xs text-gray-400 dark:border-gray-700">
          暂无表元数据，在「文本块生成」中解析建表语句并入库后，此处展示对应文本块。
        </div>
      ) : (
        <ul className="space-y-2">
          {tables.map((t) => (
            <li
              key={t.tableName}
              className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Database className="h-4 w-4 shrink-0 text-emerald-500" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {t.tableName}
                  </p>
                  <p className="text-xs text-gray-400">
                    {t.topic || '表元数据'} · {fmtTime(t.createdAt)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreview(t)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <Eye className="h-3.5 w-3.5" />
                预览
              </button>
            </li>
          ))}
        </ul>
      )}
      <ChunkPreviewDrawer
        open={!!preview}
        title={preview?.tableName ?? ''}
        chunks={preview ? [{ index: 0, text: preview.rawText }] : []}
        onClose={() => setPreview(null)}
      />
    </section>
  )
}
