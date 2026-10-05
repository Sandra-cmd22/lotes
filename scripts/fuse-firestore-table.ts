/**
 * Fusão: Firestore (histórico) + planilha atual → public/dados-loteamento.json
 *
 * - Preserva pagamentos e datas do Firestore
 * - Não inventa pagamentos para bater totais da planilha
 * - Números de lote e valores atuais vêm da planilha quando há match seguro
 *
 * Uso: npx tsx scripts/fuse-firestore-table.ts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AppData, Client, Installment, Lot, Payment } from '../src/types/index.ts'
import {
  generateInstallments,
  linkPaymentsToInstallments,
  normalizeName,
  syncInstallmentPaidAmounts,
} from '../src/lib/calculations.ts'
import { daysBetween } from '../src/lib/dates.ts'
import { parseFirestoreBackup } from '../src/lib/importFirestoreBackup.ts'
import { applyEntradaAsPaid } from '../src/lib/migrations.ts'
import { createId } from '../src/lib/id.ts'
import { nearlyZero, roundMoney } from '../src/lib/money.ts'
import {
  CLIENT_RENAMES,
  LOT_RENUMBER,
  TABLE_ROWS,
  type TableRow,
} from './table-spec.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const FIRESTORE_PATH = join(root, 'public/backup_banco.json')
const DATA_PATH = join(root, 'public/dados-loteamento.json')
const AS_OF = new Date().toISOString().slice(0, 10)

const log: string[] = []
const conflicts: string[] = []

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '')
}

function nameKey(name: string): string {
  return stripAccents(normalizeName(name))
}

function normLot(n: string): string {
  return n.trim().replace(/^0+/, '') || '0'
}

function lotsMatch(a: string, b: string): boolean {
  return normLot(a) === normLot(b) || a.trim() === b.trim()
}

function nameMatches(tableName: string, clientName: string): boolean {
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

function findClients(data: AppData, name: string): Client[] {
  return data.clients.filter((c) => nameMatches(name, c.name))
}

function findClient(data: AppData, name: string): Client | undefined {
  const list = findClients(data, name)
  return list.length === 1 ? list[0] : undefined
}

function ensureClient(data: AppData, name: string): Client {
  let c = findClient(data, name)
  if (c) return c
  c = {
    id: createId(),
    name,
    createdAt: AS_OF,
  }
  data.clients.push(c)
  log.push(`Novo cliente: ${name}`)
  return c
}

function lotExists(data: AppData, clientId: string, lote: string): boolean {
  return data.lots.some((l) => l.clientId === clientId && l.lote === lote)
}

function getEntradaInst(lot: Lot): Installment | undefined {
  return lot.installments.find((i) => i.label === 'Entrada' || i.number === 0)
}

function appendPlanilhaNote(lot: Lot, row: TableRow) {
  const parts: string[] = []
  if (row.parcelasPagas != null) parts.push(`parcelasPagas=${row.parcelasPagas}`)
  if (row.totalPagoParcelas != null) parts.push(`totalPagoParcelas=${row.totalPagoParcelas}`)
  if (row.entradaPg) parts.push('entrada=PG (quitado planilha)')
  if (parts.length === 0) return
  const tag = `[planilha ${AS_OF}: ${parts.join('; ')}]`
  if (lot.notes?.includes(tag)) return
  lot.notes = lot.notes ? `${lot.notes}\n${tag}` : tag
}

function loadFromFirestore(): AppData {
  const raw = JSON.parse(readFileSync(FIRESTORE_PATH, 'utf8')) as Record<string, unknown>
  const warnings: string[] = []
  const empty: AppData = { clients: [], lots: [], payments: [], version: 1 }
  const preview = parseFirestoreBackup(raw, empty, warnings)
  warnings.forEach((w) => log.push(`Firestore: ${w}`))
  return {
    clients: preview.clients,
    lots: preview.lots,
    payments: preview.payments,
    version: 1,
  }
}

function applyRenames(data: AppData) {
  for (const { from, to } of CLIENT_RENAMES) {
    const c = data.clients.find((x) => x.name === from)
    if (c) {
      c.name = to
      log.push(`Nome: ${from} → ${to}`)
    }
  }
}

/** Lote 03: histórico do Firestore (Antonio) passa para Deurismar; Antonio é removido. */
function mergeAntonioIntoDeurismar(data: AppData) {
  const antonio = data.clients.find((c) => nameKey(c.name).includes('antonio glauber'))
  if (!antonio) return

  const antLot = data.lots.find((l) => l.clientId === antonio.id && l.lote === '03')
  const deurismar = ensureClient(data, 'Deurismar')

  if (antLot) {
    for (const dup of data.lots.filter((l) => l.clientId === deurismar.id && l.id !== antLot.id)) {
      data.lots = data.lots.filter((l) => l.id !== dup.id)
      data.payments = data.payments.filter((p) => p.lotId !== dup.id)
      log.push(`Removido lote duplicado Deurismar L${dup.lote} (cadastro planilha)`)
    }
    antLot.clientId = deurismar.id
    for (const p of data.payments) {
      if (p.clientId === antonio.id || p.lotId === antLot.id) {
        p.clientId = deurismar.id
      }
    }
    const row = TABLE_ROWS.find((r) => r.clientName === 'Deurismar')
    if (row?.entrada && row.entrada > 0 && !getEntradaInst(antLot)) {
      const parcelDates = antLot.installments
        .filter((i) => i.label !== 'Entrada' && i.number !== 0)
        .map((i) => i.dueDate)
        .filter(Boolean)
        .sort()
      const entradaDate = parcelDates[0] ?? AS_OF
      antLot.installments.unshift({
        id: createId(),
        number: 0,
        label: 'Entrada',
        dueDate: entradaDate,
        expectedAmount: row.entrada,
        paidAmount: 0,
      })
      log.push(`Deurismar L03: parcela Entrada R$ ${row.entrada} (data ${entradaDate})`)
    }
    log.push('Antonio Glauber removido → Deurismar L03 (histórico Firestore preservado)')
  } else {
    log.push('Antonio Glauber removido (sem lote 03 no Firestore)')
  }

  data.clients = data.clients.filter((c) => c.id !== antonio.id)
  data.payments = data.payments.filter((p) => p.clientId !== antonio.id)
}

