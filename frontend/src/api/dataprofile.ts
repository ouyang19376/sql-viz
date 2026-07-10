import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ApiResponse } from '@/types'
import { ApiError } from '@/types'
import type {
  AnalyzeRequest,
  BuiltInMetric,
  ColumnInfo,
  CustomRule,
  CustomRuleInput,
  DataSource,
  DataSourceConfig,
  ExplainRequest,
  ExplainResult,
  FormatRequest,
  FormatResult,
  GenerateProfileRequest,
  GenerateProfileResponse,
  QueryRequest,
  QueryResponse,
  RuleExportPayload,
  RuleImportInput,
  RuleImportResult,
  SqlAnalysis,
  TableInfo,
  TestResult,
} from '@/types/dataprofile'
import { queryKeys } from './keys'
import { useDataProfileStore } from '@/stores/useDataProfileStore'

const BASE_URL = import.meta.env.VITE_API_BASE ?? '/api'

/** 会话感知的 fetch：注入 X-Session-Id（PRD §8.1），解包 ApiResponse。
 *  非 2xx 或 code !== 0 抛 ApiError，复用既有错误类型。 */
async function dpFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const sessionId = useDataProfileStore.getState().sessionId
  const headers: Record<string, string> = { 'X-Session-Id': sessionId }
  const method = init?.method ?? 'GET'
  if (init?.body) headers['Content-Type'] = 'application/json'

  const resp = await fetch(`${BASE_URL}${path}`, { ...init, method, headers })

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
  if (body.code !== 0) {
    throw new ApiError(body.code, body.message)
  }
  return body.data
}

// ─── 基础请求函数 ──────────────────────────────────────
export function testSource(req: DataSourceConfig): Promise<TestResult> {
  return dpFetch<TestResult>('/dataprofile/sources/test', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

export function registerSource(req: DataSourceConfig): Promise<DataSource> {
  return dpFetch<DataSource>('/dataprofile/sources', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

export function listSources(): Promise<DataSource[]> {
  return dpFetch<DataSource[]>('/dataprofile/sources')
}

export function deleteSource(id: string): Promise<void> {
  return dpFetch<void>(`/dataprofile/sources/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function editSource(id: string, req: DataSourceConfig): Promise<DataSource> {
  return dpFetch<DataSource>(`/dataprofile/sources/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(req),
  })
}

export function reconnectSource(id: string): Promise<DataSource> {
  return dpFetch<DataSource>(`/dataprofile/sources/${encodeURIComponent(id)}/reconnect`, {
    method: 'POST',
  })
}

export function listSchemas(id: string): Promise<string[]> {
  return dpFetch<string[]>(`/dataprofile/sources/${encodeURIComponent(id)}/schemas`)
}

export function listTables(id: string, schema?: string): Promise<TableInfo[]> {
  const qs = schema ? `?schema=${encodeURIComponent(schema)}` : ''
  return dpFetch<TableInfo[]>(`/dataprofile/sources/${encodeURIComponent(id)}/tables${qs}`)
}

export function listColumns(id: string, table: string, schema?: string): Promise<ColumnInfo[]> {
  const qs = schema ? `?schema=${encodeURIComponent(schema)}` : ''
  return dpFetch<ColumnInfo[]>(
    `/dataprofile/sources/${encodeURIComponent(id)}/tables/${encodeURIComponent(table)}/columns${qs}`,
  )
}

// ─── 查询 hooks ────────────────────────────────────────
export function useSources() {
  return useQuery({
    queryKey: queryKeys.dataprofile.sources,
    queryFn: listSources,
    staleTime: 0, // 数据源状态随时变，始终重拉
    retry: false,
  })
}

export function useSchemas(dsId: string | null) {
  return useQuery({
    queryKey: queryKeys.dataprofile.schemas(dsId ?? ''),
    queryFn: () => listSchemas(dsId as string),
    enabled: !!dsId,
    staleTime: 60 * 1000,
    retry: false,
  })
}

export function useTables(dsId: string | null, schema?: string) {
  return useQuery({
    queryKey: queryKeys.dataprofile.tables(dsId ?? '', schema),
    queryFn: () => listTables(dsId as string, schema),
    enabled: !!dsId,
    staleTime: 60 * 1000,
    retry: false,
  })
}

export function useColumns(dsId: string | null, table: string | null, schema?: string) {
  return useQuery({
    queryKey: queryKeys.dataprofile.columns(dsId ?? '', table ?? '', schema),
    queryFn: () => listColumns(dsId as string, table as string, schema),
    enabled: !!dsId && !!table,
    staleTime: 60 * 1000,
    retry: false,
  })
}

// ─── 变更 hooks（成功后自动失效 sources 列表，保持新鲜） ──
function useInvalidateSources() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: queryKeys.dataprofile.sources })
}

export function useTestSourceMutation() {
  return useMutation<TestResult, ApiError, DataSourceConfig>({
    mutationFn: testSource,
    retry: false,
  })
}

export function useRegisterSourceMutation() {
  const invalidate = useInvalidateSources()
  return useMutation<DataSource, ApiError, DataSourceConfig>({
    mutationFn: registerSource,
    retry: false,
    onSuccess: invalidate,
  })
}

export function useDeleteSourceMutation() {
  const invalidate = useInvalidateSources()
  return useMutation<void, ApiError, string>({
    mutationFn: deleteSource,
    retry: false,
    onSuccess: invalidate,
  })
}

export function useEditSourceMutation() {
  const invalidate = useInvalidateSources()
  return useMutation<DataSource, ApiError, { id: string; req: DataSourceConfig }>({
    mutationFn: ({ id, req }) => editSource(id, req),
    retry: false,
    onSuccess: invalidate,
  })
}

