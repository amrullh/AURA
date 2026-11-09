import http from 'node:http'
import { readFileSync } from 'node:fs'

const file = process.argv[2] ?? '../docs/api/mock-data.json'
const d = JSON.parse(readFileSync(file, 'utf8'))

const roleDari = (req) => {
  const a = req.headers.authorization ?? ''
  return a.includes('verifikator') ? 'verifikator' : a.includes('admin') ? 'admin' : 'staf'
}

const detailInvoices = Object.entries(d.invoice_detail)
  .filter(([k]) => !k.startsWith('_'))
  .map(([, v]) => v)

// Data yang bisa berubah selama server hidup
const users = structuredClone(d.users.list_response)
let settings = structuredClone(d.settings.get_response)
const vendors = structuredClone(d.master.vendors)
const daftar = structuredClone(d.invoices.list_response)

const ubah = (id, isi) => {
  const x = daftar.data.find((r) => r.id === id)
  if (x) Object.assign(x, isi)
}
function simulasi(id) {
  ubah(id, { processing_status: 'QUEUED', iteration: null })
  setTimeout(() => ubah(id, { processing_status: 'PROCESSING', iteration: 1 }), 1500)
  setTimeout(() => ubah(id, { iteration: 2 }), 4000)
  setTimeout(() => ubah(id, { iteration: 3 }), 6500)
  setTimeout(() => ubah(id, {
    processing_status: 'DONE', iteration: 3, invoice_number: 'INV-9001', vendor_name: 'CV Maju Jaya',
    total_amount: 2310000, verdict: 'CLEAN', confidence: 0.95, decision_status: 'PENDING',
    allowed_actions: ['APPROVE', 'REJECT', 'ESCALATE'],
  }), 9000)
}

const KOLOM = {
  items: [{ key: 'id', label: 'ID' }, { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Nama barang' }, { key: 'unit', label: 'Satuan' }],
  'goods-receipts': [
    { key: 'grn_number', label: 'No. GRN' }, { key: 'po_number', label: 'No. PO' }, { key: 'received_date', label: 'Tanggal terima' },
    { key: 'line_no', label: 'Baris' }, { key: 'item_name', label: 'Barang' }, { key: 'quantity_received', label: 'Diterima' },
  ],
}
const tabelKosong = (columns) => ({ columns, data: [], meta: { page: 1, page_size: 20, total: 0, total_pages: 1 } })

const send = (res, status, body) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  })
  res.end(JSON.stringify(body))
}

const readBody = (req) =>
  new Promise((ok) => {
    let s = ''
    req.on('data', (c) => (s += c))
    req.on('end', () => {
      try { ok(JSON.parse(s || '{}')) } catch { ok({}) }
    })
  })

const habisiBody = (req) => new Promise((ok) => { req.on('data', () => {}); req.on('end', ok) })

