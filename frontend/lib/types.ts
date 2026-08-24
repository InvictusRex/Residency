export type Role = 'RESIDENT' | 'ADMIN'
export type Status = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH'
export type Sort = 'newest' | 'oldest' | 'priority' | 'triage' | 'overdue'

export type User = {
  id: string
  name: string
  email: string
  role: Role
  is_active: boolean
  created_at: string
  updated_at: string
}

export type AuthResponse = {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user: User
}

export type ResidentBrief = { id: string; name: string; email: string }
export type CategoryBrief = { id: string; name: string }

export type Category = {
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CategoryCreate = { name: string; description?: string | null }
export type CategoryUpdate = { name?: string | null; description?: string | null; is_active?: boolean | null }

export type Complaint = {
  id: string
  description: string
  photo_url: string | null
  priority: Priority
  status: Status
  created_at: string
  updated_at: string
  resolved_at: string | null
  resident: ResidentBrief
  category: CategoryBrief
}

export type ActorBrief = { id: string; name: string; role: Role }
export type HistoryEntry = { id: string; status: Status; note: string | null; actor: ActorBrief; created_at: string }
export type HistoryResponse = { complaint_id: string; items: HistoryEntry[] }

export type Page<T> = { total: number; limit: number; offset: number; items: T[] }

export type Notice = {
  id: string
  title: string
  content: string
  is_important: boolean
  created_by: { id: string; name: string }
  created_at: string
  updated_at: string
}
export type NoticeCreate = { title: string; content: string; is_important?: boolean }
export type NoticeUpdate = { title?: string; content?: string; is_important?: boolean }

export type StatusCounts = { OPEN: number; IN_PROGRESS: number; RESOLVED: number }
export type CategoryCount = { category_id: string; category_name: string; count: number }
export type DashboardSummary = {
  total_complaints: number
  by_status: StatusCounts
  by_category: CategoryCount[]
  overdue_count: number
}

export type Settings = { overdue_threshold_days: number }

export type ComplaintQuery = {
  limit?: number
  offset?: number
  category_id?: string
  status?: Status
  priority?: Priority
  date_from?: string
  date_to?: string
  overdue?: boolean
  sort?: Sort
}

export type ApiError = {
  status: number
  code?: string
  detail: string
  fieldErrors?: Record<string, string>
}