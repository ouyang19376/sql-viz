import type { AnimationStep, Operation, TableData } from '@/types/animation'
import type { RenderFn, RendererRegistry } from '../rendererTypes'
import { renderShowSource } from './showSource'
import { renderShowResult } from './showResult'
import { renderFilterRows } from './filterRows'
import { renderSortRows } from './sortRows'
import { renderGroupRows } from './groupRows'
import { renderSelectColumns } from './selectColumns'
import { renderTransformValues } from './transformValues'
import { renderAggregateValues } from './aggregateValues'
import { renderAddColumn } from './addColumn'
import { renderJoinTables } from './joinTables'

const map = new Map<Operation, RenderFn>([
  ['show_source', renderShowSource],
  ['show_result', renderShowResult],
  ['filter_rows', renderFilterRows],
  ['sort_rows', renderSortRows],
  ['group_rows', renderGroupRows],
  ['select_columns', renderSelectColumns],
  ['transform_values', renderTransformValues],
  ['aggregate_values', renderAggregateValues],
  ['add_column', renderAddColumn],
  ['join_tables', renderJoinTables],
])

/** 兜底渲染器：直接绘制结果表终态 */
const renderFallback: RenderFn = (engine, _progress, step) => {
  const table = getResultTable(step)
  if (table) engine.drawTable(table)
}

/** 取某步骤「终态结果表」，用于响应式降级 TableView 与 fallback 渲染 */
function getResultTable(step: AnimationStep): TableData | null {
  switch (step.operation) {
    case 'show_source':
      return step.table
    case 'show_result':
      return step.table
    case 'highlight_rows':
      return step.table ?? null
    case 'filter_rows': {
      const rows = step.kept_indices.map((i) => step.source_table.rows[i])
      return { ...step.source_table, rows }
    }
    case 'sort_rows': {
      const rows = step.order_mapping.map(
        (oldIdx) => step.source_table.rows[oldIdx],
      )
      return { ...step.source_table, rows }
    }
    case 'group_rows': {
      const rows = step.groups.map((g) => g.aggregated)
      const columns = step.groups[0]?.aggregated
        ? step.groups[0].aggregated.map((_, i) =>
            i === 0 ? step.group_column : 'value',
          )
        : [step.group_column]
      return { columns, rows }
    }
    case 'select_columns':
      return { columns: step.result_columns, rows: step.result_rows }
    case 'transform_values': {
      const rows = step.source_table.rows.map((row, r) => {
        const newRow = [...row]
        newRow[step.target_column] = step.after_values[r]
        return newRow
      })
      return { ...step.source_table, rows }
    }
    case 'aggregate_values':
      return step.result_table
    case 'add_column': {
      const { table, new_column, insert_index } = step
      const columns = [
        ...table.columns.slice(0, insert_index),
        new_column.name,
        ...table.columns.slice(insert_index),
      ]
      const rows = table.rows.map((row, r) => [
        ...row.slice(0, insert_index),
        new_column.values[r] ?? null,
        ...row.slice(insert_index),
      ])
      return { ...table, columns, rows }
    }
    case 'join_tables':
      return step.result_table
    default:
      return step.table ?? null
  }
}

export const renderers: RendererRegistry = {
  has: (op) => map.has(op),
  get: (op) => map.get(op) ?? renderFallback,
  getResultTable,
}

export { getResultTable }
