import { api } from './client'

export interface BatchRow {
  id: string
  name: string
  created_at: string
  created_by: string
  total: number
  completed: number
  status: 'PROCESSING' | 'DONE'
  counts: { clean: number; exception: number; duplicate: number; needs_review: number; failed: number; pending_decision: number }
}

export interface Summary {
  latest_batch: BatchRow
  my_queue_count: number
  needs_review_count?: number
  escalated_count?: number
  decided_today?: { approved: number; rejected: number }
  active_users_by_role?: Record<string, number>
  recent_batches: BatchRow[]
}

export const getSummary = () => api.get<Summary>('/dashboard/summary').then((r) => r.data)
export const getBatch = (id: string) => api.get<BatchRow>(`/batches/${id}`).then((r) => r.data)

export const getBatches = () =>
  api.get<{ data: BatchRow[] }>('/batches', { params: { page_size: 100 } }).then((r) => r.data.data)
