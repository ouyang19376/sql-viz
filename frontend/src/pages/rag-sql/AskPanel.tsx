import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import EmptyState from '@/components/shared/EmptyState'
import Skeleton from '@/components/shared/Skeleton'
import { streamAsk } from '@/api/rag-sql'
import { useRagSqlStore } from '@/stores/useRagSqlStore'
import type { AskRequest, AskSource, AskValidation, RagDialect } from '@/types/rag-sql'
import AskConfig from './components/AskConfig'
import AskInput from './components/AskInput'
import AskResult from './components/AskResult'

type Phase = 'idle' | 'streaming' | 'done' | 'error'

/** NL2SQL 问答面板（F-AS-01~13 + F-AS-14/15）：
 *  AskConfig（方言/多轮）+ AskInput（问题）+ AskResult（SQL/来源/降级/校验/导入工作台）。
 *  流式为主路径（F-AS-15）：meta（来源/降级）即发 -> 逐 token 渲染 SQL -> done（校验）。
 *  多轮开时记录问答历史（store localStorage 持久化，F-AS-13）。 */
export default function AskPanel() {
  const dialect = useRagSqlStore((s) => s.dialect)
  const multiTurn = useRagSqlStore((s) => s.multiTurn)
  const recordTurns = useRagSqlStore((s) => s.recordTurns)
  const getCurrentHistory = useRagSqlStore((s) => s.getCurrentHistory)

  const [question, setQuestion] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [sql, setSql] = useState('')
  const [sources, setSources] = useState<AskSource[]>([])
  const [degraded, setDegraded] = useState(false)
  const [degradeReason, setDegradeReason] = useState<string | null>(null)
  const [validation, setValidation] = useState<AskValidation | undefined>(undefined)
  const [resultDialect, setResultDialect] = useState<RagDialect>(dialect)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleGenerate = () => {
    const q = question.trim()
    if (!q || phase === 'streaming') return
    setPhase('streaming')
    setSql('')
    setSources([])
    setDegraded(false)
    setDegradeReason(null)
    setValidation(undefined)
    setErrorMsg(null)
    setResultDialect(dialect)

    const req: AskRequest = { question: q, dialect }
    if (multiTurn) {
      const history = getCurrentHistory()
      if (history.length > 0) req.history = history
      const convId = useRagSqlStore.getState().currentConversationId
      if (convId) req.conversationId = convId
    }

    streamAsk(req, {
      onMeta: (m) => {
        setSources(m.sources)
        setDegraded(m.degraded)
        setDegradeReason(m.degradeReason ?? null)
      },
      onDelta: (d) => setSql((prev) => prev + d),
      onDone: (d) => {
        setSql(d.sql)
        setValidation(d.validation)
        setResultDialect(d.dialect)
        setSources(d.sources)
        setDegraded(d.degraded)
        setDegradeReason(d.degradeReason ?? null)
        setPhase('done')
        if (multiTurn) recordTurns(q, d.sql)
      },
      onError: (msg) => {
        setErrorMsg(msg)
        setPhase('error')
      },
    })
  }

  const retrieving = phase === 'streaming' && sql === '' && sources.length === 0
  const showResult =
    phase === 'done' || (phase === 'streaming' && (sql !== '' || sources.length > 0))

  return (
    <div className="space-y-4">
      <AskConfig />
      <AskInput
        value={question}
        onChange={setQuestion}
        onGenerate={handleGenerate}
        pending={phase === 'streaming'}
      />

      {phase === 'idle' && (
        <EmptyState
          title="暂无生成结果"
          description="选择方言与多轮开关，输入自然语言问题，点「生成 SQL」开始检索与生成。"
        />
      )}

      {retrieving && <Skeleton lines={4} />}

      {phase === 'error' && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-500/10 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">{errorMsg || '生成失败'}</div>
          <button
            type="button"
            onClick={handleGenerate}
            className="shrink-0 font-medium underline"
          >
            重试
          </button>
        </div>
      )}

      {showResult && (
        <AskResult
          sql={sql}
          sources={sources}
          degraded={degraded}
          degradeReason={degradeReason}
          validation={validation}
          dialect={resultDialect}
          streaming={phase === 'streaming'}
          done={phase === 'done'}
        />
      )}
    </div>
  )
}