function applyLotRenumber(data: AppData) {
  for (const map of LOT_RENUMBER) {
    const client = findClient(data, map.clientMatch)
    if (!client) continue
    const lot = data.lots.find(
      (l) =>
        l.clientId === client.id &&
        (l.lote === map.fromLote ||
          l.lote.replace(/^0+/, '') === map.fromLote.replace(/^0+/, '') ||
          l.lote === map.fromLote),
    )
    if (lot && lot.lote !== map.toLote) {
      const old = lot.lote
      lot.lote = map.toLote
      log.push(`${map.clientMatch}: lote ${old} → ${map.toLote}`)
    }
  }
}

function resolveRaimundoLot(data: AppData): Lot | undefined {
  const client = findClient(data, 'Raimundo')
  if (!client) return undefined
  const lots = data.lots.filter((l) => l.clientId === client.id)
  if (lots.length === 0) return undefined
  if (lots.length === 1) return lots[0]
  const byTotal = lots.find((l) => l.totalValue === 90000)
  if (byTotal) {
    conflicts.push(
      `Raimundo: ${lots.length} lotes no Firestore — usando o de total R$ 90.000 (L${byTotal.lote}); demais mantidos.`,
    )
    return byTotal
  }
  conflicts.push(`Raimundo: ${lots.length} lotes — revisão manual`)
  return lots[0]
}

function applyRaimundo(data: AppData, row: TableRow) {
  const lot = resolveRaimundoLot(data)
  if (!lot) {
    conflicts.push('Raimundo: sem lote no Firestore')
    return
  }
  const prev = lot.lote
  lot.lote = '—'
  log.push(`Raimundo: sem nº na planilha (L${prev} → —)`)
  applyFinancialFromTable(data, lot, row)
}

function isSplitMultiLotRow(row: TableRow): boolean {
  return row.clientName === 'Jonas' && (row.lotNumbers?.length ?? 0) > 1
}

function rowTotalsForLot(row: TableRow, lotNum: string, lot: Lot): TableRow {
  if (!isSplitMultiLotRow(row) || !row.lotNumbers) return row
  const n = row.lotNumbers.length
  return {
    ...row,
    entrada: row.entrada != null ? roundMoney(row.entrada / n) : null,
    totalVenda: row.totalVenda != null ? roundMoney(row.totalVenda / n) : null,
    parcelasPagas: null,
    totalPagoParcelas: null,
  }
}

