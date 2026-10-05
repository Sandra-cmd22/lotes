/**
 * Alinha pagamentos à planilha:
 * - coluna Entrada preenchida → entrada paga (payments[])
 * - parcelas pagas → parcelas em payments[]
 * - preserva datas do Firestore; não inventa data de entrada
 */
import type { AppData, Lot, Payment } from '../src/types/index.ts'
import { linkPaymentsToInstallments, syncInstallmentPaidAmounts } from '../src/lib/calculations.ts'
import { createId } from '../src/lib/id.ts'
import { roundMoney } from '../src/lib/money.ts'
import { TABLE_ROWS, type TableRow } from './table-spec.ts'
import { findLotsForRow } from './table-lot-utils.ts'

const log: string[] = []

function getEntradaInst(lot: Lot) {
  return lot.installments.find((i) => i.label === 'Entrada' || i.number === 0)
}

function monthlyInstallments(lot: Lot) {
  return lot.installments
    .filter((i) => i.number != null && i.number > 0)
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
}

function collectHistorical(lotId: string, payments: Payment[]) {
  const byParcel = new Map<number, Payment>()
  let entrada: Payment | undefined
  for (const p of payments.filter((x) => x.lotId === lotId)) {
    if (p.note?.includes('Ajuste')) continue
    if (/entrada/i.test(p.description)) {
      entrada = p
      continue
    }
    const m = p.description.match(/parcela\s*(\d+)/i)
    if (m) byParcel.set(parseInt(m[1], 10), p)
  }
  return { byParcel, entrada }
}

function planPaidState(
  row: TableRow,
  lot: Lot,
): { payEntrada: boolean; parcelCount: number } {
  const entradaInst = getEntradaInst(lot)
  const entradaAmt = roundMoney(entradaInst?.expectedAmount ?? 0)
  const nParc = row.parcelasPagas ?? 0

  const payEntrada = entradaAmt > 0

  return { payEntrada, parcelCount: nParc }
}

/** Orçamento só para valores de parcelas quando a coluna total pago está preenchida. */
function parcelBudgetFromTable(
  row: TableRow,
  lot: Lot,
  payEntrada: boolean,
  parcelCount: number,
): number | null {
  const totalPago = row.totalPagoParcelas
  if (totalPago == null || parcelCount <= 0) return null

  const entradaInst = getEntradaInst(lot)
  const entradaAmt = payEntrada && entradaInst ? roundMoney(entradaInst.expectedAmount) : 0

  if (entradaAmt > 0 && totalPago >= entradaAmt) {
    return roundMoney(totalPago - entradaAmt)
  }

  // Total menor que a entrada: coluna reflete só parcelas (ex.: Davi R$ 250)
  return roundMoney(totalPago)
}

function pushEntradaPayment(
  data: AppData,
  lot: Lot,
  clientId: string,
  entradaInst: NonNullable<ReturnType<typeof getEntradaInst>>,
  histEntrada: Payment | undefined,
) {
  const payment: Payment = {
    id: createId(),
    clientId,
    lotId: lot.id,
    amount: roundMoney(entradaInst.expectedAmount),
    description: 'Entrada',
    installmentId: entradaInst.id,
    createdAt: histEntrada?.createdAt ?? new Date().toISOString(),
  }
  if (histEntrada?.date) payment.date = histEntrada.date
  data.payments.push(payment)
}

