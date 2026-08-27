import type { ApiResponse } from '@/types'
import type {
  KbqaChatRequest,
  KbqaStreamDone,
  KbqaStreamMeta,
} from '@/types/kbqa'

const BASE_URL = import.meta.env.VITE_API_BASE ?? '/api'

/** streamChat 回调：onMeta 在检索后即触发（先渲染来源/降级提示），再逐 token 渲染回答。 */
export interface StreamChatHandlers {
  onMeta: (meta: KbqaStreamMeta) => void
  onDelta: (delta: string) => void
  onDone: (done: KbqaStreamDone) => void
  onError: (message: string) => void
}

/**
 * 流式知识库问答：fetch + ReadableStream 解析 SSE 帧（无新依赖，
 * EventSource 不支持 POST + body 故不可用）。帧序列 meta -> delta* -> done | error。
 * signal 用于「停止生成」中断 fetch。
 */
export async function streamChat(
  req: KbqaChatRequest,
  handlers: StreamChatHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const resp = await fetch(`${BASE_URL}/kbqa/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
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
      handlers.onMeta(payload as unknown as KbqaStreamMeta)
    } else if (event === 'delta') {
      handlers.onDelta(String(payload.delta ?? ''))
    } else if (event === 'done') {
      handlers.onDone(payload as unknown as KbqaStreamDone)
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
    if (err instanceof DOMException && err.name === 'AbortError') return // 用户主动停止
    handlers.onError(err instanceof Error ? err.message : '生成失败')
  }
}