function findLotForTableRow(
  data: AppData,
  row: TableRow,
  lotNum: string,
  lotIndex: number,
): { client?: Client; lot?: Lot } {
  if (row.clientName === 'Raimundo' && row.lotNumbers === null) {
    const client = findClient(data, 'Raimundo')
    return { client, lot: resolveRaimundoLot(data) }
  }

  const clients = findClients(data, row.clientName)
  if (clients.length > 1) {
    conflicts.push(`"${row.clientName}": ${clients.length} homônimos`)
    return {}
  }
  const client = clients[0]

  if (client) {
    let lot = data.lots.find(
      (l) => l.clientId === client.id && (lotsMatch(l.lote, lotNum) || l.lote.includes(lotNum)),
    )
    const clientLots = data.lots.filter((l) => l.clientId === client.id)
    if (
      !lot &&
      clientLots.length === 1 &&
      lotIndex === 0 &&
      (row.lotNumbers?.length ?? 1) === 1 &&
      lotsMatch(clientLots[0].lote, lotNum)
    ) {
      lot = clientLots[0]
    }
    if (!lot && clientLots.length > 1 && row.lotNumbers && row.lotNumbers.length > 1) {
      const sortedDb = [...clientLots].sort((a, b) => normLot(a.lote).localeCompare(normLot(b.lote)))
      const sortedTable = [...row.lotNumbers].sort((a, b) => normLot(a).localeCompare(normLot(b)))
      const idx = sortedTable.findIndex((n) => lotsMatch(n, lotNum))
      if (idx >= 0 && sortedDb[idx]) lot = sortedDb[idx]
    }
    if (lot) return { client, lot }
  }

  const byNumber = data.lots.filter((l) => lotsMatch(l.lote, lotNum))
  if (byNumber.length === 1) {
    const owner = data.clients.find((c) => c.id === byNumber[0].clientId)
    if (!client) {
      return {}
    }
    if (owner && owner.id !== client.id) {
      conflicts.push(
        `L${lotNum}: planilha "${row.clientName}" ≠ Firestore "${owner.name}" — lotes não unificados`,
      )
      return { client }
    }
    return { client, lot: byNumber[0] }
  }

  return { client }
}

function createLotShell(
  data: AppData,
  client: Client,
  lote: string,
  row: TableRow,
  opts?: { splitCount?: number; splitIndex?: number },
): Lot {
  const splits = opts?.splitCount ?? 1
  const idx = opts?.splitIndex ?? 0
  const totalVenda =
    row.totalVenda != null ? roundMoney(row.totalVenda / splits) : roundMoney(20000 / splits)
  let entrada = 0
  if (row.entradaPg) {
    /* sem entrada */
  } else if (row.entrada != null && row.entrada > 0) {
    entrada = roundMoney(row.entrada / splits)
  }
  const saldo = roundMoney(Math.max(0, totalVenda - entrada))
  const parcelCount = saldo > 0 ? Math.max(1, Math.round(saldo / 250)) : 0
  const parcelAmount = parcelCount > 0 ? roundMoney(saldo / parcelCount) : 0

  const lot: Lot = {
    id: createId(),
    clientId: client.id,
    quadra: '—',
    lote,
    totalValue: totalVenda,
    paymentType: 'parcelado',
    installments:
      row.entradaPg || totalVenda <= 0
        ? []
        : generateInstallments({
            totalValue: totalVenda,
            entradaAmount: entrada,
            entradaDate: AS_OF,
            firstParcelDate: AS_OF,
            periodicity: 'mensal',
            parcelCount,
            parcelAmount,
          }),
    notes: row.entradaPg
      ? 'Quitado na planilha (PG). Sem entrada/datas detalhadas — não inventar pagamentos.'
      : splits > 1
        ? `Cadastro planilha (${idx + 1}/${splits}) — datas de parcelas provisórias até confirmação.`
        : 'Cadastro planilha — datas de parcelas provisórias até confirmação.',
    createdAt: AS_OF,
  }
  data.lots.push(lot)
  log.push(`Novo lote: ${client.name} L${lote}`)
  return lot
}