export function useReconnectSourceMutation() {
  const invalidate = useInvalidateSources()
  return useMutation<DataSource, ApiError, string>({
    mutationFn: reconnectSource,
    retry: false,
    onSuccess: invalidate,
  })
}

// ─── 查询工作台（QB） ─────────────────────────────────
/** 执行查询（API-QB-01）。signal 支持前端取消（F-QB-06）。 */
export function runQuery(req: QueryRequest, signal?: AbortSignal): Promise<QueryResponse> {
  return dpFetch<QueryResponse>('/dataprofile/query', {
    method: 'POST',
    body: JSON.stringify(req),
    signal,
  })
}

/** 独立静态分析（API-QB-02 / F-QB-03） */
export function analyzeSql(req: AnalyzeRequest): Promise<SqlAnalysis> {
  return dpFetch<SqlAnalysis>('/dataprofile/analyze', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

/** SQL 格式化（F-QB-11） */
export function formatSql(req: FormatRequest): Promise<FormatResult> {
  return dpFetch<FormatResult>('/dataprofile/format', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

/**
 * 运行查询 mutation（F-QB-06 取消）。
 * 错误类型放宽为 Error：取消时抛 AbortError（DOMException），HTTP 错误抛 ApiError。
 * 变量携带 AbortSignal，调用方在发起前新建 controller、onError 时 abort。
 */
export function useRunQueryMutation() {
  return useMutation<QueryResponse, Error, { req: QueryRequest; signal?: AbortSignal }>({
    mutationFn: ({ req, signal }) => runQuery(req, signal),
    retry: false,
  })
}

export function useFormatSqlMutation() {
  return useMutation<FormatResult, ApiError, FormatRequest>({
    mutationFn: formatSql,
    retry: false,
  })
}

// ─── 探查规则库（RL） ─────────────────────────────────
/** 内置指标目录（API-RL-01，只读，跨会话不变 -> 长缓存） */
export function listMetrics(): Promise<BuiltInMetric[]> {
  return dpFetch<BuiltInMetric[]>('/dataprofile/metrics')
}

/** 自定义规则列表（API-RL-02） */
export function listRules(): Promise<CustomRule[]> {
  return dpFetch<CustomRule[]>('/dataprofile/rules')
}

export function createRule(req: CustomRuleInput): Promise<CustomRule> {
  return dpFetch<CustomRule>('/dataprofile/rules', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

export function updateRule(id: string, req: CustomRuleInput): Promise<CustomRule> {
  return dpFetch<CustomRule>(`/dataprofile/rules/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(req),
  })
}

export function deleteRule(id: string): Promise<void> {
  return dpFetch<void>(`/dataprofile/rules/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

/** 规则集导出（F-RL-08） */
export function exportRules(): Promise<RuleExportPayload> {
  return dpFetch<RuleExportPayload>('/dataprofile/rules/export')
}

/** 规则集导入（F-RL-08） */
export function importRules(req: RuleImportInput): Promise<RuleImportResult> {
  return dpFetch<RuleImportResult>('/dataprofile/rules/import', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

export function useMetrics() {
  return useQuery({
    queryKey: queryKeys.dataprofile.metrics,
    queryFn: listMetrics,
    staleTime: 5 * 60 * 1000, // 内置目录只读不变，长缓存
    retry: false,
  })
}

export function useRules() {
  return useQuery({
    queryKey: queryKeys.dataprofile.rules,
    queryFn: listRules,
    staleTime: 0, // CRUD 后需重拉
    retry: false,
  })
}

function useInvalidateRules() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: queryKeys.dataprofile.rules })
}

export function useCreateRuleMutation() {
  const invalidate = useInvalidateRules()
  return useMutation<CustomRule, ApiError, CustomRuleInput>({
    mutationFn: createRule,
    retry: false,
    onSuccess: invalidate,
  })
}

export function useUpdateRuleMutation() {
  const invalidate = useInvalidateRules()
  return useMutation<CustomRule, ApiError, { id: string; req: CustomRuleInput }>({
    mutationFn: ({ id, req }) => updateRule(id, req),
    retry: false,
    onSuccess: invalidate,
  })
}

export function useDeleteRuleMutation() {
  const invalidate = useInvalidateRules()
  return useMutation<void, ApiError, string>({
    mutationFn: deleteRule,
    retry: false,
    onSuccess: invalidate,
  })
}

export function useImportRulesMutation() {
  const invalidate = useInvalidateRules()
  return useMutation<RuleImportResult, ApiError, RuleImportInput>({
    mutationFn: importRules,
    retry: false,
    onSuccess: invalidate,
  })
}

// ─── 探查脚本生成（PG，API-PG-01/02） ─────────────────
/** 生成探查脚本（API-PG-01，含模板渲染 + LLM 仿写 + 静态分析 + EXPLAIN） */
export function generateProfile(req: GenerateProfileRequest): Promise<GenerateProfileResponse> {
  return dpFetch<GenerateProfileResponse>('/dataprofile/generate', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

/** EXPLAIN 试运行（API-PG-02） */
export function explainScript(req: ExplainRequest): Promise<ExplainResult> {
  return dpFetch<ExplainResult>('/dataprofile/explain', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

/** 生成 mutation（F-PG-01）。LLM 调用可能较慢，retry:false 由用户决定重试。 */
export function useGenerateMutation() {
  return useMutation<GenerateProfileResponse, Error, GenerateProfileRequest>({
    mutationFn: generateProfile,
    retry: false,
  })
}

export function useExplainMutation() {
  return useMutation<ExplainResult, ApiError, ExplainRequest>({
    mutationFn: explainScript,
    retry: false,
  })
}
