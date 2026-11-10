import { api } from './client'
import type { Action } from '@/types'
import type { InvoiceListItem, Paged } from '@/types/invoice'
import type { InvoiceDetail } from '@/types/detail'

export interface InvoiceQuery {
  batch_id?: string
  queue?: 'mine'
  verdict?: string
  decision_status?: string
  vendor_id?: string
  q?: string
  sort?: string
  page?: number
  page_size?: number
}

export const getInvoices = (params: InvoiceQuery = {}) =>
  api.get<Paged<InvoiceListItem>>('/invoices', { params }).then((r) => r.data)

export const getInvoice = (id: string) =>
  api.get<InvoiceDetail>(`/invoices/${id}`).then((r) => r.data)

export const postDecision = (id: string, action: Action, reason: string) =>
  api.post<InvoiceDetail>(`/invoices/${id}/decision`, { action, reason }).then((r) => r.data)

export const retryInvoice = (id: string) => api.post(`/invoices/${id}/retry`).then((r) => r.data)