import type { AskSource } from '@/types/rag-sql'

/** 知识库问答（kbqa）：与后端 app/services/kbqa_models.py 一一对应 */

/** 多轮会话单轮（发给后端的 history 项） */
export interface KbqaTurn {
  role: 'user' | 'assistant'
  content: string
}

/** POST /api/kbqa/chat/stream 入参 */
export interface KbqaChatRequest {
  question: string
  topK?: number
  conversationId?: string
  history?: KbqaTurn[]
}

/** /chat/stream 的 meta 事件载荷（检索后即发） */
export interface KbqaStreamMeta {
  sources: AskSource[]
  degraded: boolean
  degradeReason?: string | null
}

/** /chat/stream 的 done 事件载荷 */
export interface KbqaStreamDone {
  answer: string
  sources: AskSource[]
  degraded: boolean
  degradeReason?: string | null
}
