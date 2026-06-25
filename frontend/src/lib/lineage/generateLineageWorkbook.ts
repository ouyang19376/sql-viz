import type { LineageAnalysisResult } from '@/types/lineage'
import { toDependencyRows } from './toDependencyRows'

export interface LineageWorkbookSheet {
  name: string
  columns: string[]
  rows: unknown[][]
}

export function generateLineageWorkbook(result: LineageAnalysisResult): LineageWorkbookSheet[] {
  const dependencyRows = toDependencyRows(result)

  return [
    {
      name: '依赖清单',
      columns: ['序号', '目标表', '目标表类型', '源表', '源表类型', '依赖类型', '语句序号', '行号范围', '说明', '置信度'],
      rows: dependencyRows.map((row) => [
        row.index,
        row.targetTable,
        row.targetType,
        row.sourceTable,
        row.sourceType,
        row.dependencyKind,
        row.statementIndex ?? '',
        row.lineRange,
        row.description ?? '',
        row.confidence ?? '',
      ]),
    },
    {
      name: '表清单',
      columns: ['表名', '表类型', 'database', 'schema', 'alias', '出现语句'],
      rows: result.tables.map((table) => [
        table.name,
        table.type,
        table.database ?? '',
        table.schema ?? '',
        table.alias ?? '',
        table.statementIndexes.join(', '),
      ]),
    },
    {
      name: '解析摘要',
      columns: ['字段', '值'],
      rows: [
        ['summary', result.summary],
        ['dialect', result.dialect],
        ['warnings', result.warnings.join('\n')],
      ],
    },
  ]
}
