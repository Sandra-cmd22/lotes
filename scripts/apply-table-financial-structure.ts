/**
 * Ajusta total, entrada (planilha) e grade de parcelas,
 * preservando datas históricas do Firestore.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AppData, Installment, Lot, Payment } from '../src/types/index.ts'
import {
  generateInstallments,
  linkPaymentsToInstallments,
  syncInstallmentPaidAmounts,
} from '../src/lib/calculations.ts'
import { addMonths } from '../src/lib/dates.ts'
import { createId } from '../src/lib/id.ts'
import { roundMoney } from '../src/lib/money.ts'
import { TABLE_ROWS, type TableRow } from './table-spec.ts'
import { findLotsForRow, isJonasSplit } from './table-lot-utils.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_PATH = join(root, 'public/dados-loteamento.json')

const log: string[] = []

function getEntradaInst(lot: Lot): Installment | undefined {
  return lot.installments.find((i) => i.label === 'Entrada' || i.number === 0)
}

/** Parcela mensal: planilha (total pago − entrada) ÷ parcelas pagas, senão faixa do lote. */
export function inferParcelAmount(totalValue: number, row?: TableRow): number {
  if (
    row?.parcelasPagas &&
    row.parcelasPagas > 0 &&
    row.totalPagoParcelas != null &&
    row.entrada != null &&
    row.totalPagoParcelas >= row.entrada
  ) {
    const rest = roundMoney(row.totalPagoParcelas - row.entrada)
    if (rest > 0) {
      const fromTable = roundMoney(rest / row.parcelasPagas)
      if (fromTable >= 200 && fromTable <= 1200) return fromTable
    }
  }
  if (totalValue >= 80_000) return 1000
  if (totalValue >= 24_000 && totalValue <= 26_000) return 300
  if (totalValue >= 29_000 && totalValue <= 31_000) return 300
  return 250
}

function resolveEntradaDate(lot: Lot, payments: Payment[]): string {
  const ent = getEntradaInst(lot)
  if (ent?.dueDate) return ent.dueDate
  const entPay = payments
    .filter((p) => p.lotId === lot.id && /entrada/i.test(p.description) && p.date)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))[0]
  if (entPay?.date) return entPay.date
  const parcels = lot.installments
    .filter((i) => i.label !== 'Entrada' && i.number !== 0 && i.number != null)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  if (parcels[0]?.dueDate) return parcels[0].dueDate
  return lot.createdAt.slice(0, 10)
}

