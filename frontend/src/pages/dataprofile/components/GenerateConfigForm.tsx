import { useEffect, useMemo, useState } from 'react'
import { Wand2 } from 'lucide-react'
import DialectBadge from '@/components/shared/DialectBadge'
import { useMetrics, useRules, useSchemas, useSources } from '@/api/dataprofile'
import { useDataProfileStore } from '@/stores/useDataProfileStore'
import {
  METRIC_CATEGORY_LABELS,
  PROFILE_DIALECTS,
} from '@/types/dataprofile'
import type {
  BuiltInMetric,
  GenerateHistoryEntry,
  GenerateProfileRequest,
  MetricCategory,
  OutputMode,
  ProfileDialect,
  SourceType,
} from '@/types/dataprofile'
import DataSourcePicker from './DataSourcePicker'

interface Props {
  /** 历史 refill 入参（key 变化时重挂载应用） */
  initial?: GenerateHistoryEntry | null
  onGenerate: (req: GenerateProfileRequest) => void
  generating: boolean
}

/** 生成配置面板（F-PG-01~04/13）。
 *  dialect 由所选数据源派生；指标多选（内置+自定义混选）；列级选择（统一应用于各表，留空=全列）。 */
export default function GenerateConfigForm({ initial, onGenerate, generating }: Props) {
  const selectedId = useDataProfileStore((s) => s.selectedDatasourceId)
  const selectDatasource = useDataProfileStore((s) => s.selectDatasource)
  const { data: sources } = useSources()
  const metricsQ = useMetrics()
  const rulesQ = useRules()

  const [datasourceId, setDatasourceId] = useState<string>(initial?.datasourceId ?? selectedId ?? '')
  const [sourceType, setSourceType] = useState<SourceType>(initial?.sourceType ?? 'tables')
  const [tableInput, setTableInput] = useState<string>((initial?.tables ?? []).join(', '))
  const [database, setDatabase] = useState<string>(initial?.database ?? '')
  const [metricIds, setMetricIds] = useState<string[]>(initial?.metricIds ?? [])
  const [customRuleIds, setCustomRuleIds] = useState<string[]>(initial?.customRuleIds ?? [])
  const [regexParam, setRegexParam] = useState<string>('')
  const [columnInput, setColumnInput] = useState<string>('')
  const [outputMode, setOutputMode] = useState<OutputMode>(initial?.outputMode ?? 'split')

  const dialect: ProfileDialect =
    sources?.find((s) => s.id === datasourceId)?.dialect ?? 'mysql'

  // 同步所选数据源到 store（QB/Generate 共享）
  useEffect(() => {
    if (datasourceId && datasourceId !== selectedId) selectDatasource(datasourceId)
  }, [datasourceId, selectedId, selectDatasource])

  const schemasQ = useSchemas(datasourceId || null)

  const metricGroups = useMemo(() => {
    const byCat: Record<MetricCategory, BuiltInMetric[]> = {
      completeness: [], uniqueness: [], validity: [], consistency: [], distribution: [],
    }
    for (const m of metricsQ.data ?? []) byCat[m.category].push(m)
    return byCat
  }, [metricsQ.data])

  // 自定义规则按所选方言过滤（规则方言须与数据源一致）
  const dialectRules = useMemo(
    () => (rulesQ.data ?? []).filter((r) => r.dialect === dialect),
    [rulesQ.data, dialect],
  )

  const needsRegex = metricIds.includes('regex_match')

  const toggle = (list: string[], id: string, setter: (v: string[]) => void) =>
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const tables = useMemo(
    () => tableInput.split(',').map((s) => s.trim()).filter(Boolean),
    [tableInput],
  )
  const columns = useMemo(
    () => (columnInput.trim() ? columnInput.split(',').map((s) => s.trim()).filter(Boolean) : []),
    [columnInput],
  )

  const canGenerate =
    !!datasourceId &&
    (sourceType === 'database' ? !!database : tables.length > 0) &&
    (metricIds.length > 0 || customRuleIds.length > 0) &&
    (!needsRegex || regexParam.trim().length > 0)

  const submit = () => {
    if (!canGenerate) return
    const req: GenerateProfileRequest = {
      datasourceId,
      dialect,
      sourceType,
      tables: sourceType === 'tables' ? tables : undefined,
      database: sourceType === 'database' ? database : undefined,
      metricIds,
      customRuleIds,
      columns:
        columns.length && tables.length
          ? Object.fromEntries(tables.map((t) => [t, columns]))
          : undefined,
      metricParams: needsRegex && regexParam.trim() ? { regex_match: regexParam.trim() } : undefined,
      outputMode,
    }
    onGenerate(req)
  }

  return (
    <div className="space-y-4 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <h2 className="text-sm font-semibold text-ink">生成配置</h2>
        <DialectBadge name={PROFILE_DIALECTS[dialect].name} color={PROFILE_DIALECTS[dialect].color} />
      </div>

      {/* 数据源 */}
      <div className="flex items-center gap-2">
        <span className="w-20 text-xs text-mute">数据源</span>
        <DataSourcePicker value={datasourceId} onChange={setDatasourceId} connectedOnly />
      </div>

      {/* 来源类型 */}
      <div className="flex items-center gap-2">
        <span className="w-20 text-xs text-mute">来源</span>
        <ModeToggle value={sourceType} onChange={setSourceType} options={[['tables', '按表'], ['database', '按库']]} />
        {sourceType === 'tables' ? (
          <input
            value={tableInput}
            onChange={(e) => setTableInput(e.target.value)}
            placeholder="表名，逗号分隔（如 users, db1.orders）"
            className="flex-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
          />
        ) : (
          <select
            value={database}
            onChange={(e) => setDatabase(e.target.value)}
            className="flex-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
          >
            <option value="">{schemasQ.isLoading ? '加载中…' : '选择库'}</option>
            {(schemasQ.data ?? []).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
      </div>

      {/* 内置指标多选（按分类分组） */}
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-xs font-medium text-ink-2">内置指标</span>
          <span className="text-xs text-mute">（已选 {metricIds.length}）</span>
        </div>
        {metricsQ.isLoading ? (
          <p className="text-xs text-mute">加载中…</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {(Object.keys(metricGroups) as MetricCategory[]).map((cat) => (
              <div key={cat} className="rounded-lg border border-line p-2">
                <div className="mb-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                  {METRIC_CATEGORY_LABELS[cat]}
                </div>
                <div className="space-y-1">
                  {(metricGroups[cat] ?? []).map((m) => (
                    <label key={m.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={metricIds.includes(m.id)}
                        onChange={() => toggle(metricIds, m.id, setMetricIds)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="font-mono text-ink-2">{m.id}</span>
                      <span className="text-mute">{m.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* regex_match 参数 */}
      {needsRegex && (
        <div className="flex items-center gap-2">
          <span className="w-20 text-xs text-amber-600 dark:text-amber-400">正则参数</span>
          <input
            value={regexParam}
            onChange={(e) => setRegexParam(e.target.value)}
            placeholder="regex_match 所需正则（如 ^\d+$）"
            className="flex-1 rounded-md border border-amber-300 bg-surface px-2.5 py-1.5 font-mono text-sm text-ink"
          />
        </div>
      )}

      {/* 自定义规则多选（按方言过滤） */}
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-xs font-medium text-ink-2">自定义规则</span>
          <span className="text-xs text-mute">（{PROFILE_DIALECTS[dialect].name}，已选 {customRuleIds.length}）</span>
        </div>
        {dialectRules.length === 0 ? (
          <p className="text-xs text-mute">该方言暂无自定义规则</p>
        ) : (
          <div className="space-y-1">
            {dialectRules.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={customRuleIds.includes(r.id)}
                  onChange={() => toggle(customRuleIds, r.id, setCustomRuleIds)}
                  className="h-3.5 w-3.5"
                />
                <span className="text-ink-2">{r.name}</span>
                {r.needsColumn && (
                  <span className="rounded bg-surface-2 px-1 text-mute">需列</span>
                )}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* 列级选择（F-PG-13，统一应用于各表，留空=全列） */}
      <div className="flex items-center gap-2">
        <span className="w-20 text-xs text-mute">列（可选）</span>
        <input
          value={columnInput}
          onChange={(e) => setColumnInput(e.target.value)}
          placeholder="留空=全列；否则逗号分隔列名（统一应用于各表）"
          className="flex-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
        />
      </div>

      {/* 输出模式 */}
      <div className="flex items-center gap-2">
        <span className="w-20 text-xs text-mute">输出模式</span>
        <ModeToggle
          value={outputMode}
          onChange={setOutputMode}
          options={[['split', '拆分（每段）'], ['merge', '合并（UNION ALL）']]}
        />
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={!canGenerate || generating}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-40"
        >
          <Wand2 className="h-4 w-4" />
          {generating ? '生成中…' : '生成脚本'}
        </button>
      </div>
      {!canGenerate && (metricIds.length > 0 || customRuleIds.length > 0) && (
        <p className="text-right text-xs text-amber-600 dark:text-amber-400">
          请补全来源/正则参数后生成
        </p>
      )}
    </div>
  )
}

function ModeToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: [T, string][]
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-line">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={
            'px-3 py-1.5 text-xs transition-colors ' +
            (v === value
              ? 'bg-accent text-white'
              : 'bg-surface text-ink-2 hover:bg-surface-2')
          }
        >
          {label}
        </button>
      ))}
    </div>
  )
}
