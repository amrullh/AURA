import { api } from './client'
import type { BatchRow } from './dashboard'
import type { PageMeta, Paged } from '@/types/invoice'
import type { Role, User } from '@/types'

export interface Settings {
  price_tolerance_pct: number
  confidence_threshold: number
  max_iterations: number
  manual_minutes_per_invoice: number
  updated_at: string
  updated_by: string
}
export interface Metrics {
  invoices_total: number
  avg_processing_seconds: number | null
  auto_clear_percent: number
  difference_caught_total: number
  escalation_rate_percent: number
  by_verdict: { clean: number; exception: number; duplicate: number; needs_review: number }
  by_vendor: { vendor_name: string; exception_count: number; difference_total: number }[]
  estimated_hours_saved: number | null
}
export interface AuditRow {
  id: string
  created_at: string
  actor: { type: 'USER' | 'AGENT'; id: string; name: string }
  action: string
  object_type: string
  object_id: string
  summary: string
  detail: Record<string, unknown> | null
}
export interface MasterTable {
  columns: { key: string; label: string }[]
  data: Record<string, unknown>[]
  meta: PageMeta
}
export interface UploadResult {
  batch: BatchRow
  accepted: { file_name: string; invoice_id: string }[]
  rejected: { file_name: string; reason: string }[]
}

export const getSettings = () => api.get<Settings>('/settings').then((r) => r.data)
export const putSettings = (b: { price_tolerance_pct: number; confidence_threshold: number; manual_minutes_per_invoice: number }) =>
  api.put<Settings>('/settings', b).then((r) => r.data)

export const getUsers = () => api.get<Paged<User>>('/users', { params: { page_size: 100 } }).then((r) => r.data)
export const createUser = (b: { name: string; email: string; role: Role; password: string }) =>
  api.post<User>('/users', b).then((r) => r.data)
export const patchUser = (id: string, b: Partial<{ role: Role; is_active: boolean }>) =>
  api.patch<User>(`/users/${id}`, b).then((r) => r.data)

export const getAudit = (params: Record<string, unknown> = {}) =>
  api.get<Paged<AuditRow>>('/audit-logs', { params: { page_size: 50, ...params } }).then((r) => r.data)

export const getMaster = (type: string) =>
  api.get<MasterTable>(`/master/${type}`, { params: { page_size: 100 } }).then((r) => r.data)

export const getMetrics = (params: { batch_id?: string; from?: string; to?: string } = {}) =>
  api.get<Metrics>('/reports/metrics', { params }).then((r) => r.data)

export function uploadBatch(files: File[], name: string, onProgress: (p: number) => void) {
  const f = new FormData()
  files.forEach((x) => f.append('files', x))
  if (name) f.append('name', name)
  return api
    .post<UploadResult>('/batches', f, { onUploadProgress: (e) => onProgress(e.total ? Math.round((e.loaded / e.total) * 100) : 0) })
    .then((r) => r.data)
}
export const sampleBatch = () => api.post<UploadResult>('/demo/sample-batch').then((r) => r.data)
export interface ImportResult {
  dry_run: boolean
  valid_rows: number
  invalid_rows: number
  preview?: Record<string, unknown>[]
  errors?: { row: number; reason: string }[]
}
export function importMaster(type: string, file: File, dryRun: boolean) {
  const f = new FormData()
  f.append('file', file)
  return api.post<ImportResult>(`/master/${type}/import`, f, { params: { dry_run: dryRun } }).then((r) => r.data)
}
