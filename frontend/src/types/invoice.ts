import type { Action } from '@/types'

export type ProcessingStatus = 'QUEUED' | 'PROCESSING' | 'DONE' | 'FAILED'
export type Verdict = 'CLEAN' | 'EXCEPTION' | 'DUPLICATE' | 'NEEDS_REVIEW'
export type DecisionStatus = 'PENDING' | 'ESCALATED' | 'APPROVED' | 'REJECTED'

export interface InvoiceListItem {
  id: string
  batch_id: string
  invoice_number: string | null
  vendor_id: string | null
  vendor_name: string | null
  po_number: string | null
  invoice_date: string | null
  total_amount: number | null
  difference_amount: number | null
  processing_status: ProcessingStatus
  iteration: number | null
  verdict: Verdict | null
  confidence: number | null
  decision_status: DecisionStatus
  queue_owner: string | null
  review_reason: string | null
  allowed_actions: Action[]
  created_at: string
  processed_at: string | null
}

export interface PageMeta { page: number; page_size: number; total: number; total_pages: number }
export interface Paged<T> { data: T[]; meta: PageMeta }