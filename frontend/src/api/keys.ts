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
}
