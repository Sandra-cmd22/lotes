import type { AppData, Client, Lot } from '../src/types/index.ts'
import { normalizeName } from '../src/lib/calculations.ts'
import type { TableRow } from './table-spec.ts'

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '')
}

export function nameKey(name: string): string {
  return stripAccents(normalizeName(name))
}

export function nameMatches(tableName: string, clientName: string): boolean {
  const a = nameKey(tableName)
  const b = nameKey(clientName)
  if (a === b) return true
  if (b.startsWith(a) || a.startsWith(b)) return true
  const aFirst = a.split(' ')[0]
  const bFirst = b.split(' ')[0]
  if (aFirst.length >= 4 && aFirst === bFirst) return true
  if (a.startsWith('marquinh') && b.startsWith('marquinh')) return true
  if (a.replace(/\s/g, '') === b.replace(/\s/g, '')) return true
  if (a === 'fernando' && b.startsWith('fernando')) return true
  return false
}

export function normLot(n: string): string {
  return n.trim().replace(/^0+/, '') || '0'
}

export function lotsMatch(a: string, b: string): boolean {
  return normLot(a) === normLot(b) || a.trim() === b.trim()
}

export function findClient(data: AppData, name: string): Client | undefined {
  const list = data.clients.filter((c) => nameMatches(name, c.name))
  return list.length === 1 ? list[0] : undefined
}

export function isJonasSplit(row: TableRow): boolean {
  return row.clientName === 'Jonas' && (row.lotNumbers?.length ?? 0) > 1
}

export function findLotsForRow(data: AppData, row: TableRow): Lot[] {
  if (row.clientName === 'Raimundo' && row.lotNumbers === null) {
    const c = findClient(data, 'Raimundo')
    if (!c) return []
    const lots = data.lots.filter((l) => l.clientId === c.id)
    const main = lots.find((l) => l.totalValue >= 80_000) ?? lots[0]
    return main ? [main] : []
  }

  const client = findClient(data, row.clientName)
  if (!client) return []

  const clientLots = data.lots.filter((l) => l.clientId === client.id)
  if (clientLots.length === 0) return []

  const nums = row.lotNumbers ?? []
  if (nums.length === 0) return clientLots

  if (isJonasSplit(row)) {
    return nums
      .map((n) => clientLots.find((l) => lotsMatch(l.lote, n)))
      .filter((l): l is Lot => !!l)
  }

  const combined = clientLots.find(
    (l) =>
      nums.length > 1 &&
      l.lote.includes(',') &&
      nums.every((n) => l.lote.includes(n.replace(/^0+/, ''))),
  )
  if (combined) return [combined]

  if (nums.length > 1) {
    return nums
      .map((n) => clientLots.find((l) => lotsMatch(l.lote, n)))
      .filter((l): l is Lot => !!l)
  }

  const one = clientLots.find((l) => lotsMatch(l.lote, nums[0]!))
  return one ? [one] : clientLots.length === 1 ? [clientLots[0]!] : []
}
