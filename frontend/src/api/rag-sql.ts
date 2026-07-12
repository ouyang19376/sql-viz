import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ApiResponse } from '@/types'
import { ApiError } from '@/types'
import type {
  AskRequest,
  AskResponse,
  AskSource,
  AskValidation,
  ChunkRequest,
  ChunkResponse,
  IngestResult,
  IngestTableChunkRequest,
  KbDocDetail,
  KbDocInput,
  KbDocRef,
  KbIngestResult,
  RagDialect,
  RagSqlStats,
  TableMetaRef,
} from '@/types/rag-sql'

const BASE_URL = import.meta.env.VITE_API_BASE ?? '/api'

/** RAG 请求 fetch：无 X-Session-Id（知识库全局共享，PRD §10 A14），解包 ApiResponse。
 *  非 2xx 或 code !== 0 抛 ApiError，复用既有错误类型（对齐 api/dataprofile 的 dpFetch）。 */
async function rsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET'
  const headers: Record<string, string> = {}
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

/** RAG query key（KB 列表 / 详情缓存；ingest/delete 成功后 invalidate 列表） */
const kbKeys = {
  list: ['rag-sql', 'kb'] as const,
  detail: (id: string) => ['rag-sql', 'kb', id] as const,
}

/** 表元数据列表 query key（table 入库成功后 invalidate，刷新 KB 栏目「SQL数据表元数据」） */
const tablesKey = ['rag-sql', 'tables'] as const

/** stats query key（ingest/delete 成功后失效重拉，F-BK-CM-01） */
const statsKey = ['rag-sql', 'stats'] as const

// ─── CK 子模块（API-CK-01 / API-CK-02） ──────────────────
/** DDL -> 结构化文本块（API-CK-01） */
export function chunkDdl(req: ChunkRequest): Promise<ChunkResponse> {
  return rsFetch<ChunkResponse>('/rag-sql/chunk', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

/** 表文本块入 RAG（API-CK-02） */
export function ingestTable(req: IngestTableChunkRequest): Promise<IngestResult> {
  return rsFetch<IngestResult>('/rag-sql/ingest/table', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

/** 生成文本块 mutation（F-CK-02/03/09）。LLM 调用可能较慢，retry:false 由用户决定重试。 */
export function useChunkMutation() {
  return useMutation<ChunkResponse, ApiError, ChunkRequest>({
    mutationFn: chunkDdl,
    retry: false,
  })
}

/** 表文本块入库 mutation（F-CK-07/08）。覆盖确认由组件按 alreadyExists 二次提交。 */
export function useIngestTableMutation() {
  const qc = useQueryClient()
  return useMutation<IngestResult, ApiError, IngestTableChunkRequest>({
    mutationFn: ingestTable,
    retry: false,
    onSuccess: (data) => {
      if (data.ingested) {
        qc.invalidateQueries({ queryKey: statsKey })
        // 刷新 KB 栏目「SQL数据表元数据」列表
        qc.invalidateQueries({ queryKey: tablesKey })
      }
    },
  })
}

/** 已入库表元数据列表（API-CK-03 / KB 栏目「SQL数据表元数据」展示） */
export function listTables(): Promise<TableMetaRef[]> {
  return rsFetch<TableMetaRef[]>('/rag-sql/tables')
}

/** 表元数据列表 query；进入 KB Tab / 刷新自动拉取，table 入库后由 mutation 失效重拉。 */
export function useTableMetaQuery() {
  return useQuery({
    queryKey: tablesKey,
    queryFn: listTables,
    staleTime: 30 * 1000,
  })
}

// ─── KB 子模块（API-KB-01~04，F-KB-01~08） ───────────────
/** 文档入 RAG（API-KB-01） */
export function ingestDoc(req: KbDocInput): Promise<KbIngestResult> {
  return rsFetch<KbIngestResult>('/rag-sql/ingest/doc', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

/** 知识列表（API-KB-02） */
export function listKbDocs(): Promise<KbDocRef[]> {
  return rsFetch<KbDocRef[]>('/rag-sql/kb')
}

/** 文档详情 / 分片原文（API-KB-03） */
export function getKbDoc(id: string): Promise<KbDocDetail> {
  return rsFetch<KbDocDetail>(`/rag-sql/kb/${id}`)
}

/** 删除文档及分片（API-KB-04） */
export function deleteKbDoc(id: string): Promise<{ deleted: number }> {
  return rsFetch<{ deleted: number }>(`/rag-sql/kb/${id}`, { method: 'DELETE' })
}

/** 文档入库 mutation（F-KB-03/07）。覆盖确认由组件按 alreadyExists 二次提交。 */
export function useIngestDocMutation() {
  const qc = useQueryClient()
  return useMutation<KbIngestResult, ApiError, KbDocInput>({
    mutationFn: ingestDoc,
    retry: false,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: kbKeys.list })
      if (data.ingested) qc.invalidateQueries({ queryKey: statsKey })
    },
  })
}

/** 知识列表 query（F-KB-04）；进入 Tab / 刷新自动拉取，staleTime 30s。 */
export function useKbDocsQuery() {
  return useQuery({
    queryKey: kbKeys.list,
    queryFn: listKbDocs,
    staleTime: 30 * 1000,
  })
}

/** 文档详情 query（F-KB-05）；id 为空时禁用，避免无谓请求。 */
export function useKbDocQuery(id: string | null) {
  return useQuery({
    queryKey: kbKeys.detail(id ?? ''),
    enabled: !!id,
    queryFn: () => getKbDoc(id as string),
  })
}

/** 删除文档 mutation（F-KB-06）；成功后 invalidate 列表与详情。 */
export function useDeleteKbDocMutation() {
  const qc = useQueryClient()
  return useMutation<{ deleted: number }, ApiError, string>({
    mutationFn: deleteKbDoc,
    retry: false,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: kbKeys.list })
      qc.removeQueries({ queryKey: kbKeys.detail(id) })
      qc.invalidateQueries({ queryKey: statsKey })
    },
  })
}

