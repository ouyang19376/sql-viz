import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ApiError } from '@/types'
import {
  DEFAULT_PORT,
  PROFILE_DIALECTS,
  TEST_ERROR_LABELS,
} from '@/types/dataprofile'
import type { DataSourceConfig, ProfileDialect, TestResult } from '@/types/dataprofile'
import {
  useEditSourceMutation,
  useRegisterSourceMutation,
  useTestSourceMutation,
} from '@/api/dataprofile'

interface Props {
  editingId?: string
  initial?: Partial<DataSourceConfig>
  onDone: () => void
}

const DIALECTS: ProfileDialect[] = ['mysql', 'postgresql', 'hive']

/** 数据源配置表单（F-DS-01）：新建 / 编辑。
 *  password write-only（F-DS-08）：编辑时留空=不改（F-DS-06）。 */
export default function DataSourceForm({ editingId, initial, onDone }: Props) {
  const isEdit = !!editingId
  const [name, setName] = useState(initial?.name ?? '')
  const [dialect, setDialect] = useState<ProfileDialect>(initial?.dialect ?? 'mysql')
  const [host, setHost] = useState(initial?.host ?? '127.0.0.1')
  const [portStr, setPortStr] = useState(String(initial?.port ?? 3306))
  const [database, setDatabase] = useState(initial?.database ?? '')
  const [username, setUsername] = useState(initial?.username ?? 'root')
  const [password, setPassword] = useState('')

  const port = Number(portStr)
  const portValid = portStr !== '' && port >= 1 && port <= 65535
  const baseValid = name.trim() && host.trim() && username.trim() && portValid
  const canTest = !!baseValid && password.length > 0
  const canSave = isEdit ? !!baseValid : !!baseValid && password.length > 0

  const testMut = useTestSourceMutation()
  const regMut = useRegisterSourceMutation()
  const editMut = useEditSourceMutation()
  const saving = regMut.isPending || editMut.isPending

  const buildConfig = (): DataSourceConfig => ({
    name: name.trim(),
    dialect,
    host: host.trim(),
    port,
    database: database.trim() || undefined,
    username: username.trim(),
    password,
  })

  const handleTest = () => {
    if (!canTest) {
      toast.error('请填写完整（含密码）后再测试')
      return
    }
    testMut.mutate(buildConfig(), {
      onSuccess: (r: TestResult) => {
        if (r.ok) toast.success(`连接成功${r.version ? ` · ${r.version}` : ''}`)
        else toast.error(TEST_ERROR_LABELS[r.errorType ?? 'driver_error'] ?? r.message ?? '连接失败')
      },
      onError: (e: ApiError) => toast.error(e.message),
    })
  }

  const handleSave = () => {
    if (!canSave) {
      toast.error('请填写必填项')
      return
    }
    const cfg = buildConfig()
    const onOk = () => {
      toast.success(isEdit ? '已更新' : '已连接')
      onDone()
    }
    const onErr = (e: ApiError) => toast.error(e.message)
    if (isEdit) editMut.mutate({ id: editingId!, req: cfg }, { onSuccess: onOk, onError: onErr })
    else regMut.mutate(cfg, { onSuccess: onOk, onError: onErr })
  }

  const onDialect = (d: ProfileDialect) => {
    setDialect(d)
    setPortStr(String(DEFAULT_PORT[d]))
  }

  const inputCls =
    'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'
  const labelCls = 'mb-1 block text-xs font-medium text-ink-2'

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <h3 className="mb-4 text-sm font-semibold text-ink">
        {isEdit ? '编辑数据源' : '新建数据源'}
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls}>名称 *</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="如：local-mysql" />
        </div>
        <div>
          <label className={labelCls}>方言 *</label>
          <select className={inputCls} value={dialect} onChange={(e) => onDialect(e.target.value as ProfileDialect)} disabled={isEdit}>
            {DIALECTS.map((d) => (
              <option key={d} value={d}>{PROFILE_DIALECTS[d].name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>端口 *</label>
          <input className={inputCls} type="number" value={portStr} onChange={(e) => setPortStr(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>主机 *</label>
          <input className={inputCls} value={host} onChange={(e) => setHost(e.target.value)} placeholder="127.0.0.1" />
        </div>
        <div>
          <label className={labelCls}>数据库</label>
          <input className={inputCls} value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="（Hive 可空）" />
        </div>
        <div>
          <label className={labelCls}>用户名 *</label>
          <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>密码 {isEdit ? '（不变更请留空）' : '*'}</label>
          <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isEdit ? '不变更请留空' : ''} autoComplete="new-password" />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={handleTest}
          disabled={!canTest || testMut.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {testMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          测试连接
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? '保存' : '连接并保存'}
        </button>
        <button type="button" onClick={onDone} className="rounded-lg px-3 py-2 text-sm text-mute hover:text-ink-2">
          取消
        </button>
      </div>
    </div>
  )
}
