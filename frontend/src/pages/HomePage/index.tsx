import { BarChart3, BookOpen, Database, GitBranch, MessageSquareCode, ScanSearch, Sparkles } from 'lucide-react'
import FeatureCard from './FeatureCard'
import Highlight from '@/components/shared/Highlight'

/** 每张卡片在 flex 布局下的宽度：
 *  - 移动端单列满宽
 *  - md：两列（50% 减去 gap-6 的一半 0.75rem）
 *  - lg：三列（33.33% 减去 gap-6 一份 1rem），6 卡 = 3+3，两行均满 */
const cardWidth = 'w-full md:w-[calc(50%_-_0.75rem)] lg:w-[calc(33.333333%_-_1rem)]'

/** 工具入口清单：identity 色仅作图标标签层，界面交互层统一归琥珀 */
const TOOLS = [
  {
    icon: Database,
    title: 'SQL 函数可视化学习',
    description: '通过动画直观理解 7 种主流 SQL 方言中各函数的执行过程，从入门到精通。',
    to: '/sql',
    accent: '#00758F',
  },
  {
    icon: Sparkles,
    title: '测试数据集工具',
    description: '用自然语言或自定义字段一键生成 Excel / JSON / CSV 测试数据，告别假数据手搓。',
    to: '/datatest',
    accent: '#7C3AED',
  },
  {
    icon: GitBranch,
    title: 'SQL 血缘分析',
    description: '粘贴或上传 SQL / HQL 脚本，生成表级血缘图谱、依赖清单与治理导出。',
    to: '/lineage',
    accent: '#0D9488',
  },
  {
    icon: BarChart3,
    title: 'BI 报表工具',
    description: '上传 Excel / CSV，自助建模生成大屏图表，支持上下钻、卡片联动与图片 / 数据 / 配置导出。',
    to: '/bi',
    accent: '#EA580C',
  },
  {
    icon: ScanSearch,
    title: '数据探查',
    description: '连接 MySQL / Hive / PostgreSQL 数据源，只读查询预览，一键生成数据质量探查脚本。',
    to: '/dataprofile',
    accent: '#2563EB',
  },
  {
    icon: MessageSquareCode,
    title: 'RAG 自然语言转 SQL',
    description: '上传建表语句与规范文档构建知识库，自然语言提问即可生成对齐业务模型的 SQL。',
    to: '/rag-sql',
    accent: '#16A34A',
  },
  {
    icon: BookOpen,
    title: '知识库问答',
    description: '与知识库对话：检索规范文档与表元数据，流式生成附带引用来源的专业回答。',
    to: '/kbqa',
    accent: '#DC2626',
  },
] as const

/** 首页（旗舰）：数据工作台定位，琥珀荧光标记关键词，7 工具扁平入口（lg 三列 3+3+1）。 */
export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="mb-12 pt-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          SQL 工具集
        </div>
        <h1 className="mt-5 max-w-3xl font-display text-4xl font-semibold leading-tight text-ink sm:text-5xl">
          为数据人打造的 <Highlight>SQL</Highlight> 工具箱
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-2 sm:text-base">
          学函数、做数据、查血缘、出报表、探质量、问自然语言、对话知识库——七个工具，一站衔接。
        </p>
      </section>

      {/* 工具入口 */}
      <section>
        <div className="mb-5 flex items-baseline gap-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-mute">
            工具
          </h2>
          <span className="text-xs text-mute/70">{TOOLS.length.toString().padStart(2, '0')}</span>
        </div>

        <div className="flex flex-wrap justify-center gap-6">
          {TOOLS.map((t) => (
            <FeatureCard
              key={t.to}
              className={cardWidth}
              icon={t.icon}
              title={t.title}
              description={t.description}
              to={t.to}
              accent={t.accent}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