function resolveFirstParcelDate(entradaDate: string, lot: Lot): string {
  const parcels = lot.installments
    .filter((i) => i.number != null && i.number > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  if (parcels[0]?.dueDate) return parcels[0].dueDate
  return addMonths(entradaDate, 1)
}

function financialForLotRecord(
  row: TableRow,
  lot: Lot,
): { totalValue: number; entrada: number | null } {
  const n = row.lotNumbers?.length ?? 1

  if (row.entradaPg) {
    return { totalValue: row.totalVenda ?? lot.totalValue, entrada: null }
  }

  let totalValue = row.totalVenda ?? lot.totalValue
  let entrada: number | null = row.entrada

  if (isJonasSplit(row)) {
    totalValue = roundMoney((row.totalVenda ?? 100_000) / n)
    entrada = row.entrada != null ? roundMoney(row.entrada / n) : null
  } else if (
    row.clientName === 'Marquinhos' &&
    row.lotNumbers &&
    n > 1 &&
    !lot.lote.includes(',')
  ) {
    totalValue = roundMoney((row.totalVenda ?? 40_000) / n)
    entrada = row.entrada != null ? roundMoney(row.entrada / n) : null
  } else if (row.lotNumbers && n > 1 && !lot.lote.includes(',') && !isJonasSplit(row)) {
    totalValue = roundMoney((row.totalVenda ?? totalValue) / n)
    entrada = row.entrada != null ? roundMoney(row.entrada / n) : null
  }

  if (row.clientName === 'Barroso' && row.entrada == null) entrada = 0
  if (row.clientName === 'Denir' && row.entrada === 0) entrada = 0

  return { totalValue, entrada }
}

function remapPaymentsToInstallments(
  lotId: string,
  oldInstallments: Installment[],
  newInstallments: Installment[],
  payments: Payment[],
): Payment[] {
  const oldById = new Map(oldInstallments.map((i) => [i.id, i]))

  return payments.map((p) => {
    if (p.lotId !== lotId) return p

    let num: number | undefined
    let isEntrada = false

    if (p.installmentId) {
      const old = oldById.get(p.installmentId)
      if (old) {
        num = old.number
        isEntrada = old.label === 'Entrada' || old.number === 0
      }
    }
    if (num == null && /entrada/i.test(p.description)) isEntrada = true
    const m = p.description.match(/parcela\s*(\d+)/i)
    if (m) num = parseInt(m[1], 10)

    let target: Installment | undefined
    if (isEntrada) {
      target = newInstallments.find((i) => i.label === 'Entrada' || i.number === 0)
    } else if (num != null && num > 0) {
      target = newInstallments.find((i) => i.number === num)
    }

    if (!target) return { ...p, installmentId: undefined }
    return { ...p, installmentId: target.id }
  })
}

function rebuildLotInstallments(
  lot: Lot,
  payments: Payment[],
  totalValue: number,
  entradaAmount: number,
  row: TableRow,
): Installment[] {
  const entradaDate = resolveEntradaDate(lot, payments)
  const parcelAmount = inferParcelAmount(totalValue, row)
  const saldo = roundMoney(Math.max(0, totalValue - entradaAmount))
  let parcelCount = 0
  if (saldo > 0 && parcelAmount > 0) {
    parcelCount = Math.max(1, Math.ceil(saldo / parcelAmount))
  }
  const firstParcelDate = resolveFirstParcelDate(entradaDate, lot)

  return generateInstallments({
    totalValue,
    entradaAmount,
    entradaDate,
    firstParcelDate,
    periodicity: 'mensal',
    parcelCount,
    parcelAmount,
  }).map((inst) => ({
    ...inst,
    id: createId(),
  }))
}

function applyRowToLot(data: AppData, row: TableRow, lot: Lot) {
  const client = data.clients.find((c) => c.id === lot.clientId)!
  const { totalValue, entrada } = financialForLotRecord(row, lot)

  if (row.entradaPg) {
    lot.totalValue = totalValue
    lot.paymentType = 'parcelado'
    lot.installments = []
    log.push(`${client.name} L${lot.lote}: quitado (PG) — total R$ ${totalValue}`)
    return
  }

  const entradaAmount =
    entrada == null ? roundMoney(getEntradaInst(lot)?.expectedAmount ?? 0) : roundMoney(Math.max(0, entrada))

  const oldInstallments = lot.installments
  lot.totalValue = totalValue
  lot.installments = rebuildLotInstallments(lot, data.payments, totalValue, entradaAmount, row)
  if (entradaAmount > 0 && !getEntradaInst(lot)) {
    lot.installments.unshift({
      id: createId(),
      number: 0,
      label: 'Entrada',
      dueDate: lot.createdAt.slice(0, 10),
      expectedAmount: entradaAmount,
      paidAmount: 0,
    })
  }
  data.payments = remapPaymentsToInstallments(lot.id, oldInstallments, lot.installments, data.payments)
  lot.installments = syncInstallmentPaidAmounts(lot, data.payments)

  const parcelAmt = inferParcelAmount(totalValue, row)
  log.push(
    `${client.name} L${lot.lote}: total R$ ${totalValue}, entrada R$ ${entradaAmount}, parcela R$ ${parcelAmt} × ${lot.installments.filter((i) => i.number && i.number > 0).length}`,
  )
}

export function applyTableFinancialStructure(data: AppData): AppData {
  for (const row of TABLE_ROWS) {
    const lots = findLotsForRow(data, row)
    if (lots.length === 0) {
      log.push(`⚠ ${row.clientName}: nenhum lote encontrado`)
      continue
    }
    for (const lot of lots) {
      applyRowToLot(data, row, lot)
    }
  }
  return linkPaymentsToInstallments(data)
}

export function getFinancialStructureLog(): string[] {
  return log
}

const write = process.argv.includes('--write')
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('apply-table-financial-structure.ts')) {
  const data = JSON.parse(readFileSync(DATA_PATH, 'utf8')) as AppData
  const result = applyTableFinancialStructure(structuredClone(data))

  console.log('Estrutura financeira (planilha + parcelas):\n')
  log.forEach((l) => console.log(' •', l))

  if (write) {
    writeFileSync(DATA_PATH, JSON.stringify(result, null, 2) + '\n', 'utf8')
    console.log('\nGravado:', DATA_PATH)
  } else {
    console.log('\nDry-run. Use --write para gravar.')
  }
}
