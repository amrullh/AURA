/**
 * KONTRAK BE <-> AGENT (DRAFT, perlu disepakati dengan tim AI).
 * BE memanggil `POST {AGENT_URL}/process` dan menunggu respons (batas waktu bawaan 120 detik).
 * Agent membaca PO, GRN, dan vendor lewat user database baca-saja. Agent tidak menulis ke database.
 * Bentuk bagian `extraction` sampai `finding` sama dengan InvoiceDetail di docs/api/openapi.yaml.
 */
export interface AgentRequest {
  invoice_id: string;
  file_name: string;
  content_type: string;
  /** Isi berkas, base64. */
  file_base64: string;
  settings: {
    price_tolerance_pct: number;
    confidence_threshold: number;
    max_iterations: number;
  };
}

export interface AgentResult {
  invoice: {
    invoice_number: string | null;
    vendor_id: string | null;
    vendor_name: string | null;
    po_number: string | null;
    invoice_date: string | null; // YYYY-MM-DD
    total_amount: number | null; // Rupiah bulat
  };
  verdict: 'CLEAN' | 'EXCEPTION' | 'DUPLICATE' | 'NEEDS_REVIEW';
  confidence: number; // 0..1
  difference_amount: number | null;
  iterations: number; // 0..3
  review_reason?: string | null;
  extraction: unknown;
  comparison: unknown;
  tax_check: unknown;
  duplicate: unknown;
  investigation: unknown;
  finding: unknown;
}

export interface AgentHooks {
  /** Dipanggil agent tiruan agar iterasi terlihat berjalan. Agent HTTP tidak memakainya. */
  onProgress?: (iteration: number) => Promise<void> | void;
}

/** Error yang pesannya aman ditampilkan ke pengguna (disimpan di error_message). */
export class AgentError extends Error {}

export abstract class AgentClient {
  abstract process(req: AgentRequest, hooks?: AgentHooks): Promise<AgentResult>;
}
