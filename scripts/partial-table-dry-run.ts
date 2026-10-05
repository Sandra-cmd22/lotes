/**
 * DRY-RUN: relatório de atualização incremental da tabela manual.
 * Não altera dados. Uso: npx tsx scripts/partial-table-dry-run.ts
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AppData, Client, Lot, Payment } from '../src/types/index.ts'
import { getLotTotalPaid, normalizeName, syncInstallmentPaidAmounts } from '../src/lib/calculations.ts'
import { nearlyZero, roundMoney } from '../src/lib/money.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const data = JSON.parse(readFileSync(join(root, 'public/dados-loteamento.json'), 'utf8')) as AppData

type TableRow = {
  clientName: string
  lotNumbers: string[] | null // null = não informado
  entrada: number | null
  parcelasPagas: number | null
  totalPagoParcelas: number | null
  totalVenda: number | null
}

const TABLE: TableRow[] = [
  { clientName: 'Raimundo', lotNumbers: null, entrada: 25000, parcelasPagas: 43, totalPagoParcelas: 67000, totalVenda: 90000 },
  { clientName: 'Alex', lotNumbers: ['01', '02'], entrada: 10000, parcelasPagas: 27, totalPagoParcelas: 40000, totalVenda: 40000 },
  { clientName: 'Deurismar', lotNumbers: ['03'], entrada: 4000, parcelasPagas: 2, totalPagoParcelas: null, totalVenda: 25000 },
  { clientName: 'Lilian', lotNumbers: ['04'], entrada: 4000, parcelasPagas: 47, totalPagoParcelas: 15750, totalVenda: 20000 },
  { clientName: 'Eudes', lotNumbers: ['05'], entrada: 2000, parcelasPagas: null, totalPagoParcelas: null, totalVenda: 20000 },
  { clientName: 'Leonardo', lotNumbers: ['06'], entrada: 2000, parcelasPagas: null, totalPagoParcelas: null, totalVenda: 20000 },
  { clientName: 'Evandir', lotNumbers: ['07'], entrada: 2000, parcelasPagas: null, totalPagoParcelas: null, totalVenda: 20000 },
  { clientName: 'Caique', lotNumbers: ['08'], entrada: 2000, parcelasPagas: null, totalPagoParcelas: null, totalVenda: 20000 },
  { clientName: 'Daniel', lotNumbers: ['09', '10'], entrada: 4000, parcelasPagas: null, totalPagoParcelas: null, totalVenda: 20000 },
  { clientName: 'Régia', lotNumbers: ['11'], entrada: 2000, parcelasPagas: null, totalPagoParcelas: null, totalVenda: 20000 },
  { clientName: 'Fernando', lotNumbers: ['12'], entrada: 2000, parcelasPagas: null, totalPagoParcelas: null, totalVenda: 20000 },
  { clientName: 'Pago', lotNumbers: ['13'], entrada: null, parcelasPagas: null, totalPagoParcelas: null, totalVenda: 20000 },
  { clientName: 'Pago', lotNumbers: ['14'], entrada: null, parcelasPagas: null, totalPagoParcelas: null, totalVenda: 20000 },
  { clientName: 'Tânia', lotNumbers: ['15'], entrada: 2000, parcelasPagas: null, totalPagoParcelas: null, totalVenda: 20000 },
  { clientName: 'Jajá', lotNumbers: ['16'], entrada: 2000, parcelasPagas: null, totalPagoParcelas: null, totalVenda: 20000 },
  { clientName: 'Naldo', lotNumbers: ['17'], entrada: 2000, parcelasPagas: null, totalPagoParcelas: null, totalVenda: 20000 },
  { clientName: 'Robertânia', lotNumbers: ['18'], entrada: 2500, parcelasPagas: null, totalPagoParcelas: null, totalVenda: 20000 },
  { clientName: 'Davi', lotNumbers: ['19'], entrada: null, parcelasPagas: null, totalPagoParcelas: null, totalVenda: 20000 },
  { clientName: 'Barroso', lotNumbers: ['21'], entrada: null, parcelasPagas: null, totalPagoParcelas: null, totalVenda: 20000 },
  { clientName: 'Jonas', lotNumbers: ['22', '23', '26', '27'], entrada: 7500, parcelasPagas: null, totalPagoParcelas: null, totalVenda: 100000 },
  { clientName: 'Maria Lúcia', lotNumbers: ['30'], entrada: 2000, parcelasPagas: null, totalPagoParcelas: null, totalVenda: null },
  { clientName: 'Denir', lotNumbers: ['31'], entrada: null, parcelasPagas: null, totalPagoParcelas: null, totalVenda: null },
  { clientName: 'Marquinhos', lotNumbers: ['32', '40'], entrada: 3000, parcelasPagas: null, totalPagoParcelas: null, totalVenda: 40000 },
  { clientName: 'Marcelo', lotNumbers: ['33'], entrada: 2000, parcelasPagas: null, totalPagoParcelas: null, totalVenda: 20000 },
  { clientName: 'Rerin', lotNumbers: ['42'], entrada: 2000, parcelasPagas: 9, totalPagoParcelas: 4250, totalVenda: 20000 },
  { clientName: 'Iranildo', lotNumbers: ['43', '44'], entrada: 4000, parcelasPagas: null, totalPagoParcelas: null, totalVenda: 40000 },
  { clientName: 'Fernanda', lotNumbers: ['45'], entrada: 500, parcelasPagas: null, totalPagoParcelas: null, totalVenda: 30000 },
  { clientName: 'Sarah', lotNumbers: ['46'], entrada: 3000, parcelasPagas: null, totalPagoParcelas: null, totalVenda: 30000 },
]

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '')
}

function normLot(n: string): string {
  const t = n.trim().replace(/^0+/, '') || '0'
  return t
}

function lotsMatch(a: string, b: string): boolean {
  return normLot(a) === normLot(b) || a.trim() === b.trim()
}

function nameMatches(tableName: string, clientName: string): boolean {
  const a = stripAccents(normalizeName(tableName))
  const b = stripAccents(normalizeName(clientName))
  if (a === b) return true
  if (b.startsWith(a) || a.startsWith(b)) return true
  // Lilian / Lilian Cristina
  const aFirst = a.split(' ')[0]
  const bFirst = b.split(' ')[0]
  if (aFirst.length >= 4 && aFirst === bFirst) return true
  // Marquinhos / Marquinho oficina
  if (a.startsWith('marquinh') && b.startsWith('marquinh')) return true
  // Maria Lúcia / Maria lucia
  if (a.replace(/\s/g, '') === b.replace(/\s/g, '')) return true
  // Fernando / Fernando Guerreiro
  if (a === 'fernando' && b.startsWith('fernando')) return true
  return false
}

function findClients(name: string): Client[] {
  return data.clients.filter((c) => nameMatches(name, c.name))
}

function getEntradaInst(lot: Lot) {
  return lot.installments.find((i) => i.label === 'Entrada' || i.number === 0)
}

function getEntradaAmount(lot: Lot, payments: Payment[]): number {
  const inst = getEntradaInst(lot)
  if (!inst) return 0
  const synced = syncInstallmentPaidAmounts(lot, payments).find((i) => i.id === inst.id)
  return synced?.paidAmount ?? inst.paidAmount
}

function getEntradaDate(lot: Lot): string {
  const inst = getEntradaInst(lot)
  return inst?.dueDate ?? '—'
}

function countPaidParcelas(lot: Lot, payments: Payment[]): number {
  const synced = syncInstallmentPaidAmounts(lot, payments)
  return synced.filter(
    (i) => i.label !== 'Entrada' && i.number !== 0 && nearlyZero(Math.max(0, i.expectedAmount - i.paidAmount)),
  ).length
}

function totalPagoEmParcelas(lot: Lot, payments: Payment[]): number {
  const total = getLotTotalPaid(lot, payments)
  const entrada = getEntradaAmount(lot, payments)
  return roundMoney(Math.max(0, total - entrada))
}

function findLotForClient(client: Client, lotNum: string): Lot | undefined {
  const lots = data.lots.filter((l) => l.clientId === client.id)
  return lots.find((l) => lotsMatch(l.lote, lotNum))
}

function findLotByNumberOnly(lotNum: string): Lot[] {
  return data.lots.filter((l) => lotsMatch(l.lote, lotNum))
}

function findLotByClientAndNumber(
  name: string,
  lotNum: string,
  row: TableRow,
  lotIndex: number,
): { client?: Client; lot?: Lot; conflict?: string; note?: string } {
  const clients = findClients(name)
  if (clients.length === 0) {
    const byLot = findLotByNumberOnly(lotNum)
    if (byLot.length === 1) {
      const client = data.clients.find((c) => c.id === byLot[0].clientId)
      return {
        client,
        lot: byLot[0],
        conflict: `Cliente na tabela "${name}" ≠ banco "${client?.name}" (lote ${lotNum})`,
      }
    }
    if (byLot.length > 1) return { conflict: `Lote ${lotNum} ambíguo (${byLot.length} registros)` }
    return {}
  }
  if (clients.length > 1) {
    return { conflict: `${clients.length} clientes homônimos "${name}" — revisão manual` }
  }
  const client = clients[0]
  const clientLots = data.lots.filter((l) => l.clientId === client.id)

  let lot = findLotForClient(client, lotNum)
  if (lot) return { client, lot }

  const tableLotCount = row.lotNumbers?.length ?? 1
  if (clientLots.length === 1 && tableLotCount >= 1) {
    const only = clientLots[0]
    if (lotIndex === 0 || !row.lotNumbers) {
      return {
        client,
        lot: only,
        note: `Único lote no banco: Q${only.quadra} L${only.lote} (tabela pede nº ${lotNum})`,
      }
    }
    return {
      client,
      lot: only,
      conflict: `Tabela lista ${tableLotCount} lotes; banco tem 1 registro (L${only.lote}) — mesma venda?`,
    }
  }

  if (clientLots.length > 1 && tableLotCount > 1) {
    const sortedDb = [...clientLots].sort((a, b) => normLot(a.lote).localeCompare(normLot(b.lote)))
    const sortedTable = [...(row.lotNumbers ?? [])].sort((a, b) => normLot(a).localeCompare(normLot(b)))
    const idx = sortedTable.findIndex((n) => lotsMatch(n, lotNum))
    if (idx >= 0 && sortedDb[idx]) {
      return {
        client,
        lot: sortedDb[idx],
        note: `Pareamento por ordem: tabela L${lotNum} ↔ banco L${sortedDb[idx].lote} (${clientLots.length} lotes)`,
      }
    }
  }

  const global = findLotByNumberOnly(lotNum)
  if (global.length === 1 && global[0].clientId === client.id) {
    return { client, lot: global[0] }
  }
  if (global.length === 1 && global[0].clientId !== client.id) {
    const other = data.clients.find((c) => c.id === global[0].clientId)
    if (clientLots.length === 0) {
      return {
        conflict: `Lote ${lotNum} pertence a "${other?.name}", não a "${client.name}"`,
      }
    }
    return {
      client,
      conflict: `No banco L${lotNum} está em "${other?.name}"; "${client.name}" tem lote(s) ${clientLots.map((l) => l.lote).join(', ')} — renumerar?`,
    }
  }

  if (clientLots.length > 0) {
    return {
      client,
      conflict: `Cliente existe (${clientLots.length} lote(s): ${clientLots.map((l) => l.lote).join(', ')}), sem correspondência para nº ${lotNum}`,
    }
  }

  return { client }
}

function resolveRaimundo(): { client?: Client; lot?: Lot; conflict?: string } {
  const clients = findClients('Raimundo')
  if (clients.length !== 1) return { conflict: `Raimundo: ${clients.length} clientes encontrados` }
  const lots = data.lots.filter((l) => l.clientId === clients[0].id)
  if (lots.length === 1) return { client: clients[0], lot: lots[0] }
  if (lots.length === 0) return { client: clients[0] }
  // prefer lot 56 or highest total matching 90000
  const byTotal = lots.find((l) => l.totalValue === 90000)
  if (byTotal) return { client: clients[0], lot: byTotal, conflict: `Raimundo: ${lots.length} lotes — usando lote ${byTotal.lote} (total 90k)` }
  return { conflict: `Raimundo: ${lots.length} lotes, lote não informado na tabela — revisão manual` }
}

type ReportLine = Record<string, string | number>

function planLotUpdate(
  row: TableRow,
  lotNum: string,
  client: Client | undefined,
  lot: Lot | undefined,
  conflict: string | undefined,
): ReportLine {
  const lotLabel = lotNum
  if (conflict && !lot) {
    return {
      cliente: row.clientName,
      lote: lotLabel,
      encontrado: 'NÃO',
      clientId: '—',
      lotId: '—',
      dataEntrada: '—',
      entradaAtual: '—',
      entradaNova: row.entrada ?? '—',
      parcelasAtual: '—',
      parcelasDepois: row.parcelasPagas ?? '—',
      totalPagoParcAtual: '—',
      totalPagoParcDepois: row.totalPagoParcelas ?? '—',
      totalVendaAtual: '—',
      totalVendaDepois: row.totalVenda ?? '—',
      acao: `CONFLITO/REVISÃO MANUAL (${conflict})`,
    }
  }
  if (!client && !lot) {
    const acao = row.totalVenda != null || row.entrada != null ? 'CRIAR' : 'CONFLITO/REVISÃO MANUAL'
    return {
      cliente: row.clientName,
      lote: lotLabel,
      encontrado: 'NÃO',
      clientId: '—',
      lotId: '—',
      dataEntrada: '—',
      entradaAtual: '—',
      entradaNova: row.entrada ?? '—',
      parcelasAtual: '—',
      parcelasDepois: row.parcelasPagas ?? '—',
      totalPagoParcAtual: '—',
      totalPagoParcDepois: row.totalPagoParcelas ?? '—',
      totalVendaAtual: '—',
      totalVendaDepois: row.totalVenda ?? '—',
      acao,
    }
  }
  if (client && !lot) {
    return {
      cliente: row.clientName,
      lote: lotLabel,
      encontrado: 'PARCIAL',
      clientId: client.id.slice(0, 8) + '…',
      lotId: '—',
      dataEntrada: '—',
      entradaAtual: '—',
      entradaNova: row.entrada ?? '—',
      parcelasAtual: '—',
      parcelasDepois: row.parcelasPagas ?? '—',
      totalPagoParcAtual: '—',
      totalPagoParcDepois: row.totalPagoParcelas ?? '—',
      totalVendaAtual: '—',
      totalVendaDepois: row.totalVenda ?? '—',
      acao: conflict ? `CONFLITO/REVISÃO MANUAL (${conflict})` : 'CRIAR (lote)',
    }
  }

  const lotRef = lot!
  const clientRef = client ?? data.clients.find((c) => c.id === lotRef.clientId)!
  const entradaInst = getEntradaInst(lotRef)
  const entradaAtual = entradaInst ? roundMoney(entradaInst.expectedAmount) : 0
  const entradaPaga = getEntradaAmount(lotRef, data.payments)
  const parcelasAtual = countPaidParcelas(lotRef, data.payments)
  const totalPagoParcAtual = totalPagoEmParcelas(lotRef, data.payments)
  const totalVendaAtual = lotRef.totalValue

  const entradaNova =
    row.entrada != null
      ? row.entrada !== entradaAtual && entradaInst
        ? `manter expected ${entradaAtual}→${row.entrada}? só se vazio`
        : row.entrada
      : '—'
  const parcelasDepois = row.parcelasPagas ?? parcelasAtual
  const totalPagoParcDepois = row.totalPagoParcelas ?? totalPagoParcAtual
  const totalVendaDepois = row.totalVenda ?? totalVendaAtual

  const changes: string[] = []
  if (row.totalVenda != null && row.totalVenda !== totalVendaAtual) changes.push('totalVenda')
  if (row.entrada != null && row.entrada !== entradaAtual) changes.push('entrada(expected)')
  if (row.parcelasPagas != null && row.parcelasPagas !== parcelasAtual) changes.push('ajuste estado parcelas')
  if (row.totalPagoParcelas != null && row.totalPagoParcelas !== totalPagoParcAtual) changes.push('ajuste total pago parc')

  let acao = changes.length ? 'ATUALIZAR' : 'SEM ALTERAÇÃO'
  if (conflict) acao = `ATUALIZAR* (${conflict})`

  // User rules: don't change entrada date; if entrada exists don't change date
  // If entrada amount exists and table differs - flag for review
  if (row.entrada != null && entradaInst && row.entrada !== entradaAtual && entradaPaga > 0) {
    acao = 'CONFLITO/REVISÃO MANUAL (entrada já registrada — não alterar data; valor expected só se vazio)'
  } else if (row.entrada != null && !entradaInst) {
    changes.push('criar entrada (sem data nova)')
  }

  const obs = conflict ?? ''

  return {
    cliente: `${row.clientName} → ${clientRef.name}`,
    lote: `${lotLabel} (Q${lotRef.quadra} L${lotRef.lote})`,
    encontrado: 'SIM',
    clientId: clientRef.id.slice(0, 8) + '…',
    lotId: lotRef.id.slice(0, 8) + '…',
    dataEntrada: getEntradaDate(lotRef),
    entradaAtual,
    entradaNova: row.entrada ?? '—',
    parcelasAtual,
    parcelasDepois,
    totalPagoParcAtual,
    totalPagoParcDepois,
    totalVendaAtual,
    totalVendaDepois,
    acao: changes.length ? `${acao} [${changes.join(', ')}]` : acao,
    observacao: obs,
  }
}

function planWithNote(
  row: TableRow,
  lotNum: string,
  res: ReturnType<typeof findLotByClientAndNumber>,
): ReportLine {
  const line = planLotUpdate(row, lotNum, res.client, res.lot, res.conflict)
  if (res.note) {
    line.observacao = [res.note, line.observacao].filter(Boolean).join(' | ')
    if (res.lot && !res.conflict && String(line.acao).startsWith('CONFLITO')) {
      /* keep conflict */
    } else if (res.lot && res.note.includes('≠')) {
      line.acao = String(line.acao).replace('SEM ALTERAÇÃO', 'ATUALIZAR') + ' [renumerar lote?]'
    }
  }
  return line
}

