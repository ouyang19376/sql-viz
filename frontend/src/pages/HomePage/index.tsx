import { Database, GitBranch, Sparkles } from 'lucide-react'
import FeatureCard from './FeatureCard'

/** 首页（F-HM-01 / F-HM-02 / F-HM-03）：功能入口大卡片 */
export default function HomePage() {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-gray-900">欢迎使用</h1>
      <p className="mb-8 text-gray-500">选择一个工具开始你的工作</p>

      <div className="grid gap-6 md:grid-cols-3">
        <FeatureCard
          icon={Database}
          title="SQL 函数可视化学习"
          description="通过动画直观理解 7 种主流 SQL 方言中各函数的执行过程，从入门到精通。"
          to="/sql"
          accent="#00758F"
        />
        <FeatureCard
          icon={Sparkles}
          title="测试数据集工具"
          description="用自然语言或自定义字段一键生成 Excel / JSON / CSV 测试数据，告别假数据手搓。"
          to="/datatest"
          accent="#7C3AED"
        />
        <FeatureCard
          icon={GitBranch}
          title="SQL 血缘分析"
          description="粘贴或上传 SQL / HQL 脚本，生成表级血缘图谱、依赖清单与治理导出。"
          to="/lineage"
          accent="#0D9488"
        />
      </div>
    </div>
  )
}
