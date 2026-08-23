import type {
  ApiError,
  AuthResponse,
  Category,
  CategoryCreate,
  CategoryUpdate,
  Complaint,
  ComplaintQuery,
  DashboardSummary,
  HistoryEntry,
  HistoryResponse,
  Notice,
  NoticeCreate,
  NoticeUpdate,
  Page,
  Priority,
  Settings,
  Status,
  User,
} from '@/lib/types'

export type { Status, Priority, Complaint, ApiError, User, Notice, Page, Settings } from '@/lib/types'

const baseUrl = () => `${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000'}/api/v1`

export const getToken = () =>
  typeof window === 'undefined' ? undefined : (localStorage.getItem('residency.token') ?? undefined)

async function parseError(response: Response): Promise<ApiError> {
  let body: { detail?: string; code?: string; errors?: { loc?: Array<string | number>; msg?: string }[] } = {}
  try {
    body = await response.json()
  } catch {
  }
  const fieldErrors = body.errors?.reduce<Record<string, string>>((acc, e) => {
    const field = e.loc?.at(-1)
    if (field) acc[String(field)] = e.msg ?? 'Invalid value'
    return acc
  }, {})
  if (response.status === 401 && typeof window !== 'undefined') {
    localStorage.removeItem('residency.token')
    localStorage.removeItem('residency.user')
    const path = window.location.pathname
    if (path !== '/login' && path !== '/register') window.location.assign('/login')
  }
  return {
    status: response.status,
    code: body.code,
    detail: body.detail ?? 'Something went wrong. Please try again.',
    fieldErrors,
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${baseUrl()}${path}`, { ...init, headers })
  if (!response.ok) throw await parseError(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export async function apiRequestBlob(path: string, token: string): Promise<Blob> {
  const response = await fetch(`${baseUrl()}${path}`, {
    headers: { Accept: 'image/*', Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw await parseError(response)
  return response.blob()
}

export function buildComplaintQuery(params: ComplaintQuery): string {
  const q = new URLSearchParams()
  if (params.limit !== undefined) q.set('limit', String(params.limit))
  if (params.offset !== undefined) q.set('offset', String(params.offset))
  if (params.category_id) q.set('category_id', params.category_id)
  if (params.status) q.set('status', params.status)
  if (params.priority) q.set('priority', params.priority)
  if (params.date_from) q.set('date_from', params.date_from)
  if (params.date_to) q.set('date_to', params.date_to)
  if (params.overdue !== undefined) q.set('overdue', String(params.overdue))
  if (params.sort) q.set('sort', params.sort)
  const str = q.toString()
  return str ? `?${str}` : ''
}

export function buildNoticeQuery(params: { limit?: number; offset?: number }): string {
  const q = new URLSearchParams()
  if (params.limit !== undefined) q.set('limit', String(params.limit))
  if (params.offset !== undefined) q.set('offset', String(params.offset))
  const str = q.toString()
  return str ? `?${str}` : ''
}

export const api = {
  login: (body: { email: string; password: string }) =>
    apiRequest<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  register: (body: { name: string; email: string; password: string }) =>
    apiRequest<User>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  me: (token: string) => apiRequest<User>('/auth/me', {}, token),
  profile: (token: string, name: string) =>
    apiRequest<User>('/users/me', { method: 'PATCH', body: JSON.stringify({ name }) }, token),

  complaints: (token: string, query = '') => apiRequest<Page<Complaint>>(`/complaints${query}`, {}, token),
  complaint: (token: string, id: string) => apiRequest<Complaint>(`/complaints/${id}`, {}, token),
  history: (token: string, id: string) => apiRequest<HistoryResponse>(`/complaints/${id}/history`, {}, token),
  createComplaint: (token: string, form: FormData) =>
    apiRequest<Complaint>('/complaints', { method: 'POST', body: form }, token),
  updateStatus: (token: string, id: string, body: { status: Status; note?: string }) =>
    apiRequest<Complaint>(`/complaints/${id}/status`, { method: 'PATCH', body: JSON.stringify(body) }, token),
  updatePriority: (token: string, id: string, priority: Priority) =>
    apiRequest<Complaint>(`/complaints/${id}/priority`, { method: 'PATCH', body: JSON.stringify({ priority }) }, token),
  addNote: (token: string, id: string, note: string) =>
    apiRequest<HistoryEntry>(`/complaints/${id}/notes`, { method: 'POST', body: JSON.stringify({ note }) }, token),
  photo: (token: string, id: string) => apiRequestBlob(`/complaints/${id}/photo`, token),

  categories: (token: string) => apiRequest<Category[]>('/categories', {}, token),
  createCategory: (token: string, body: CategoryCreate) =>
    apiRequest<Category>('/categories', { method: 'POST', body: JSON.stringify(body) }, token),
  updateCategory: (token: string, id: string, body: CategoryUpdate) =>
    apiRequest<Category>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),
  deleteCategory: (token: string, id: string) =>
    apiRequest<{ message: string }>(`/categories/${id}`, { method: 'DELETE' }, token),

  notices: (token: string, query = '') => apiRequest<Page<Notice>>(`/notices${query}`, {}, token),
  createNotice: (token: string, body: NoticeCreate) =>
    apiRequest<Notice>('/notices', { method: 'POST', body: JSON.stringify(body) }, token),
  updateNotice: (token: string, id: string, body: NoticeUpdate) =>
    apiRequest<Notice>(`/notices/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),
  deleteNotice: (token: string, id: string) =>
    apiRequest<{ message: string }>(`/notices/${id}`, { method: 'DELETE' }, token),

  dashboard: (token: string) => apiRequest<DashboardSummary>('/dashboard/summary', {}, token),
  settings: (token: string) => apiRequest<Settings>('/admin/settings', {}, token),
  updateSettings: (token: string, days: number) =>
    apiRequest<Settings>(
      '/admin/settings/overdue-threshold',
      { method: 'PATCH', body: JSON.stringify({ overdue_threshold_days: days }) },
      token,
    ),
}

export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'detail' in error && typeof (error as ApiError).detail === 'string') {
    return (error as ApiError).detail
  }
  return 'Unable to complete request.'
}

export function isApiError(error: unknown): error is ApiError {
  return typeof error === 'object' && error !== null && 'status' in error
}