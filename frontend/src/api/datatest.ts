import { useMutation } from '@tanstack/react-query'
import type { ApiResponse } from '@/types'
import { ApiError } from '@/types'
import type { GenerateRequest, GenerateResponse } from '@/types/datatest'

const BASE_URL = import.meta.env.VITE_API_BASE ?? '/api'

/** 生成测试数据集（POST /api/datatest/generate）。
 *  错误码（PRD §6.2）：
 *  - 504 / code=-1：LLM 超时
 *  - 500 / code=-2：LLM 上游异常
 *  - 422：Pydantic 校验失败（前端理论上不应触发）
 *  失败均抛 ApiError，由 useGenerateMutation 暴露 onError 给 UI。 */
export async function generateDataset(req: GenerateRequest): Promise<GenerateResponse> {
  const resp = await fetch(`${BASE_URL}/datatest/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })

  // 非 2xx：先尝试解 ApiResponse 取 message，失败再退化为 HTTP 状态文案
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

  const body = (await resp.json()) as ApiResponse<GenerateResponse>
  if (body.code !== 0) {
    throw new ApiError(body.code, body.message)
  }
  return body.data
}

/** TanStack Query mutation：复用其 loading/error 机制（plan §5.1） */
export function useGenerateMutation() {
  return useMutation<GenerateResponse, ApiError, GenerateRequest>({
    mutationFn: generateDataset,
    retry: false,
  })
}
