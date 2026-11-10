export const LABEL_AKSI: Record<string, string> = {
  LOGIN: 'Masuk',
  INVOICE_UPLOADED: 'Unggah batch',
  INVOICE_PROCESSED: 'Invoice diproses',
  INVOICE_RETRY: 'Coba ulang invoice',
  DECISION_APPROVE: 'Keputusan: Setujui',
  DECISION_REJECT: 'Keputusan: Tolak',
  DECISION_ESCALATE: 'Keputusan: Eskalasi',
  SETTINGS_UPDATED: 'Ubah pengaturan',
  USER_CREATED: 'Pengguna dibuat',
  USER_UPDATED: 'Pengguna diubah',
  MASTER_IMPORTED: 'Impor data master',
  DEMO_RESET: 'Reset data demo',
}
export const DAFTAR_AKSI = Object.keys(LABEL_AKSI)
export const aksi = (k: string) => LABEL_AKSI[k] ?? k

export const LABEL_DETAIL: Record<string, string> = {
  reason: 'Alasan', from_status: 'Status awal', to_status: 'Status akhir', verdict: 'Verdict',
  confidence: 'Keyakinan', iterations: 'Iterasi', accepted: 'Diterima', rejected: 'Ditolak',
  price_tolerance_pct: 'Toleransi harga (%)', confidence_threshold: 'Ambang keyakinan',
}
export function teksDetail(v: unknown): string {
  if (v && typeof v === 'object' && 'from' in v && 'to' in v) {
    const o = v as { from: unknown; to: unknown }
    return `${String(o.from).replace('.', ',')} menjadi ${String(o.to).replace('.', ',')}`
  }
  return String(v)
}