function ensureTableLots(data: AppData) {
  for (const row of TABLE_ROWS) {
    if (row.clientName === 'Raimundo' && row.lotNumbers === null) continue

    const lotNums = row.lotNumbers ?? []
    const splitCount = lotNums.length || 1

    lotNums.forEach((lotNum, lotIndex) => {
      const { client, lot } = findLotForTableRow(data, row, lotNum, lotIndex)
      if (lot) return

      const c = client ?? ensureClient(data, row.clientName)
      if (lotExists(data, c.id, lotNum)) return

      if (row.lotNumbers && row.lotNumbers.length > 1 && row.clientName === 'Jonas') {
        createLotShell(data, c, lotNum, row, { splitCount, splitIndex: lotIndex })
      } else if (row.lotNumbers && row.lotNumbers.length > 1 && !isSplitMultiLotRow(row) && lotIndex === 0) {
        createLotShell(data, c, row.lotNumbers.join(','), row)
      } else if (
        row.lotNumbers &&
        row.lotNumbers.length > 1 &&
        !isSplitMultiLotRow(row) &&
        lotIndex > 0
      ) {
        /* lote combinado já criado */
      } else {
        createLotShell(data, c, lotNum, row, isSplitMultiLotRow(row)
          ? { splitCount: row.lotNumbers!.length, splitIndex: lotIndex }
          : undefined)
      }
    })
  }
}

function applyFinancialFromTable(data: AppData, lot: Lot, row: TableRow) {
  appendPlanilhaNote(lot, row)

  if (row.totalVenda != null && row.totalVenda !== lot.totalValue) {
    const combined =
      row.lotNumbers &&
      row.lotNumbers.length > 1 &&
      lot.lote.includes(',') &&
      !isSplitMultiLotRow(row)
    const splitHalf =
      row.lotNumbers &&
      row.lotNumbers.length > 1 &&
      !lot.lote.includes(',') &&
      !isSplitMultiLotRow(row) &&
      row.clientName === 'Marquinhos'
    const target = splitHalf ? roundMoney(row.totalVenda / row.lotNumbers.length) : row.totalVenda
    if (combined || !row.lotNumbers || row.lotNumbers.length <= 1 || isSplitMultiLotRow(row)) {
      if (target !== lot.totalValue) {
        log.push(`${lot.lote}: totalVenda ${lot.totalValue} → ${target}`)
        lot.totalValue = target
      }
    }
  }

  if (row.entradaPg) return

  if (row.entrada == null) return

  let entradaTarget = row.entrada
  if (
    row.lotNumbers &&
    row.lotNumbers.length > 1 &&
    !lot.lote.includes(',') &&
    !isSplitMultiLotRow(row) &&
    row.clientName === 'Marquinhos'
  ) {
    entradaTarget = roundMoney(row.entrada / row.lotNumbers.length)
  }

  const entradaInst = getEntradaInst(lot)
  if (entradaInst) {
    if (entradaTarget !== entradaInst.expectedAmount) {
      const paid = syncInstallmentPaidAmounts(lot, data.payments).find((i) => i.id === entradaInst.id)
        ?.paidAmount
      if (paid && paid > 0 && !nearlyZero(paid - entradaInst.expectedAmount)) {
        conflicts.push(
          `${lot.lote}: entrada planilha R$ ${entradaTarget} ≠ Firestore R$ ${entradaInst.expectedAmount} (já paga R$ ${paid}) — expected atualizado; pagamentos históricos intactos`,
        )
      }
      entradaInst.expectedAmount = entradaTarget
      log.push(
        `${lot.lote}: entrada expected → R$ ${entradaTarget} (data ${entradaInst.dueDate} preservada)`,
      )
    }
  } else if (entradaTarget > 0) {
    const dueDate = getEntradaInst(lot)?.dueDate ?? lot.createdAt.slice(0, 10)
    lot.installments.unshift({
      id: createId(),
      number: 0,
      label: 'Entrada',
      dueDate,
      expectedAmount: entradaTarget,
      paidAmount: 0,
    })
    log.push(
      `${lot.lote}: parcela Entrada R$ ${entradaTarget} criada (data ${dueDate}, planilha)`,
    )
  }
}

function applyTableUpdates(data: AppData) {
  for (const row of TABLE_ROWS) {
    if (row.clientName === 'Raimundo' && row.lotNumbers === null) {
      applyRaimundo(data, row)
      continue
    }
    const lotNums = row.lotNumbers ?? []
    lotNums.forEach((lotNum, lotIndex) => {
      const { lot } = findLotForTableRow(data, row, lotNum, lotIndex)
      if (lot) applyFinancialFromTable(data, lot, rowTotalsForLot(row, lotNum, lot))
    })
  }
}

