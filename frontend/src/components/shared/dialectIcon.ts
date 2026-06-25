import { Database, Boxes, Share2, type LucideIcon } from 'lucide-react'

/** 方言 icon 字段 → Lucide 通用图标映射（无品牌 logo，零新增依赖） */
const ICON_MAP: Record<string, LucideIcon> = {
  mysql: Database,
  postgresql: Database,
  hive: Boxes,
  spark: Boxes,
  flink: Boxes,
  impala: Boxes,
  neo4j: Share2,
}

export function getDialectIcon(icon: string): LucideIcon {
  return ICON_MAP[icon] ?? Database
}