http
  .createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204, {})
    const role = roleDari(req)
    const url = new URL(req.url, 'http://localhost')
    const path = url.pathname.replace(/^\/api/, '')
    const q = url.searchParams
    const m = req.method

    if (path === '/auth/login' && m === 'POST') {
      const { email = '' } = await readBody(req)
      if (email.includes('verif')) return send(res, 200, { ...d.auth.login_response_verifikator, access_token: 'mock-verifikator' })
      if (email.includes('admin')) return send(res, 200, { ...d.auth.login_response_admin, access_token: 'mock-admin' })
      if (email.includes('staf')) return send(res, 200, { ...d.auth.login_response_staf, access_token: 'mock-staf' })
      return send(res, 401, d.auth.login_gagal_401)
    }

    if (path === '/dashboard/summary') return send(res, 200, d.dashboard[`summary_${role}`])

    if (path === '/batches' && m === 'POST') { await habisiBody(req); return send(res, 201, d.batches.upload_response_201) }
    if (path === '/demo/sample-batch' && m === 'POST') { await habisiBody(req); return send(res, 201, d.batches.upload_response_201) }
    if (path === '/batches') return send(res, 200, d.batches.list_response)
    if (/^\/batches\/[^/]+$/.test(path)) return send(res, 200, d.batches.detail_response)

    if (path === '/invoices') {
      if (q.get('queue') === 'mine') {
        return send(res, 200, role === 'verifikator'
          ? d.invoices.list_antrean_saya_verifikator
          : d.invoices.list_antrean_saya_staf)
      }
      const cari = (q.get('q') ?? '').toLowerCase()
      const list = daftar
      return send(res, 200, cari
        ? { ...list, data: list.data.filter((x) => (x.invoice_number ?? '').toLowerCase().includes(cari)) }
        : list)
    }

    const rt = path.match(/^\/invoices\/([^/]+)\/retry$/)
    if (rt && m === 'POST') {
      await habisiBody(req)
      simulasi(rt[1])
      return send(res, 202, { id: rt[1], processing_status: 'QUEUED' })
    }

    let hit = path.match(/^\/invoices\/([^/]+)\/decision$/)
    if (hit && m === 'POST') {
      const { reason = '' } = await readBody(req)
      if (reason.trim().length < 3) return send(res, 400, d.decision.error_alasan_kosong_400)
      return send(res, 200, d.decision.response_200)
    }

    hit = path.match(/^\/invoices\/([^/]+)$/)
    if (hit) {
      let inv
      if (hit[1] === 'inv_0412') {
        const kunci = role === 'verifikator' ? 'escalated_dilihat_verifikator'
          : role === 'admin' ? 'sudah_ditolak_read_only' : 'exception'
        inv = d.invoice_detail[kunci]
      } else {
        inv = detailInvoices.find((x) => x.id === hit[1])
      }
      return inv ? send(res, 200, inv) : send(res, 404, d.errors.not_found_404)
    }

    if (path === '/reports/metrics') {
      const dasar = d.metrics.get_response
      const bt = d.batches.list_response.data.find((x) => x.id === q.get('batch_id'))
      if (!bt) return send(res, 200, dasar)
      // Perkiraan untuk demo: angka diturunkan dari hitungan batch yang dipilih.
      const c = bt.counts
      const porsi = bt.total / dasar.invoices_total
      return send(res, 200, {
        ...dasar,
        invoices_total: bt.total,
        by_verdict: { clean: c.clean, exception: c.exception, duplicate: c.duplicate, needs_review: c.needs_review },
        auto_clear_percent: Math.round((c.clean / bt.total) * 1000) / 10,
        escalation_rate_percent: Math.round((c.needs_review / bt.total) * 1000) / 10,
        difference_caught_total: Math.round(dasar.difference_caught_total * porsi),
        estimated_hours_saved: Math.round(((bt.total * 10) / 60) * 10) / 10,
      })
    }

    if (path === '/settings' && m === 'PUT') {
      const b = await readBody(req)
      settings = { ...settings, ...b, updated_at: new Date().toISOString(), updated_by: 'Admin Sistem' }
      return send(res, 200, settings)
    }
    if (path === '/settings') return send(res, 200, settings)

    if (path === '/users' && m === 'POST') {
      const b = await readBody(req)
      if (users.data.some((u) => u.email === b.email)) return send(res, 409, d.users.error_email_dipakai_409)
      const baru = { id: 'usr_' + Date.now(), name: b.name, email: b.email, role: b.role, is_active: true, last_login_at: null }
      users.data.push(baru)
      users.meta.total = users.data.length
      return send(res, 201, baru)
    }
    hit = path.match(/^\/users\/([^/]+)$/)
    if (hit && m === 'PATCH') {
      const b = await readBody(req)
      const u = users.data.find((x) => x.id === hit[1])
      if (!u) return send(res, 404, d.errors.not_found_404)
      if (u.role === 'ADMIN' && role === 'admin' && u.email.includes('admin')) return send(res, 403, d.users.error_akun_sendiri_403)
      Object.assign(u, b)
      return send(res, 200, u)
    }
    if (path === '/users') return send(res, 200, users)

    if (path === '/audit-logs') return send(res, 200, d.audit_logs.list_response)

    const imp = path.match(/^\/master\/([^/]+)\/import$/)
    if (imp && m === 'POST') {
      await habisiBody(req)
      const dry = q.get('dry_run') === 'true'
      if (imp[1] !== 'vendors') return send(res, 200, { dry_run: dry, valid_rows: 0, invalid_rows: 1, preview: [], errors: [{ row: 1, reason: 'Contoh mock hanya tersedia untuk tab Vendor.' }] })
      const hasil = { ...d.master.import_dry_run_response, dry_run: dry }
      if (!dry) {
        hasil.preview.forEach((r) => { if (!vendors.data.some((v) => v.id === r.id)) vendors.data.push(r) })
        vendors.meta.total = vendors.data.length
      }
      return send(res, 200, hasil)
    }

    hit = path.match(/^\/master\/([^/]+)$/)
    if (hit) {
      const peta = {
        vendors,
        'purchase-orders': d.master.purchase_orders,
        items: tabelKosong(KOLOM.items),
        'goods-receipts': tabelKosong(KOLOM['goods-receipts']),
      }
      return send(res, 200, peta[hit[1]] ?? tabelKosong([]))
    }

    return send(res, 404, d.errors.not_found_404)
  })
  .listen(4010, () => console.log('Server tiruan Aura di http://localhost:4010'))