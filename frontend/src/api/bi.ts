import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ApiResponse } from '@/types'
import { ApiError } from '@/types'
import type {
  AggregateRequest,
  AggregateResponse,
  DatasetMeta,
  PreviewRequest,
  PreviewResponse,
} from '@/types/bi'

const BASE_URL = import.meta.env.VITE_API_BASE ?? '/api'

/** BI 模块 TanStack Query key。 */
export const biKeys = {
  datasets: ['bi', 'datasets'] as const,
  preview: (id: string, req: PreviewRequest) => ['bi', 'preview', id, req] as const,
  aggregate: (id: string, req: AggregateRequest) => ['bi', 'aggregate', id, req] as const,
}

/** 解析 fetch 响应为 ApiResponse.data；非 2xx / code!=0 抛 ApiError（含后端文案）。 */
async function unwrap<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let message = `HTTP ${resp.status}`
    try {
      const body = (await resp.json()) as ApiResponse<unknown>
      if (body && typeof body.message === 'string') message = body.message
    } catch {
      // 忽略解析失败
    }
    throw new ApiError(resp.status, message)
  }
  const body = (await resp.json()) as ApiResponse<T>
  if (body.code !== 0) throw new ApiError(body.code, body.message)
  return body.data
}

// ─── F-DS-05：数据集列表 ─────────────────────────────────────────
export function useDatasets() {
  return useQuery({
    queryKey: biKeys.datasets,
    queryFn: () => fetch(`${BASE_URL}/bi/datasets`).then((r) => unwrap<DatasetMeta[]>(r)),
    staleTime: 30 * 1000,
  })
}

// ─── F-DS-01：上传解析 ───────────────────────────────────────────
async function uploadDataset(file: File): Promise<DatasetMeta> {
  const form = new FormData()
  form.append('file', file)
  const resp = await fetch(`${BASE_URL}/bi/datasets/upload`, { method: 'POST', body: form })
  return unwrap<DatasetMeta>(resp)
}

/** 上传成功后由调用方决定选中 / 提示；这里只负责 invalidate 列表。 */
export function useUploadMutation() {
  const qc = useQueryClient()
  return useMutation<DatasetMeta, ApiError, File>({
    mutationFn: uploadDataset,
    retry: false,
    onSuccess: () => qc.invalidateQueries({ queryKey: biKeys.datasets }),
  })
}

// ─── F-DS-07：删除数据集 ─────────────────────────────────────────
async function deleteDatasets(ids: string[]): Promise<void> {
  // 后端按单个 id 删除；批量在前端串行触发
  for (const id of ids) {
    const resp = await fetch(`${BASE_URL}/bi/datasets/${id}`, { method: 'DELETE' })
    await unwrap<null>(resp)
  }
}

export function useDeleteMutation() {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string[]>({
    mutationFn: deleteDatasets,
    retry: false,
    onSuccess: () => qc.invalidateQueries({ queryKey: biKeys.datasets }),
  })
}

// ─── F-PV-01/02/03 + API-BI-04：明细预览（分页 + 筛选） ──────────
/** datasetId 为 null 时禁用查询；分页切换用 keepPreviousData 保留上一页避免闪烁。 */
export function usePreview(datasetId: string | null, req: PreviewRequest) {
  return useQuery({
    queryKey: biKeys.preview(datasetId ?? '', req),
    enabled: !!datasetId,
    placeholderData: keepPreviousData,
    queryFn: () =>
      fetch(`${BASE_URL}/bi/datasets/${datasetId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      }).then((r) => unwrap<PreviewResponse>(r)),
  })
}

// ─── F-VZ-01/02/03 + API-BI-05：聚合（总览卡片 + 主图 + 下钻重查） ──
/** datasetId / enabled 为假时禁用。下钻改变 req → queryKey 变化自动重查；
 *  上钻回滚 req → 命中上层缓存秒回退（PRD 难点 4）。
 *  keepPreviousData 让 ECharts 拿到上一份数据做补间过渡，避免闪烁（难点 5）。 */
export function useAggregate(
  datasetId: string | null,
  req: AggregateRequest,
  enabled = true,
) {
  return useQuery({
    queryKey: biKeys.aggregate(datasetId ?? '', req),
    enabled: !!datasetId && enabled && req.metrics.length > 0,
    placeholderData: keepPreviousData,
    queryFn: () =>
      fetch(`${BASE_URL}/bi/datasets/${datasetId}/aggregate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      }).then((r) => unwrap<AggregateResponse>(r)),
  })
}
