import { useCallback, useMemo, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { LineageAnalysisResult, LineageDependency, LineageTableNode, TableType } from '@/types/lineage'

interface Props {
  result: LineageAnalysisResult
}

interface LineageNodeData extends Record<string, unknown> {
  label: string
  tableType: TableType
  database?: string | null
  schema?: string | null
  alias?: string | null
}

const typeClass: Record<TableType, string> = {
  entity: 'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-200',
  temporary: 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
  unknown: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
}

const typeLabel: Record<TableType, string> = {
  entity: '实体表',
  temporary: '临时表 / CTE',
  unknown: '未知表',
}

function buildLevels(tables: LineageTableNode[], deps: LineageDependency[]): Map<string, number> {
  const incoming = new Map<string, string[]>()
  for (const table of tables) incoming.set(table.id, [])
  for (const dep of deps) {
    incoming.set(dep.target, [...(incoming.get(dep.target) ?? []), dep.source])
    if (!incoming.has(dep.source)) incoming.set(dep.source, [])
  }

  const memo = new Map<string, number>()
  const visit = (id: string, seen = new Set<string>()): number => {
    if (memo.has(id)) return memo.get(id) ?? 0
    if (seen.has(id)) return 0
    const parents = incoming.get(id) ?? []
    if (parents.length === 0) {
      memo.set(id, 0)
      return 0
    }
    const nextSeen = new Set(seen).add(id)
    const level = Math.max(...parents.map((parent) => visit(parent, nextSeen))) + 1
    memo.set(id, level)
    return level
  }
  for (const table of tables) visit(table.id)
  return memo
}

function toFlowElements(result: LineageAnalysisResult): { nodes: Node<LineageNodeData>[]; edges: Edge[] } {
  const levels = buildLevels(result.tables, result.dependencies)
  const grouped = new Map<number, LineageTableNode[]>()
  for (const table of result.tables) {
    const level = levels.get(table.id) ?? 0
    grouped.set(level, [...(grouped.get(level) ?? []), table])
  }

  const nodes: Node<LineageNodeData>[] = []
  const colWidth = 280
  const rowHeight = 100
  for (const [level, tables] of grouped) {
    const sorted = [...tables].sort((a, b) => a.name.localeCompare(b.name))
    sorted.forEach((table, row) => {
      nodes.push({
        id: table.id,
        type: 'lineageTableNode',
        position: { x: level * colWidth, y: row * rowHeight },
        data: {
          label: table.name,
          tableType: table.type,
          database: table.database,
          schema: table.schema,
          alias: table.alias,
        },
      })
    })
  }

  const edges = result.dependencies.map<Edge>((dep) => ({
    id: dep.id,
    source: dep.source,
    target: dep.target,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
    label: dep.kind === 'unknown' ? undefined : dep.kind,
    data: {
      kind: dep.kind,
      description: dep.description,
      confidence: dep.confidence,
    },
    style: { stroke: '#64748b', strokeWidth: 1.5 },
  }))

  return { nodes, edges }
}

function LineageTableNodeView({ data, selected }: NodeProps<Node<LineageNodeData>>) {
  const title = [data.label, data.alias ? `alias: ${data.alias}` : null, data.schema ? `schema: ${data.schema}` : null]
    .filter(Boolean)
    .join('\n')
  return (
    <div
      title={title}
      className={
        `w-[190px] rounded-xl border px-3 py-2 shadow-sm transition-shadow ${typeClass[data.tableType]} ` +
        (selected ? 'ring-2 ring-teal-400 ring-offset-2 dark:ring-offset-gray-950' : '')
      }
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-gray-400 !bg-white" />
      <div className="truncate text-sm font-semibold">{data.label}</div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs opacity-75">
        <span>{data.tableType}</span>
        {data.alias && <span className="truncate">alias: {data.alias}</span>}
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-gray-400 !bg-white" />
    </div>
  )
}

function GraphLegend() {
  return (
    <div className="flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
      <span>箭头表示数据流向：源表 → 目标表</span>
      {(['entity', 'temporary', 'unknown'] as const).map((type) => (
        <span key={type} className={`rounded-full border px-2 py-0.5 ${typeClass[type]}`}>
          {typeLabel[type]}
        </span>
      ))}
    </div>
  )
}

const nodeTypes = { lineageTableNode: LineageTableNodeView }
const BIG_GRAPH_NODE_THRESHOLD = 30
const BIG_GRAPH_EDGE_THRESHOLD = 40

/** F-GR-01 ~ F-GR-09：React Flow 表级血缘图谱（source → target 数据流向）。 */
export default function LineageGraph({ result }: Props) {
  const { nodes, edges } = useMemo(() => toFlowElements(result), [result])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const bigGraph = result.tables.length > BIG_GRAPH_NODE_THRESHOLD || result.dependencies.length > BIG_GRAPH_EDGE_THRESHOLD

  const highlightedIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>()
    const ids = new Set([selectedNodeId])
    for (const dep of result.dependencies) {
      if (dep.source === selectedNodeId) ids.add(dep.target)
      if (dep.target === selectedNodeId) ids.add(dep.source)
    }
    return ids
  }, [result.dependencies, selectedNodeId])

  const graphNodes = useMemo(() => {
    if (!selectedNodeId) return nodes
    return nodes.map((node) => ({
      ...node,
      className: highlightedIds.has(node.id) ? '' : 'opacity-35',
    }))
  }, [highlightedIds, nodes, selectedNodeId])

  const graphEdges = useMemo(() => {
    if (!selectedNodeId) return edges
    return edges.map((edge) => {
      const highlighted = edge.source === selectedNodeId || edge.target === selectedNodeId
      return {
        ...edge,
        animated: highlighted,
        style: { stroke: highlighted ? '#0d9488' : '#cbd5e1', strokeWidth: highlighted ? 2.5 : 1 },
        markerEnd: { type: MarkerType.ArrowClosed, color: highlighted ? '#0d9488' : '#cbd5e1' },
      }
    })
  }, [edges, selectedNodeId])

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNodeId((current) => (current === node.id ? null : node.id))
  }, [])

  if (result.tables.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">
        暂无可展示的表节点。
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {bigGraph && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          图谱较大，建议配合表格清单查看。
        </div>
      )}
      {selectedNodeId && (
        <div className="rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-xs text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300">
          已高亮选中节点的直接上游和下游；再次点击节点或画布可取消。
        </div>
      )}
      <div className="h-[520px] overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
        <ReactFlow
          nodes={graphNodes}
          edges={graphEdges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          onNodeClick={handleNodeClick}
          onPaneClick={() => setSelectedNodeId(null)}
          nodesDraggable
          panOnDrag
          zoomOnScroll
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#cbd5e1" gap={18} />
          <Controls showInteractive={false} />
          {bigGraph && <MiniMap pannable zoomable nodeStrokeWidth={3} />}
        </ReactFlow>
      </div>
      <GraphLegend />
    </div>
  )
}
