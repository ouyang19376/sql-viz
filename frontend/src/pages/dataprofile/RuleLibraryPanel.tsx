import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Download, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import type { ApiError } from '@/types'
import DialectBadge from '@/components/shared/DialectBadge'
import EmptyState from '@/components/shared/EmptyState'
import Skeleton from '@/components/shared/Skeleton'
import {
  exportRules,
  useCreateRuleMutation,
  useDeleteRuleMutation,
  useImportRulesMutation,
  useMetrics,
  useRules,
  useUpdateRuleMutation,
} from '@/api/dataprofile'
import { downloadFile } from '@/lib/exporters/downloadFile'
import { METRIC_CATEGORY_LABELS, PROFILE_DIALECTS } from '@/types/dataprofile'
import type {
  BuiltInMetric,
  CustomRule,
  CustomRuleInput,
  MetricCategory,
  ProfileDialect,
} from '@/types/dataprofile'

const DIALECTS: ProfileDialect[] = ['mysql', 'postgresql', 'hive']

type FormState = { mode: 'create' } | { mode: 'edit'; rule: CustomRule } | null

/** 探查规则库 Tab（F-RL-01~08）。上半内置指标目录（只读），下半自定义规则 CRUD。 */
export default function RuleLibraryPanel() {
  const metricsQ = useMetrics()
  const rulesQ = useRules()
  const [form, setForm] = useState<FormState>(null)

  const groups = useMemo(() => {
    const byCat: Record<MetricCategory, BuiltInMetric[]> = {
      completeness: [],
      uniqueness: [],
      validity: [],
      consistency: [],
      distribution: [],
    }
    for (const m of metricsQ.data ?? []) byCat[m.category].push(m)
    return byCat
  }, [metricsQ.data])

  return (
    <div className="space-y-6">
      {/* F-RL-01/02：内置指标目录（只读，按分类分组） */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">内置指标目录</h2>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          10 个常见质量指标，按分类分组，只读。模板渲染在「脚本生成」中选用。
        </p>
        {metricsQ.isLoading ? (
          <Skeleton lines={3} className="mt-3" />
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {(Object.keys(groups) as MetricCategory[]).map((cat) => (
              <div
                key={cat}
                className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
              >
                <div className="mb-2 text-xs font-medium text-blue-600 dark:text-blue-400">
                  {METRIC_CATEGORY_LABELS[cat]}
                </div>
                <ul className="space-y-1.5">
                  {groups[cat].map((m) => (
                    <li key={m.id} className="flex items-start gap-2 text-xs">
                      <span className="font-mono text-gray-700 dark:text-gray-200">{m.id}</span>
                      <span className="text-gray-500 dark:text-gray-400">{m.name}</span>
                      {m.needsColumn && (
                        <span className="rounded bg-gray-100 px-1 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                          需列
                        </span>
                      )}
                      {m.needsParam && (
                        <span className="rounded bg-amber-100 px-1 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                          需参数
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* F-RL-03~08：自定义规则 CRUD */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">自定义规则</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              保存跨会话共享；示例 SQL 须含 {`{table}`} 占位符且为只读 SELECT。
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <RuleImportButton />
            <RuleExportButton />
            {!form && (
              <button
                type="button"
                onClick={() => setForm({ mode: 'create' })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                新建规则
              </button>
            )}
          </div>
        </div>

        {form && (
          <div className="mt-3">
            <CustomRuleForm
              key={form.mode === 'edit' ? form.rule.id : 'create'}
              editing={form.mode === 'edit' ? form.rule : undefined}
              onDone={() => setForm(null)}
            />
          </div>
        )}

        <div className="mt-3">
          {rulesQ.isLoading ? (
            <Skeleton lines={3} />
          ) : rulesQ.isError ? (
            <EmptyState title="加载失败" description="无法获取规则列表" />
          ) : (rulesQ.data ?? []).length === 0 ? (
            <EmptyState
              title="暂无自定义规则"
              description="点击「新建规则」配置一个探查规则"
              actionLabel="新建规则"
              onAction={() => setForm({ mode: 'create' })}
            />
          ) : (
            <ul className="space-y-2">
              {(rulesQ.data ?? []).map((r) => (
                <CustomRuleItem
                  key={r.id}
                  rule={r}
                  onEdit={() => setForm({ mode: 'edit', rule: r })}
                />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}

/** 单条自定义规则（F-RL-03）。name + 方言徽标 + 编辑/删除（F-RL-07 二次确认）。 */
function CustomRuleItem({ rule, onEdit }: { rule: CustomRule; onEdit: () => void }) {
  const delMut = useDeleteRuleMutation()

  const handleDelete = () => {
    if (!window.confirm(`确定删除规则「${rule.name}」？此操作不可撤销`)) return
    delMut.mutate(rule.id, {
      onSuccess: () => toast.success('已删除'),
      onError: (e: ApiError) => toast.error(e.message || '删除失败'),
    })
  }

  return (
    <li className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
            {rule.name}
          </span>
          <DialectBadge
            name={PROFILE_DIALECTS[rule.dialect].name}
            color={PROFILE_DIALECTS[rule.dialect].color}
          />
          {rule.needsColumn && (
            <span className="rounded bg-gray-100 px-1 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              需列
            </span>
          )}
        </div>
        {rule.description && (
          <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
            {rule.description}
          </p>
        )}
        <pre className="mt-1 overflow-x-auto rounded bg-gray-50 p-2 font-mono text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-200">
          {rule.exampleSql}
        </pre>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onEdit}
          title="编辑"
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={delMut.isPending}
          title="删除"
          className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  )
}

/** 新建/编辑表单（F-RL-03/04）。实时校验 {table} 占位符。 */
function CustomRuleForm({
  editing,
  onDone,
}: {
  editing?: CustomRule
  onDone: () => void
}) {
  const createMut = useCreateRuleMutation()
  const updateMut = useUpdateRuleMutation()
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [dialect, setDialect] = useState<ProfileDialect>(editing?.dialect ?? 'mysql')
  const [exampleSql, setExampleSql] = useState(
    editing?.exampleSql ?? 'SELECT COUNT(*) FROM {table} WHERE {column} IS NULL',
  )

  const hasTablePlaceholder = exampleSql.includes('{table}')
  const canSubmit = name.trim() && exampleSql.trim() && hasTablePlaceholder

  const submit = () => {
    if (!canSubmit) return
    const req: CustomRuleInput = {
      name: name.trim(),
      description: description.trim(),
      exampleSql,
      dialect,
    }
    const handlers = {
      onSuccess: () => {
        toast.success(editing ? '已更新' : '已保存')
        onDone()
      },
      onError: (e: ApiError) => {
        // 后端 422 校验失败：message 含原因（路由 fail data.reasons）
        toast.error(e.message || '保存失败')
      },
    }
    if (editing) {
      updateMut.mutate({ id: editing.id, req }, handlers)
    } else {
      createMut.mutate(req, handlers)
    }
  }

  // Ctrl/Cmd+S 保存规则（PRD §7.4）：表单内聚焦时触发，拦截浏览器默认「保存网页」。
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      submit()
    }
  }

  const pending = createMut.isPending || updateMut.isPending

  return (
    <div
      onKeyDown={onKeyDown}
      className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3 dark:border-blue-800 dark:bg-blue-900/10"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="名称">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="规则名称"
            className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </Field>
        <Field label="方言">
          <select
            value={dialect}
            onChange={(e) => setDialect(e.target.value as ProfileDialect)}
            className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          >
            {DIALECTS.map((d) => (
              <option key={d} value={d}>
                {PROFILE_DIALECTS[d].name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="描述">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="规则用途说明（喂给 LLM）"
          className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
      </Field>

      <Field label="示例 SQL" hint="须含 {table}；需列时用 {column}，且必须为只读 SELECT">
        <textarea
          value={exampleSql}
          onChange={(e) => setExampleSql(e.target.value)}
          rows={4}
          spellCheck={false}
          className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 font-mono text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        {!hasTablePlaceholder && exampleSql.trim() && (
          <p className="mt-1 text-xs text-red-600">示例 SQL 必须包含 {`{table}`} 占位符</p>
        )}
      </Field>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          取消
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || pending}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {pending ? '保存中…' : editing ? '保存' : '创建'}
          {!pending && <kbd className="ml-1.5 rounded bg-blue-500/40 px-1 text-xs">Ctrl+S</kbd>}
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
        {label}
        {hint && <span className="ml-1 font-normal text-gray-400">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

/** F-RL-08：导出全部规则为 .json 文件。 */
function RuleExportButton() {
  const [loading, setLoading] = useState(false)
  const handle = async () => {
    setLoading(true)
    try {
      const payload = await exportRules()
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8',
      })
      const d = new Date()
      const p = (n: number) => String(n).padStart(2, '0')
      downloadFile(blob, `profile-rules-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`)
      toast.success(`已导出 ${payload.rules.length} 条规则`)
    } catch (e) {
      toast.error((e as Error).message || '导出失败')
    } finally {
      setLoading(false)
    }
  }
  return (
    <button
      type="button"
      onClick={handle}
      disabled={loading}
      className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
    >
      <Download className="h-3.5 w-3.5" />
      导出
    </button>
  )
}

/** F-RL-08：导入规则集 JSON（upsert by id）。 */
function RuleImportButton() {
  const inputRef = useRef<HTMLInputElement>(null)
  const importMut = useImportRulesMutation()
  const [loading, setLoading] = useState(false)

  const handleFile = async (file: File) => {
    setLoading(true)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const rules = Array.isArray(parsed?.rules) ? parsed.rules : parsed
      if (!Array.isArray(rules)) throw new Error('文件格式不正确')
      const result = await importMut.mutateAsync({ rules })
      toast.success(`导入完成：新增 ${result.created}，更新 ${result.updated}，跳过 ${result.skipped}`)
    } catch (e) {
      toast.error((e as Error).message || '导入失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = '' // 允许重复选同一文件
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <Upload className="h-3.5 w-3.5" />
        导入
      </button>
    </>
  )
}
