/** TanStack Query key 工厂 */
export const queryKeys = {
  dialects: {
    all: ['dialects'] as const,
    detail: (id: string) => ['dialects', id] as const,
  },
  functions: {
    detail: (dialectId: string, functionId: string) =>
      ['functions', dialectId, functionId] as const,
    compatible: (functionId: string) =>
      ['functions', functionId, 'compatible'] as const,
  },
  search: {
    byQuery: (q: string, dialectId?: string) =>
      ['search', q, dialectId ?? null] as const,
  },
  dataprofile: {
    sources: ['dataprofile', 'sources'] as const,
    schemas: (dsId: string) => ['dataprofile', 'schemas', dsId] as const,
    tables: (dsId: string, schema?: string) =>
      ['dataprofile', 'tables', dsId, schema ?? null] as const,
    columns: (dsId: string, table: string, schema?: string) =>
      ['dataprofile', 'columns', dsId, table, schema ?? null] as const,
    metrics: ['dataprofile', 'metrics'] as const,
    rules: ['dataprofile', 'rules'] as const,
  },
}
