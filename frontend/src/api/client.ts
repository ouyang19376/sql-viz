import type { ApiResponse } from '@/types'
import { ApiError } from '@/types'

/** API 基址：dev 走 Vite 代理 /api，生产用环境变量 */
const BASE_URL = import.meta.env.VITE_API_BASE ?? '/api'

/** fetch 封装：解包 ApiResponse，code !== 0 抛 ApiError */
export async function apiClient<T>(endpoint: string): Promise<T> {
  const url = `${BASE_URL}${endpoint}`
  const resp = await fetch(url)
  if (!resp.ok) {
    throw new ApiError(resp.status, `HTTP ${resp.status}`)
  }
  const body: ApiResponse<T> = await resp.json()
  if (body.code !== 0) {
    throw new ApiError(body.code, body.message)
  }
  return body.data
}
