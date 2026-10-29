import { Link } from 'react-router'
import { ArrowLeft, Boxes } from 'lucide-react'

/** 数据建模平台挂载点：与 API 同源。dev 下 VITE_API_BASE 为 /api，得到 /modeling/
 *  （由 Vite 代理到后端）；生产下取 VITE_API_BASE 的宿主部分，指向后端服务。 */
const MODELING_URL = `${(import.meta.env.VITE_API_BASE ?? '/api').replace(/\/api\/?$/, '')}/modeling/`

/** 数据建模平台入口：该平台作为后端子应用挂在 /modeling 下，此处以全屏 iframe 呈现。
 *  顶部细栏只保留「返回」出路——iframe 内是建模平台自己的深色控制台布局（自带侧栏导航），
 *  因此本路由不走 Layout，也不套 max-w-7xl 内容容器。 */
export default function ModelingPage() {
  return (
    <div className="flex h-screen flex-col bg-paper">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </Link>
        <span className="h-4 w-px bg-line" aria-hidden />
        <Boxes className="h-4 w-4 text-accent" />
        <span className="font-display text-sm font-semibold text-ink">数据建模平台</span>
      </div>

      <iframe src={MODELING_URL} title="数据建模平台" className="w-full flex-1 border-0" />
    </div>
  )
}