function matchesEmDiaTable(clientName: string): boolean {
  return TABLE_ROWS.some(
    (r) => r.emDia && nameMatches(r.clientName, clientName),
  )
}

function matchesFernando(clientName: string): boolean {
  return nameKey(clientName).includes('fernando')
}

/** Marca vencidas como pagas usando dueDate existente (não inventa datas novas). */
function applyEmDiaFromTable(data: AppData): AppData {
  let payments: Payment[] = [...data.payments]

  const lots = data.lots.map((lot) => {
    const client = data.clients.find((c) => c.id === lot.clientId)
    if (!client) return lot

    const isEmDia = matchesEmDiaTable(client.name)
    const isFernando = matchesFernando(client.name)
    if (!isEmDia && !isFernando) return lot

    let installments = syncInstallmentPaidAmounts(lot, payments)

    for (const inst of installments) {
      if (inst.label === 'Entrada' || inst.number === 0) continue
      const due = roundMoney(inst.expectedAmount - inst.paidAmount)
      if (due <= 0) continue
      if (inst.dueDate >= AS_OF) continue

      if (isEmDia) {
        if (!payments.some((p) => p.lotId === lot.id && p.installmentId === inst.id)) {
          payments.push({
            id: createId(),
            clientId: lot.clientId,
            lotId: lot.id,
            date: inst.dueDate,
            amount: due,
            description: inst.label,
            installmentId: inst.id,
            note: 'Ajuste planilha: em dia',
            createdAt: new Date().toISOString(),
          })
        }
      }

      if (isFernando) {
        const overdueOpen = installments.filter(
          (i) =>
            i.label !== 'Entrada' &&
            i.number !== 0 &&
            i.dueDate < AS_OF &&
            roundMoney(i.expectedAmount - i.paidAmount) > 0,
        )
        const keepOpen = overdueOpen.reduce<(typeof overdueOpen)[0] | undefined>((best, cur) => {
          const days = daysBetween(cur.dueDate, AS_OF)
          if (!best) return cur
          const bestDays = daysBetween(best.dueDate, AS_OF)
          return Math.abs(days - 30) < Math.abs(bestDays - 30) ? cur : best
        }, undefined)
        if (keepOpen && inst.id !== keepOpen.id) {
          const amountDue = roundMoney(inst.expectedAmount - inst.paidAmount)
          if (
            amountDue > 0 &&
            !payments.some((p) => p.lotId === lot.id && p.installmentId === inst.id)
          ) {
            payments.push({
              id: createId(),
              clientId: lot.clientId,
              lotId: lot.id,
              date: inst.dueDate,
              amount: amountDue,
              description: inst.label,
              installmentId: inst.id,
              note: 'Ajuste: regularizado (Fernando)',
              createdAt: new Date().toISOString(),
            })
          }
        }
      }
    }

    installments = syncInstallmentPaidAmounts(lot, payments)
    return { ...lot, installments }
  })

  return { ...data, lots, payments }
}

export function run(): AppData {
  log.push('=== Fusão Firestore + planilha ===')
  let data = loadFromFirestore()
  log.push(
    `Firestore importado: ${data.clients.length} clientes, ${data.lots.length} lotes, ${data.payments.length} pagamentos`,
  )

  data = applyEntradaAsPaid(data)
  applyRenames(data)
  applyLotRenumber(data)
  mergeAntonioIntoDeurismar(data)
  ensureTableLots(data)
  applyTableUpdates(data)
  data = linkPaymentsToInstallments(data)

  return data
}

const write = process.argv.includes('--write')
const isMain = process.argv[1]?.includes('fuse-firestore-table')
const result = isMain ? run() : (null as unknown as AppData)

if (isMain) {
  console.log('\n--- Log ---')
  log.forEach((l) => console.log(' •', l))
  if (conflicts.length) {
    console.log('\n--- ⚠️ Revisão manual ---')
    conflicts.forEach((c) => console.log(' •', c))
  }
  console.log(
    '\nResultado:',
    result.clients.length,
    'clientes,',
    result.lots.length,
    'lotes,',
    result.payments.length,
    'pagamentos',
  )

  if (write) {
    writeFileSync(DATA_PATH, JSON.stringify(result, null, 2) + '\n', 'utf8')
    console.log('\nGravado:', DATA_PATH)
  } else {
    console.log('\nDry-run (nenhum arquivo alterado). Use --write para gravar dados-loteamento.json')
  }
}
