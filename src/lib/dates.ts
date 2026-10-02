export function todayISO(): string {
  return toDateOnly(new Date())
}

export function toDateOnly(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatDateBR(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function daysBetween(startIso: string, endIso: string): number {
  const start = parseISODate(startIso).getTime()
  const end = parseISODate(endIso).getTime()
  return Math.max(0, Math.floor((end - start) / (1000 * 60 * 60 * 24)))
}

export function addMonths(iso: string, months: number): string {
  const d = parseISODate(iso)
  d.setMonth(d.getMonth() + months)
  return toDateOnly(d)
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + days)
  return toDateOnly(d)
}

export function addWeeks(iso: string, weeks: number): string {
  return addDays(iso, weeks * 7)
}
