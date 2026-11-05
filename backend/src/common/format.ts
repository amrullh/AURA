const WIB = 'Asia/Jakarta';

/** Nama batch bawaan, misalnya "Batch 2 Nov, 17.30". */
export function defaultBatchName(d = new Date()): string {
  const tgl = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: WIB }).format(d);
  const jam = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: WIB })
    .format(d)
    .replace(':', '.');
  return `Batch ${tgl}, ${jam}`;
}

/** Awal hari ini menurut WIB, dalam UTC. */
export function startOfTodayWib(now = new Date()): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: WIB }).format(now); // YYYY-MM-DD
  return new Date(`${ymd}T00:00:00+07:00`);
}

/** 0.52 → "0,52" */
export function idNumber(n: number, digits = 2): string {
  return n.toFixed(digits).replace('.', ',');
}
