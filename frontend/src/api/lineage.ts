import { useMutation } from '@tanstack/react-query'
import type { ApiResponse } from '@/types'
import { ApiError } from '@/types'
import type {
  LineageAnalyzeRequest,
  LineageAnalyzeResponse,
  LineageNeo4jPushRequest,
  LineageNeo4jPushResult,
} from '@/types/lineage'

const BASE_URL = import.meta.env.VITE_API_BASE ?? '/api'

/** 分析 SQL 表级血缘（POST /api/lineage/analyze）。 */
export async function analyzeLineage(req: LineageAnalyzeRequest): Promise<LineageAnalyzeResponse> {
  const resp = await fetch(`${BASE_URL}/lineage/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })

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

  const body = (await resp.json()) as ApiResponse<LineageAnalyzeResponse>
  if (body.code !== 0) {
    throw new ApiError(body.code, body.message)
  }
  return body.data
}

/** 直接推送血缘结果到 Neo4j（POST /api/lineage/push-neo4j）。 */
export async function pushLineageToNeo4j(req: LineageNeo4jPushRequest): Promise<LineageNeo4jPushResult> {
  const resp = await fetch(`${BASE_URL}/lineage/push-neo4j`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })

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

  const body = (await resp.json()) as ApiResponse<LineageNeo4jPushResult>
  if (body.code !== 0) {
    throw new ApiError(body.code, body.message)
  }
  return body.data
}

export function useLineageAnalysisMutation() {
  return useMutation<LineageAnalyzeResponse, ApiError, LineageAnalyzeRequest>({
    mutationFn: analyzeLineage,
    retry: false,
  })
}

export function useNeo4jPushMutation() {
  return useMutation<LineageNeo4jPushResult, ApiError, LineageNeo4jPushRequest>({
    mutationFn: pushLineageToNeo4j,
    retry: false,
  })
}
