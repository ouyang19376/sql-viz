import { BarChart3, Database, GitBranch, ScanSearch, Sparkles } from 'lucide-react'
import FeatureCard from './FeatureCard'

/** 每张卡片在 flex 布局下的宽度：
 *  - 移动端单列满宽
 *  - md：两列（50% 减去 gap-6 的一半 0.75rem）
 *  - lg：三列（33.33% 减去 gap-6 一份 1rem），5 卡 = 3+2，第二行由 justify-center 居中 */
const cardWidth = 'w-full md:w-[calc(50%_-_0.75rem)] lg:w-[calc(33.333333%_-_1rem)]'

/** 首页（F-HM-01 / F-HM-02 / F-HM-03）：功能入口大卡片 */
export default function HomePage() {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-gray-900">欢迎使用</h1>
      <p className="mb-8 text-gray-500">选择一个工具开始你的工作</p>

      <div className="flex flex-wrap justify-center gap-6">
        <FeatureCard
          className={cardWidth}
          icon={Database}
          title="SQL 函数可视化学习"
          description="通过动画直观理解 7 种主流 SQL 方言中各函数的执行过程，从入门到精通。"
          to="/sql"
          accent="#00758F"
        />
        <FeatureCard
          className={cardWidth}
          icon={Sparkles}
          title="测试数据集工具"
          description="用自然语言或自定义字段一键生成 Excel / JSON / CSV 测试数据，告别假数据手搓。"
          to="/datatest"
          accent="#7C3AED"
        />
        <FeatureCard
          className={cardWidth}
          icon={GitBranch}
          title="SQL 血缘分析"
          description="粘贴或上传 SQL / HQL 脚本，生成表级血缘图谱、依赖清单与治理导出。"
          to="/lineage"
          accent="#0D9488"
        />
        <FeatureCard
          className={cardWidth}
          icon={BarChart3}
          title="BI 报表工具"
          description="上传 Excel / CSV，自助建模生成大屏图表，支持上下钻、卡片联动与图片 / 数据 / 配置导出。"
          to="/bi"
          accent="#EA580C"
        />
        <FeatureCard
          className={cardWidth}
          icon={ScanSearch}
          title="数据探查"
          description="连接 MySQL / Hive / PostgreSQL 数据源，只读查询预览，一键生成数据质量探查脚本。"
          to="/dataprofile"
          accent="#2563EB"
        />
      </div>
    </div>
  )
}
