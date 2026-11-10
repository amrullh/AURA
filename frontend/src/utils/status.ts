export const VERDICT = {
  CLEAN: { label: 'CLEAN', cls: 'bg-lime-100 text-lime-900' },
  EXCEPTION: { label: 'EXCEPTION', cls: 'bg-amber-100 text-amber-900' },
  DUPLICATE: { label: 'DUPLICATE', cls: 'bg-violet-100 text-violet-900' },
  NEEDS_REVIEW: { label: 'NEEDS_REVIEW', cls: 'bg-pink-100 text-pink-900' },
} as const

export const DECISION = {
  PENDING: { label: 'PENDING', cls: 'bg-slate-200 text-slate-700' },
  ESCALATED: { label: 'ESCALATED', cls: 'bg-blue-100 text-blue-900' },
  APPROVED: { label: 'APPROVED', cls: 'bg-lime-800 text-white' },
  REJECTED: { label: 'REJECTED', cls: 'bg-red-800 text-white' },
} as const

export const PROSES = {
  QUEUED: { label: 'Antre', cls: 'bg-slate-200 text-slate-700' },
  PROCESSING: { label: 'Diproses', cls: 'bg-sky-100 text-sky-900' },
  DONE: { label: 'Selesai', cls: '' },
  FAILED: { label: 'Gagal', cls: 'bg-red-100 text-red-900' },
} as const