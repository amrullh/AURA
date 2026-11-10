import type { Action } from '@/types'
import type { DecisionStatus, ProcessingStatus, Verdict } from './invoice'

export interface ExtractionField { key: string; label: string; value: string | number | null; confidence: number }
export interface Diff { type: 'PRICE' | 'QUANTITY' | 'ITEM'; expected: number | null; actual: number | null; delta: number; delta_pct?: number; within_tolerance: boolean }
export interface CompLine {
  line_no: number
  item_name: string
  po: { quantity: number; unit_price: number } | null
  grn: { quantity_received: number } | null
  invoice: { quantity: number; unit_price: number } | null
  status: 'MATCH' | 'MISMATCH'
  diffs: Diff[]
}
export interface Totals { po_total: number; grn_total_at_po_price: number; invoice_total: number; difference: number }
export interface Step { step: number; hypothesis: string; tool: string; tool_args_summary: string; result_summary: string; duration_ms: number }
export interface Evidence { source_type: 'PO' | 'GRN' | 'CONTRACT' | 'INVOICE'; source_ref: string; page: number; quote: string }
export interface Label { type: 'FACT' | 'HYPOTHESIS'; text: string }
export interface TaxItem { key: string; label: string; result: 'PASS' | 'FAIL' | 'NA'; detail: string }
export interface DecisionEntry {
  id: string
  actor: { type: 'AGENT' | 'USER'; id: string; name: string }
  action: string
  reason: string | null
  created_at: string
}

export interface InvoiceDetail {
  id: string
  invoice_number: string | null
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
  review_reason: string | null
  allowed_actions: Action[]
  processed_at: string | null
  file: { content_type: string; page_count: number; url: string }
  extraction: { fields: ExtractionField[] } | null
  comparison: { tolerance_pct: number; lines: CompLine[]; totals: Totals } | null
  tax_check: { items: TaxItem[] } | null
  duplicate: {
    original_invoice_id: string
    original_invoice_number: string
    original_total_amount: number
  } | null
  investigation: { iterations: number; max_iterations: number; steps: Step[] } | null
  finding: { summary: string; recommendation: string; confidence: number; labels: Label[]; evidence: Evidence[] } | null
  escalation: { by_name: string; reason: string; at: string } | null
  decisions: DecisionEntry[]
}