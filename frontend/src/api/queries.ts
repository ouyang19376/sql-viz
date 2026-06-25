import { useQuery } from '@tanstack/react-query'
import { apiClient } from './client'
import { queryKeys } from './keys'
import type {
  CompatibleResponse,
  DialectDetailResponse,
  DialectListResponse,
  FunctionDetailResponse,
  SearchResponse,
} from '@/types'

/** 获取方言列表（首页、Navbar 下拉使用） */
export function useDialects() {
  return useQuery({
    queryKey: queryKeys.dialects.all,
    queryFn: () => apiClient<DialectListResponse>('/dialects'),
    staleTime: 10 * 60 * 1000,
  })
}

/** 获取方言详情（方言页使用） */
export function useDialect(dialectId: string) {
  return useQuery({
    queryKey: queryKeys.dialects.detail(dialectId),
    queryFn: () => apiClient<DialectDetailResponse>(`/dialects/${dialectId}`),
    staleTime: 10 * 60 * 1000,
    enabled: !!dialectId,
    retry: false, // 404 不重试，直接走 error 态渲染 EmptyState
  })
}

/** 获取函数详情（函数详情页使用，含 animation） */
export function useFunction(dialectId: string, functionId: string) {
  return useQuery({
    queryKey: queryKeys.functions.detail(dialectId, functionId),
    queryFn: () =>
      apiClient<FunctionDetailResponse>(
        `/dialects/${dialectId}/functions/${functionId}`,
      ),
    staleTime: 5 * 60 * 1000,
    enabled: !!dialectId && !!functionId,
    retry: false, // 404 不重试
  })
}

/** 跨方言对照（F-FD-03）：某函数在其他方言中的对应签名 */
export function useCompatible(functionId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.functions.compatible(functionId),
    queryFn: () =>
      apiClient<CompatibleResponse>(`/functions/${functionId}/compatible`),
    staleTime: 10 * 60 * 1000,
    enabled: !!functionId && enabled,
    retry: false,
  })
}

/** 函数搜索（F-SH-01 / F-BK-04）。
 *
 * 调用方需在传入前自行 debounce（参见 `useDebouncedValue`），
 * 这里只在 q 非空时启用查询。
 */
export function useSearch(q: string, dialectId?: string) {
  const trimmed = q.trim()
  return useQuery({
    queryKey: queryKeys.search.byQuery(trimmed, dialectId),
    queryFn: () => {
      const params = new URLSearchParams({ q: trimmed })
      if (dialectId) params.set('dialect_id', dialectId)
      return apiClient<SearchResponse>(`/search?${params.toString()}`)
    },
    enabled: trimmed.length > 0,
    staleTime: 0,
    retry: false,
  })
}