// ============================================================
// AS 子模块（API-AS-01 + F-AS-15 流式）
// ============================================================
/**
 * 非流式 NL2SQL 生成（API-AS-01，P0 正典契约；前端默认用 streamAsk 流式路径）。
 * 保留封装便于未来需要单次往返或流式降级时复用。
 */
export function ask(req: AskRequest): Promise<AskResponse> {
  return rsFetch<AskResponse>('/rag-sql/ask', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

/** /ask/stream 的 meta 事件载荷 */
export interface AskStreamMeta {
  sources: AskSource[]
  degraded: boolean
  degradeReason?: string | null
  dialect: RagDialect
}

/** /ask/stream 的 done 事件载荷 */
export interface AskStreamDone {
  sql: string
  validation: AskValidation
  dialect: RagDialect
  sources: AskSource[]
  degraded: boolean
  degradeReason?: string | null
}

/** streamAsk 回调（F-AS-15）。onMeta 在检索后即触发，先渲染来源/降级提示，再逐 token 渲染 SQL。 */
export interface StreamAskHandlers {
  onMeta: (meta: AskStreamMeta) => void
  onDelta: (delta: string) => void
  onDone: (done: AskStreamDone) => void
  onError: (message: string) => void
}

/**
 * 流式 NL2SQL 生成（F-AS-15）：fetch + ReadableStream 解析 SSE 帧（无新依赖，
 * EventSource 不支持 POST + body 故不可用）。帧序列 meta -> delta* -> done | error。
 */
export async function streamAsk(req: AskRequest, handlers: StreamAskHandlers): Promise<void> {
  const resp = await fetch(`${BASE_URL}/rag-sql/ask/stream`, {
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
    handlers.onError(message)
    return
  }

  const reader = resp.body?.getReader()
  if (!reader) {
    handlers.onError('浏览器不支持流式读取')
    return
  }
  const decoder = new TextDecoder()
  let buffer = ''

  const handleFrame = (frame: string): boolean => {
    // 返回 false 表示遇到 done/error，应停止
    let event = 'message'
    let data = ''
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data += line.slice(5).trim()
    }
    const payload = data ? (JSON.parse(data) as Record<string, unknown>) : {}
    if (event === 'meta') {
      handlers.onMeta(payload as unknown as AskStreamMeta)
    } else if (event === 'delta') {
      handlers.onDelta(String(payload.delta ?? ''))
    } else if (event === 'done') {
      handlers.onDone(payload as unknown as AskStreamDone)
      return false
    } else if (event === 'error') {
      handlers.onError(String(payload.message ?? '生成失败'))
      return false
    }
    return true
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        if (frame.trim() && !handleFrame(frame)) return
      }
    }
    // 流自然结束但未收到 done -> 视作异常
    handlers.onError('生成流意外中断，请重试')
  } catch (err) {
    handlers.onError(err instanceof Error ? err.message : '生成失败')
  }
}

// ============================================================
// CM 子模块（API-CM-01 / F-BK-CM-01 stats）
// ============================================================
/** 知识库规模（API-CM-01 / F-BK-CM-01）：表数 / 文档数 / 分片数 */
export function getStats(): Promise<RagSqlStats> {
  return rsFetch<RagSqlStats>('/rag-sql/stats')
}

/** 知识库规模 query（F-BK-CM-01）；PageHeader 展示用，staleTime 30s。
 *  ingest/delete 成功后由对应 mutation 失效重拉。 */
export function useRagSqlStatsQuery() {
  return useQuery({
    queryKey: statsKey,
    queryFn: getStats,
    staleTime: 30 * 1000,
  })
}
