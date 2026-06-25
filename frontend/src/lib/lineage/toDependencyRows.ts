import type { LineageAnalysisResult, DependencyRow } from '@/types/lineage'

export function toDependencyRows(result: LineageAnalysisResult): DependencyRow[] {
  const tableMap = new Map(result.tables.map((table) => [table.id, table]))
  return result.dependencies.map((dep, index) => {
    const target = tableMap.get(dep.target)
    const source = tableMap.get(dep.source)
    return {
      index: index + 1,
      targetTable: target?.name ?? dep.target,
      targetType: target?.type ?? 'unknown',
      sourceTable: source?.name ?? dep.source,
      sourceType: source?.type ?? 'unknown',
      dependencyKind: dep.kind,
      statementIndex: dep.statementIndex,
      lineRange: dep.lineStart && dep.lineEnd ? `${dep.lineStart}-${dep.lineEnd}` : '--',
      description: dep.description,
      confidence: dep.confidence,
    }
  })
}

export function countTargets(result: LineageAnalysisResult): number {
  return new Set(result.dependencies.map((dep) => dep.target)).size
}

export function countSources(result: LineageAnalysisResult): number {
  return new Set(result.dependencies.map((dep) => dep.source)).size
}