const reports: ReportLine[] = []

for (const row of TABLE) {
  if (row.clientName === 'Raimundo' && row.lotNumbers === null) {
    const { client, lot, conflict } = resolveRaimundo()
    reports.push(planLotUpdate(row, '(n/i)', client, lot, conflict))
    continue
  }
  const lots = row.lotNumbers ?? ['?']
  lots.forEach((lotNum, lotIndex) => {
    const res = findLotByClientAndNumber(row.clientName, lotNum, row, lotIndex)
    reports.push(planWithNote(row, lotNum, res))
  })
}

console.log('\n=== MODELO DE DADOS (referência) ===')
console.log('Client → Lot (quadra, lote, totalValue, installments[], payments[])')
console.log('Entrada = parcela label "Entrada" / number 0 (dueDate = data referência; NÃO alterar se existir)')
console.log('Pagamentos = registros em payments[]; paidAmount derivado de payments')
console.log('Parcelas pagas (relatório) = parcelas não-entrada com saldo zero\n')

console.log('=== DRY-RUN — nenhuma alteração feita ===\n')
console.table(reports)

const summary = {
  total_linhas: reports.length,
  sim: reports.filter((r) => r.encontrado === 'SIM').length,
  criar: reports.filter((r) => String(r.acao).startsWith('CRIAR')).length,
  atualizar: reports.filter((r) => String(r.acao).startsWith('ATUALIZAR')).length,
  sem: reports.filter((r) => String(r.acao).startsWith('SEM')).length,
  conflito: reports.filter((r) => String(r.acao).includes('CONFLITO')).length,
}
console.log('\nResumo:', summary)