function syncLotPayments(data: AppData, row: TableRow, lot: Lot) {
  const clientId = lot.clientId
  const { byParcel, entrada: histEntrada } = collectHistorical(lot.id, data.payments)

  data.payments = data.payments.filter((p) => p.lotId !== lot.id)

  if (row.entradaPg) {
    data.payments.push({
      id: createId(),
      clientId,
      lotId: lot.id,
      date: lot.createdAt.slice(0, 10),
      amount: lot.totalValue,
      description: 'Quitação (planilha PG)',
      createdAt: new Date().toISOString(),
    })
    log.push(`${row.clientName} L${lot.lote}: quitado PG`)
    return
  }

  const entradaInst = getEntradaInst(lot)
  const monthly = monthlyInstallments(lot)
  const { payEntrada, parcelCount } = planPaidState(row, lot)

  if (payEntrada && entradaInst && entradaInst.expectedAmount > 0) {
    pushEntradaPayment(data, lot, clientId, entradaInst, histEntrada)
  }

  let budget = parcelBudgetFromTable(row, lot, payEntrada, parcelCount)

  for (let i = 0; i < parcelCount; i++) {
    const inst = monthly[i]
    if (!inst) break
    const hist = byParcel.get(inst.number!)
    let amount = roundMoney(inst.expectedAmount)
    if (budget != null) {
      amount = roundMoney(Math.min(amount, Math.max(0, budget)))
      budget = roundMoney(budget - amount)
    }
    const payment: Payment = {
      id: createId(),
      clientId,
      lotId: lot.id,
      amount,
      description: inst.label,
      installmentId: inst.id,
      createdAt: hist?.createdAt ?? new Date().toISOString(),
    }
    if (hist?.date) payment.date = hist.date
    else if (inst.dueDate) payment.date = inst.dueDate
    data.payments.push(payment)
  }

  const client = data.clients.find((c) => c.id === clientId)
  const paid = data.payments
    .filter((p) => p.lotId === lot.id)
    .reduce((s, p) => s + p.amount, 0)
  log.push(
    `${client?.name ?? row.clientName} L${lot.lote}: ${data.payments.filter((p) => p.lotId === lot.id).length} pag. = R$ ${roundMoney(paid)} (planilha: ${row.totalPagoParcelas ?? '—'} / ${row.parcelasPagas ?? '—'} parc.)`,
  )
}

function rowHasPaidSnapshot(row: TableRow): boolean {
  if (row.entradaPg) return true
  if (row.parcelasPagas != null) return true
  if (row.totalPagoParcelas != null) return true
  if (row.entrada != null && row.entrada > 0) return true
  return false
}

/** Garante pagamento de entrada da planilha sem apagar outros lançamentos do lote. */
function ensureEntradaFromTable(data: AppData) {
  for (const row of TABLE_ROWS) {
    if (row.entradaPg) continue
    if (row.entrada == null || row.entrada <= 0) continue
    const lots = findLotsForRow(data, row)
    for (const lot of lots) {
      const entradaInst = getEntradaInst(lot)
      if (!entradaInst || entradaInst.expectedAmount <= 0) continue

      const entPays = data.payments.filter(
        (p) => p.lotId === lot.id && /entrada/i.test(p.description),
      )
      const sum = roundMoney(entPays.reduce((s, p) => s + p.amount, 0))
      const expected = roundMoney(entradaInst.expectedAmount)

      if (Math.abs(sum - expected) < 0.02) {
        lot.installments = syncInstallmentPaidAmounts(lot, data.payments)
        continue
      }
      if (sum > 0.01) {
        const client = data.clients.find((c) => c.id === lot.clientId)
        log.push(
          `⚠ ${client?.name ?? row.clientName} L${lot.lote}: entrada nos pagamentos R$ ${sum} ≠ R$ ${expected} (planilha) — revisar manualmente`,
        )
        continue
      }

      const { entrada: histEntrada } = collectHistorical(lot.id, data.payments)
      pushEntradaPayment(data, lot, lot.clientId, entradaInst, histEntrada)
      lot.installments = syncInstallmentPaidAmounts(lot, data.payments)
      const client = data.clients.find((c) => c.id === lot.clientId)
      log.push(
        `${client?.name ?? row.clientName} L${lot.lote}: entrada R$ ${expected} registrada`,
      )
    }
  }
}

export function applyTablePaidState(data: AppData): AppData {
  log.length = 0
  for (const row of TABLE_ROWS) {
    if (!rowHasPaidSnapshot(row)) continue
    const lots = findLotsForRow(data, row)
    for (const lot of lots) {
      syncLotPayments(data, row, lot)
      lot.installments = syncInstallmentPaidAmounts(lot, data.payments)
    }
  }
  ensureEntradaFromTable(data)
  return linkPaymentsToInstallments(data)
}

export function getPaidStateLog(): string[] {
  return log
}
