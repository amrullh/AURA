export function unduhCsv(nama: string, baris: (string | number)[][]) {
  const isi = baris.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + isi], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nama
  a.click()
  URL.revokeObjectURL(a.href)
}