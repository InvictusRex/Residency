export const queryKeys = {
  complaints: (key?: string) => (key ? (['complaints', key] as const) : (['complaints'] as const)),
  complaint: (id: string) => ['complaint', id] as const,
  history: (id: string) => ['history', id] as const,
  categories: ['categories'] as const,
  notices: (key?: string) => (key ? (['notices', key] as const) : (['notices'] as const)),
  dashboard: ['dashboard'] as const,
  settings: ['settings'] as const,
  profile: ['profile'] as const,
}