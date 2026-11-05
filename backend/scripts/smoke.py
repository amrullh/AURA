#!/usr/bin/env python3
"""Uji asap alur utama lewat HTTP. Pemakaian: python3 scripts/smoke.py [BASE_URL] [SANDI_DEMO]
Butuh server berjalan dengan AGENT_MODE=stub dan database yang baru diisi (AUTO_SEED)."""
import json, sys, time, uuid, urllib.request, urllib.error

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000/api').rstrip('/')
PWD = sys.argv[2] if len(sys.argv) > 2 else 'demo12345'
fails = []

def call(method, path, token=None, body=None, raw=None, ctype=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    h = {}
    if body is not None: h['Content-Type'] = 'application/json'
    if ctype: h['Content-Type'] = ctype
    if token: h['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req) as r:
            b = r.read()
            return r.status, (json.loads(b) if b and 'json' in r.headers.get('Content-Type', '') else b), r.headers
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, json.loads(b), e.headers
        except Exception: return e.code, b, e.headers

def check(name, cond, extra=''):
    print(('OK   ' if cond else 'GAGAL'), name, '' if cond else extra)
    if not cond: fails.append(name)

def multipart(files, name=None):
    bd = uuid.uuid4().hex
    out = b''
    if name: out += f'--{bd}\r\nContent-Disposition: form-data; name="name"\r\n\r\n{name}\r\n'.encode()
    for fn, content in files:
        out += f'--{bd}\r\nContent-Disposition: form-data; name="files"; filename="{fn}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode() + content + b'\r\n'
    out += f'--{bd}--\r\n'.encode()
    return out, f'multipart/form-data; boundary={bd}'

def login(email):
    s, b, _ = call('POST', '/auth/login', body={'email': email, 'password': PWD})
    assert s == 200, (email, s, b)
    return b['access_token']

# ---- auth
s, b, _ = call('POST', '/auth/login', body={'email': 'staf@demo.id', 'password': 'salah'})
check('login salah → 401 INVALID_CREDENTIALS', s == 401 and b['error']['code'] == 'INVALID_CREDENTIALS', (s, b))
s, b, _ = call('POST', '/auth/login', body={'email': 'bukan-email', 'password': ''})
check('login input kosong → 400 VALIDATION_ERROR', s == 400 and b['error']['code'] == 'VALIDATION_ERROR' and b['error'].get('details'), (s, b))
s, b, _ = call('GET', '/me')
check('tanpa token → 401 UNAUTHORIZED', s == 401 and b['error']['code'] == 'UNAUTHORIZED', (s, b))
staf, verif, admin = login('staf@demo.id'), login('verif@demo.id'), login('admin@demo.id')
s, b, _ = call('GET', '/me', staf)
check('GET /me', s == 200 and b['role'] == 'STAF_FINANCE', (s, b))

# ---- hak akses dasar
s, b, _ = call('GET', '/users', staf); check('Staf ke /users → 403', s == 403 and b['error']['code'] == 'FORBIDDEN', (s, b))
s, b, _ = call('GET', '/audit-logs', verif); check('Verifikator ke /audit-logs → 403', s == 403, (s, b))
body, ct = multipart([('a.pdf', b'%PDF-1.4 x')])
s, b, _ = call('POST', '/batches', verif, raw=body, ctype=ct); check('Verifikator unggah → 403', s == 403, (s, b))

# ---- unggah: tipe tidak didukung, berkas valid, duplikat
pdf = b'%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n' + uuid.uuid4().hex.encode()
body, ct = multipart([('catatan.docx', b'PK\x03\x04 bukan invoice'), ('inv_exception_x.pdf', pdf), ('inv_exception_x (1).pdf', pdf)], name='Batch uji')
s, b, _ = call('POST', '/batches', staf, raw=body, ctype=ct)
check('unggah → 201', s == 201, (s, b))
reasons = {r['file_name']: r['reason'] for r in b.get('rejected', [])}
check('docx ditolak UNSUPPORTED_TYPE', reasons.get('catatan.docx') == 'UNSUPPORTED_TYPE', reasons)
check('berkas kembar dalam satu unggahan ditolak DUPLICATE_FILE', reasons.get('inv_exception_x (1).pdf') == 'DUPLICATE_FILE', reasons)
check('satu berkas diterima, nama batch dipakai', len(b['accepted']) == 1 and b['batch']['name'] == 'Batch uji' and b['batch']['total'] == 1, b)
body, ct = multipart([('ulang.pdf', pdf)])
s, b2, _ = call('POST', '/batches', staf, raw=body, ctype=ct)
check('unggah ulang isi sama (lintas batch) → 400, semua ditolak', s == 400 and b2['error']['code'] == 'VALIDATION_ERROR', (s, b2))

# ---- batch contoh + polling
s, b, _ = call('POST', '/demo/sample-batch', staf)
check('demo/sample-batch → 201 (12 berkas)', s == 201 and b['batch']['total'] == 12, (s, b if s != 201 else b['batch']))
bid = b['batch']['id']
t0 = time.time(); seen_states = set()
while time.time() - t0 < 90:
    s, lst, _ = call('GET', f'/invoices?batch_id={bid}&page_size=100', staf)
    for it in lst['data']: seen_states.add(it['processing_status'])
    if all(it['processing_status'] in ('DONE', 'FAILED') for it in lst['data']): break
    time.sleep(2)
check('semua invoice selesai (DONE/FAILED)', all(it['processing_status'] in ('DONE', 'FAILED') for it in lst['data']), seen_states)
check('terlihat status antara (QUEUED/PROCESSING) saat polling', bool(seen_states & {'QUEUED', 'PROCESSING'}), seen_states)
by = {}
for it in lst['data']: by.setdefault(it['verdict'] or it['processing_status'], []).append(it)
print('     sebaran:', {k: len(v) for k, v in by.items()})
check('ada CLEAN, EXCEPTION, NEEDS_REVIEW, DUPLICATE, FAILED', all(k in by for k in ('CLEAN', 'EXCEPTION', 'NEEDS_REVIEW', 'DUPLICATE', 'FAILED')), list(by))
s, bt, _ = call('GET', f'/batches/{bid}', staf)
check('batch DONE dengan hitungan benar', bt['status'] == 'DONE' and bt['completed'] == 12 and bt['counts']['failed'] == 1 and sum(bt['counts'][k] for k in ('clean', 'exception', 'duplicate', 'needs_review')) == 11, bt)

# ---- rincian per kondisi
exc = by['EXCEPTION'][0]; clean = by['CLEAN'][0]; rev = by['NEEDS_REVIEW'][0]; dup = by['DUPLICATE'][0]; failed = by['FAILED'][0]
check('EXCEPTION: Staf boleh 3 aksi, antrean STAF_FINANCE', exc['allowed_actions'] == ['APPROVE', 'REJECT', 'ESCALATE'] and exc['queue_owner'] == 'STAF_FINANCE', exc)
check('NEEDS_REVIEW: Staf tidak boleh aksi, antrean VERIFIKATOR + alasan', rev['allowed_actions'] == [] and rev['queue_owner'] == 'VERIFIKATOR' and rev['review_reason'], rev)
s, d, _ = call('GET', f'/invoices/{exc["id"]}', staf)
check('detail EXCEPTION lengkap (comparison, investigation, finding+evidence, riwayat agent)',
      s == 200 and d['comparison'] and d['investigation']['steps'] and d['finding']['evidence'] and d['decisions'][0]['actor']['type'] == 'AGENT' and d['file']['url'].endswith('/file'), d.get('verdict'))
s, d, _ = call('GET', f'/invoices/{dup["id"]}', staf)
check('detail DUPLICATE punya blok duplicate ke invoice asli', s == 200 and d['duplicate'] and d['duplicate']['original_invoice_id'] != dup['id'], d.get('duplicate'))
s, d, _ = call('GET', f'/invoices/{failed["id"]}', staf)
check('detail FAILED punya error_message, tanpa aksi', d['processing']['error_message'] and d['allowed_actions'] == [] and d['comparison'] is None, d)
s, d, _ = call('GET', '/invoices/inv_tidak_ada', staf); check('invoice tidak ada → 404', s == 404 and d['error']['code'] == 'NOT_FOUND', (s, d))
s, raw, h = call('GET', f'/invoices/{clean["id"]}/file', staf)
check('unduh berkas PDF dengan token', s == 200 and raw[:5] == b'%PDF-' and h.get('Content-Type') == 'application/pdf', (s, h.get('Content-Type')))
s, _, _ = call('GET', f'/invoices/{clean["id"]}/file'); check('berkas tanpa token → 401', s == 401)

# ---- antrean saya
s, q, _ = call('GET', '/invoices?queue=mine&page_size=100', staf)
check('antrean Staf: hanya PENDING CLEAN/EXCEPTION/DUPLICATE', s == 200 and q['data'] and all(i['decision_status'] == 'PENDING' and i['verdict'] in ('CLEAN', 'EXCEPTION', 'DUPLICATE') for i in q['data']), q['meta'])
s, qv, _ = call('GET', '/invoices?queue=mine&page_size=100', verif)
check('antrean Verifikator: NEEDS_REVIEW saja saat belum ada eskalasi', qv['data'] and all(i['verdict'] == 'NEEDS_REVIEW' for i in qv['data']), qv['meta'])
s, qa, _ = call('GET', '/invoices?queue=mine', admin); check('antrean Admin kosong', qa['meta']['total'] == 0, qa)
s, qf, _ = call('GET', '/invoices?queue=mine&verdict=CLEAN', staf); check('queue=mine + filter verdict digabung', all(i['verdict'] == 'CLEAN' for i in qf['data']) and qf['data'], qf['meta'])
s, qf, _ = call('GET', '/invoices?queue=mine&verdict=NEEDS_REVIEW', staf); check('queue=mine + filter yang bertentangan → kosong', qf['meta']['total'] == 0, qf['meta'])
s, so, _ = call('GET', f'/invoices?batch_id={bid}&sort=-difference_amount&page_size=100', staf)
diffs = [i['difference_amount'] for i in so['data'] if i['difference_amount'] is not None]
check('sort -difference_amount menurun', diffs == sorted(diffs, reverse=True) and so['data'][-1]['difference_amount'] is None, diffs)
s, bad, _ = call('GET', '/invoices?sort=sembarang', staf); check('sort tidak valid → 400', s == 400, (s, bad))
s, bad, _ = call('GET', '/invoices?verdict=APA', staf); check('verdict tidak valid → 400', s == 400, (s, bad))

# ---- keputusan
dec = lambda tok, iid, action, reason='Alasan uji coba': call('POST', f'/invoices/{iid}/decision', tok, body={'action': action, 'reason': reason})
s, b, _ = dec(staf, exc['id'], 'REJECT', ''); check('alasan kosong → 400', s == 400 and b['error']['code'] == 'VALIDATION_ERROR', (s, b))
s, b, _ = dec(admin, exc['id'], 'APPROVE'); check('Admin memutuskan → 403', s == 403, (s, b))
s, b, _ = dec(verif, exc['id'], 'APPROVE'); check('Verifikator pada invoice yang belum dieskalasi → 403', s == 403, (s, b))
s, b, _ = dec(staf, rev['id'], 'APPROVE'); check('Staf pada NEEDS_REVIEW → 403', s == 403, (s, b))
s, b, _ = dec(staf, failed['id'], 'APPROVE'); check('keputusan pada invoice FAILED → 409', s == 409 and b['error']['code'] == 'INVALID_TRANSITION', (s, b))
s, b, _ = dec(staf, exc['id'], 'ESCALATE', 'Perlu penilaian klausul kontrak')
check('Staf eskalasi → ESCALATED, milik Verifikator, ada blok escalation', s == 200 and b['decision_status'] == 'ESCALATED' and b['queue_owner'] == 'VERIFIKATOR' and b['review_reason'] == 'Eskalasi dari Staf' and b['escalation']['by_name'] == 'Rina Staf' and b['allowed_actions'] == [], b)
s, b, _ = dec(staf, exc['id'], 'APPROVE'); check('Staf setelah eskalasi → 403', s == 403, (s, b))
s, qv, _ = call('GET', '/invoices?queue=mine&page_size=100', verif)
check('invoice eskalasi muncul di antrean Verifikator', any(i['id'] == exc['id'] for i in qv['data']), qv['meta'])
s, b, _ = dec(verif, exc['id'], 'ESCALATE'); check('Verifikator eskalasi → 403', s == 403, (s, b))
s, b, _ = dec(verif, exc['id'], 'REJECT', 'Harga tidak sesuai PO dan tidak ada pemberitahuan tertulis.')
check('Verifikator tolak → REJECTED final, riwayat memuat Agent, Staf, Verifikator', s == 200 and b['decision_status'] == 'REJECTED' and b['allowed_actions'] == [] and [x['actor']['type'] for x in b['decisions']] == ['AGENT', 'USER', 'USER'], b)
s, b, _ = dec(verif, exc['id'], 'APPROVE'); check('keputusan ulang setelah final → 409', s == 409 and b['error']['code'] == 'INVALID_TRANSITION', (s, b))
s, b, _ = dec(staf, clean['id'], 'APPROVE', 'Sesuai PO dan GRN'); check('Staf setujui CLEAN → APPROVED', s == 200 and b['decision_status'] == 'APPROVED' and b['queue_owner'] is None, b)
s, b, _ = dec(verif, rev['id'], 'APPROVE', 'Jasa instalasi sudah dikonfirmasi pemesan'); check('Verifikator setujui NEEDS_REVIEW → APPROVED', s == 200 and b['decision_status'] == 'APPROVED', b)

# ---- retry
s, b, _ = call('POST', f'/invoices/{clean["id"]}/retry', staf); check('retry bukan FAILED → 409', s == 409, (s, b))
s, b, _ = call('POST', f'/invoices/{failed["id"]}/retry', verif); check('retry oleh Verifikator → 403', s == 403, (s, b))
s, b, _ = call('POST', f'/invoices/{failed["id"]}/retry', staf)
check('retry FAILED → 202 QUEUED', s == 202 and b['processing_status'] == 'QUEUED', (s, b))
time.sleep(5); s, b, _ = call('GET', f'/invoices/{failed["id"]}', staf)
check('retry diproses ulang (stub gagal lagi karena nama berkas "gagal")', b['processing_status'] in ('PROCESSING', 'FAILED'), b['processing_status'])

# ---- dasbor
s, b, _ = call('GET', '/dashboard/summary', staf); check('dasbor Staf', s == 200 and b['latest_batch']['id'] == bid and 'my_queue_count' in b, b)
s, b, _ = call('GET', '/dashboard/summary', verif); check('dasbor Verifikator (needs_review_count, decided_today)', 'needs_review_count' in b and b['decided_today']['approved'] >= 1 and b['decided_today']['rejected'] >= 1, b)
s, b, _ = call('GET', '/dashboard/summary', admin); check('dasbor Admin (active_users_by_role)', b['active_users_by_role']['ADMIN'] == 1, b)

# ---- pengaturan, pengguna, audit
s, b, _ = call('GET', '/settings', staf); check('semua peran boleh baca pengaturan', s == 200 and b['max_iterations'] == 3, b)
s, b, _ = call('PUT', '/settings', staf, body={'price_tolerance_pct': 1}); check('Staf ubah pengaturan → 403', s == 403, (s, b))
s, b, _ = call('PUT', '/settings', admin, body={'price_tolerance_pct': 500}); check('toleransi di luar batas → 400', s == 400, (s, b))
s, b, _ = call('PUT', '/settings', admin, body={'price_tolerance_pct': 1.0}); check('Admin ubah toleransi', s == 200 and b['price_tolerance_pct'] == 1.0 and b['updated_by'] == 'Admin Sistem', b)
s, b, _ = call('PUT', '/settings', admin, body={'price_tolerance_pct': 0.5})
s, b, _ = call('POST', '/users', admin, body={'name': 'Sari Staf', 'email': f'sari{uuid.uuid4().hex[:4]}@demo.id', 'role': 'STAF_FINANCE', 'password': 'rahasia123'})
check('Admin tambah pengguna', s == 201 and b['is_active'] and 'password' not in json.dumps(b), (s, b)); uid = b.get('id')
s, b2, _ = call('POST', '/users', admin, body={'name': 'X', 'email': 'staf@demo.id', 'role': 'ADMIN', 'password': 'rahasia123'}); check('email dipakai → 409 EMAIL_TAKEN', s == 409 and b2['error']['code'] == 'EMAIL_TAKEN', (s, b2))
s, b2, _ = call('POST', '/users', admin, body={'name': 'X', 'email': 'x@demo.id', 'role': 'ADMIN', 'password': 'pendek'}); check('sandi pendek → 400', s == 400, (s, b2))
s, b, _ = call('PATCH', f'/users/{uid}', admin, body={'is_active': False}); check('Admin nonaktifkan pengguna', s == 200 and b['is_active'] is False, (s, b))
s, me, _ = call('GET', '/me', admin)
s, b, _ = call('PATCH', f'/users/{me["id"]}', admin, body={'is_active': False}); check('Admin nonaktifkan akun sendiri → 403', s == 403, (s, b))
s, b, _ = call('PATCH', f'/users/{me["id"]}', admin, body={'role': 'STAF_FINANCE'}); check('Admin turunkan peran sendiri → 403', s == 403, (s, b))
s, b, _ = call('GET', '/audit-logs?page_size=100', admin)
actions = {a['action'] for a in b['data']}
check('audit memuat jenis aksi utama', {'LOGIN', 'INVOICE_UPLOADED', 'INVOICE_PROCESSED', 'DECISION_ESCALATE', 'DECISION_REJECT', 'DECISION_APPROVE', 'SETTINGS_UPDATED', 'USER_CREATED', 'INVOICE_RETRY'} <= actions, actions)
s, b, _ = call('GET', '/audit-logs?action=DECISION_REJECT&actor_type=USER', admin); check('filter audit', b['data'] and all(a['action'] == 'DECISION_REJECT' for a in b['data']), b['meta'])
s, b, _ = call('GET', '/audit-logs?action=APA', admin); check('filter audit tidak valid → 400', s == 400, (s, b))
s, b, _ = call('GET', '/batches', staf); check('daftar batch', s == 200 and b['meta']['total'] >= 2, b['meta'])
s, b, _ = call('GET', '/rute-tidak-ada', staf); check('rute tidak ada → 404 format seragam', s == 404 and b['error']['code'] == 'NOT_FOUND', (s, b))

# ---- laporan metrik
s, m, _ = call('GET', f'/reports/metrics?batch_id={bid}', staf)
exp_diff = sum(i['difference_amount'] or 0 for i in lst['data'] if i['verdict'] in ('EXCEPTION', 'NEEDS_REVIEW'))
check('metrics: total 12, by_verdict cocok daftar', s == 200 and m['invoices_total'] == 12 and m['by_verdict'] == {'clean': 6, 'exception': 3, 'duplicate': 1, 'needs_review': 1}, m)
check('metrics: auto_clear 54,5% (6 dari 11 DONE)', m['auto_clear_percent'] == 54.5, m)
check('metrics: selisih tertangkap = jumlah selisih EXCEPTION+NEEDS_REVIEW', m['difference_caught_total'] == exp_diff and exp_diff > 0, (m['difference_caught_total'], exp_diff))
check('metrics: eskalasi 1 dari 11 = 9,1%', m['escalation_rate_percent'] == 9.1, m)
check('metrics: waktu proses rata-rata > 0, jam hemat = 11 x 10 mnt', m['avg_processing_seconds'] > 0 and m['estimated_hours_saved'] == 1.8, m)
check('metrics: by_vendor memuat 3 exception', sum(v['exception_count'] for v in m['by_vendor']) == 3 and m['by_vendor'][0]['difference_total'] > 0, m['by_vendor'])
s, m0, _ = call('GET', '/reports/metrics?from=2999-01-01', verif)
check('metrics: rentang kosong → nol, tidak error (Verifikator boleh)', s == 200 and m0['invoices_total'] == 0 and m0['auto_clear_percent'] == 0 and m0['avg_processing_seconds'] == 0, (s, m0))
s, b, _ = call('GET', '/reports/metrics?from=2026-12-01&to=2026-01-01', staf); check('metrics: from > to → 400', s == 400, (s, b))
s, b, _ = call('GET', '/reports/metrics?from=kemarin', staf); check('metrics: tanggal tidak valid → 400', s == 400, (s, b))
s, b, _ = call('GET', '/reports/metrics'); check('metrics tanpa token → 401', s == 401, (s, b))

# ---- data master
s, b, _ = call('GET', '/master/vendors', staf); check('master oleh Staf → 403', s == 403, (s, b))
s, v, _ = call('GET', '/master/vendors', admin)
check('master vendors: kolom + 5 baris, tipe benar', s == 200 and [c['key'] for c in v['columns']] == ['id', 'name', 'npwp', 'payment_terms_days', 'has_contract'] and v['meta']['total'] == 5 and isinstance(v['data'][0]['payment_terms_days'], int) and isinstance(v['data'][0]['has_contract'], bool), v['meta'])
s, v, _ = call('GET', '/master/purchase-orders', admin)
check('master PO: 8 baris PO, tanggal YYYY-MM-DD, harga angka', v['meta']['total'] == 8 and v['data'][0]['po_date'] == '2026-10-15' and isinstance(v['data'][0]['unit_price'], int) and list(v['data'][0]) == [c['key'] for c in v['columns']], v['data'][0])
s, v, _ = call('GET', '/master/purchase-orders?q=PO-0012', admin); check('master PO: cari PO-0012 → 3 baris', v['meta']['total'] == 3 and all(r['po_number'] == 'PO-0012' for r in v['data']), v['meta'])
s, v, _ = call('GET', '/master/goods-receipts', admin); check('master GRN: 7 baris', v['meta']['total'] == 7 and 'quantity_received' in v['data'][0] and v['data'][0]['received_date'] == '2026-10-22', v['data'][0])
s, v, _ = call('GET', '/master/items?q=kertas', admin); check('master items: cari "kertas" → 2', v['meta']['total'] == 2, v['meta'])
s, v, _ = call('GET', '/master/items?page_size=3&page=3', admin); check('master items: paginasi (8 barang, 3 per halaman)', v['meta'] == {'page': 3, 'page_size': 3, 'total': 8, 'total_pages': 3} and len(v['data']) == 2, v['meta'])
s, b, _ = call('GET', '/master/sembarang', admin); check('master jenis tidak dikenal → 400', s == 400 and b['error']['code'] == 'VALIDATION_ERROR', (s, b))
s, b, _ = call('POST', '/master/vendors/import', admin); check('impor CSV → 501 NOT_IMPLEMENTED yang jelas', s == 501 and b['error']['code'] == 'NOT_IMPLEMENTED', (s, b))
s, b, _ = call('POST', '/master/vendors/import', staf); check('impor CSV oleh Staf → 403', s == 403, (s, b))

# ---- reset demo
s, b, _ = call('POST', '/demo/reset', staf); check('reset oleh Staf → 403', s == 403, (s, b))
s, b, _ = call('POST', '/demo/reset', admin); check('reset oleh Admin → 204', s == 204, (s, b))
s, b, _ = call('GET', '/batches', staf); check('setelah reset tidak ada batch', b['meta']['total'] == 0, b['meta'])
s, b, _ = call('GET', '/audit-logs?action=DEMO_RESET', admin); check('jejak audit tetap ada setelah reset', b['meta']['total'] == 1, b['meta'])

print('\nRINGKASAN:', 'SEMUA LOLOS' if not fails else f'{len(fails)} GAGAL: {fails}')
sys.exit(1 if fails else 0)
