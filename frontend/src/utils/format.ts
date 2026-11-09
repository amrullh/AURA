export const rupiah = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n)

export const keyakinan = (n: number) => n.toFixed(2).replace('.', ',')

export const waktuWib = (iso: string) =>
  new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta',
  }).format(new Date(iso)) + ' WIB'