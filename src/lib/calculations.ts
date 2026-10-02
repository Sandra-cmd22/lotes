import { addDays, addMonths, addWeeks, daysBetween, todayISO } from './dates'
import { nearlyZero, roundMoney } from './money'
import type {
  AppData,
  Client,
  ClientFinancialSummary,
  ClientStatus,
  DashboardStats,
  Installment,
  InstallmentPeriodicity,
  Lot,
  OverdueItem,
  Payment,
} from '../types'

export function lotLabel(lot: Lot): string {
  return `Q${lot.quadra} L${lot.lote}`
}

export function getPaymentsForLot(payments: Payment[], lotId: string): Payment[] {
  return payments
    .filter((p) => p.lotId === lotId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
}

export function getLotTotalPaid(lot: Lot, payments: Payment[]): number {
  return roundMoney(
    getPaymentsForLot(payments, lot.id).reduce((s, p) => s + p.amount, 0),
  )
}

export function getLotRemaining(lot: Lot, payments: Payment[]): number {
  return roundMoney(Math.max(0, lot.totalValue - getLotTotalPaid(lot, payments)))
}

export function isLotQuitado(lot: Lot, payments: Payment[]): boolean {
  return nearlyZero(getLotRemaining(lot, payments))
}

export function syncInstallmentPaidAmounts(lot: Lot, payments: Payment[]): Installment[] {
  return lot.installments.map((inst) => ({
    ...inst,
    paidAmount: roundMoney(
      getPaymentsForLot(payments, lot.id)
        .filter((p) => p.installmentId === inst.id)
        .reduce((s, p) => s + p.amount, 0),
    ),
  }))
}

export function installmentAmountDue(inst: Installment): number {
  return roundMoney(Math.max(0, inst.expectedAmount - inst.paidAmount))
}

export function isInstallmentOverdue(inst: Installment, asOf = todayISO()): boolean {
  if (nearlyZero(installmentAmountDue(inst))) return false
  return inst.dueDate < asOf
}

export function getLotOverdueItems(
  client: Client,
  lot: Lot,
  payments: Payment[],
  asOf = todayISO(),
): OverdueItem[] {
  const installments = syncInstallmentPaidAmounts(lot, payments)
  const items: OverdueItem[] = []
  for (const inst of installments) {
    const due = installmentAmountDue(inst)
    if (due > 0 && inst.dueDate < asOf) {
      items.push({
        clientId: client.id,
        clientName: client.name,
        lotId: lot.id,
        lotLabel: lotLabel(lot),
        installmentId: inst.id,
        installmentLabel: inst.label,
        dueDate: inst.dueDate,
        amountDue: due,
        daysLate: daysBetween(inst.dueDate, asOf),
      })
    }
  }
  return items
}

export function getClientLots(lots: Lot[], clientId: string): Lot[] {
  return lots.filter((l) => l.clientId === clientId)
}

export function resolveClientStatus(
  clientLots: Lot[],
  payments: Payment[],
  asOf = todayISO(),
): ClientStatus {
  if (clientLots.length === 0) return 'em_dia'
  const allQuitado = clientLots.every((l) => isLotQuitado(l, payments))
  if (allQuitado) return 'quitado'
  const hasOverdue = clientLots.some((l) =>
    syncInstallmentPaidAmounts(l, payments).some((i) => isInstallmentOverdue(i, asOf)),
  )
  return hasOverdue ? 'atraso' : 'em_dia'
}

export function countRemainingInstallments(lot: Lot, payments: Payment[]): number {
  const synced = syncInstallmentPaidAmounts(lot, payments)
  return synced.filter((i) => !nearlyZero(installmentAmountDue(i))).length
}

export function getClientSummary(
  client: Client,
  lots: Lot[],
  payments: Payment[],
  asOf = todayISO(),
): ClientFinancialSummary {
  const clientLots = getClientLots(lots, client.id)
  const totalPurchased = roundMoney(clientLots.reduce((s, l) => s + l.totalValue, 0))
  const totalPaid = roundMoney(
    clientLots.reduce((s, l) => s + getLotTotalPaid(l, payments), 0),
  )
  const totalRemaining = roundMoney(Math.max(0, totalPurchased - totalPaid))
  const remainingInstallments = clientLots.reduce(
    (s, l) => s + countRemainingInstallments(l, payments),
    0,
  )

  const overdueItems = clientLots.flatMap((l) =>
    getLotOverdueItems(client, l, payments, asOf),
  )
  overdueItems.sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  const oldest = overdueItems[0]

  const clientPayments = payments.filter((p) => p.clientId === client.id)
  const lastPaymentDate =
    clientPayments.length > 0
      ? clientPayments.reduce((max, p) => (p.date > max ? p.date : max), clientPayments[0].date)
      : undefined

  return {
    clientId: client.id,
    totalPurchased,
    totalPaid,
    totalRemaining,
    lotCount: clientLots.length,
    remainingInstallments,
    status: resolveClientStatus(clientLots, payments, asOf),
    overdueCount: overdueItems.length,
    lastPaymentDate,
    oldestOverdue: oldest
      ? {
          dueDate: oldest.dueDate,
          amount: oldest.amountDue,
          daysLate: oldest.daysLate,
          lotLabel: oldest.lotLabel,
        }
      : undefined,
  }
}

export function getDashboardStats(data: AppData, asOf = todayISO()): DashboardStats {
  const { clients, lots, payments } = data
  const totalSoldValue = roundMoney(lots.reduce((s, l) => s + l.totalValue, 0))
  const totalReceived = roundMoney(payments.reduce((s, p) => s + p.amount, 0))
  const totalToReceive = roundMoney(Math.max(0, totalSoldValue - totalReceived))

  let overdueInstallmentsCount = 0
  let clientsInArrears = 0
  for (const client of clients) {
    const summary = getClientSummary(client, lots, payments, asOf)
    overdueInstallmentsCount += summary.overdueCount
    if (summary.status === 'atraso') clientsInArrears++
  }

  return {
    totalClients: clients.length,
    totalLotsSold: lots.length,
    totalSoldValue,
    totalReceived,
    totalToReceive,
    overdueInstallmentsCount,
    clientsInArrears,
  }
}

export function buildPaymentHistoryWithBalance(
  clientId: string,
  lots: Lot[],
  payments: Payment[],
): Array<Payment & { lotLabel: string; balanceAfter: number }> {
  const clientLots = getClientLots(lots, clientId)
  const totalPurchased = clientLots.reduce((s, l) => s + l.totalValue, 0)
  const clientPayments = payments
    .filter((p) => p.clientId === clientId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))

  let runningPaid = 0
  return clientPayments.map((p) => {
    runningPaid = roundMoney(runningPaid + p.amount)
    const lot = lots.find((l) => l.id === p.lotId)
    return {
      ...p,
      lotLabel: lot ? lotLabel(lot) : '—',
      balanceAfter: roundMoney(Math.max(0, totalPurchased - runningPaid)),
    }
  })
}

export function generateInstallments(params: {
  totalValue: number
  entradaAmount: number
  entradaDate: string
  firstParcelDate: string
  periodicity: InstallmentPeriodicity
  parcelCount?: number
  parcelAmount?: number
}): Installment[] {
  const {
    totalValue,
    entradaAmount,
    entradaDate,
    firstParcelDate,
    periodicity,
    parcelCount,
    parcelAmount,
  } = params
  const saldo = roundMoney(totalValue - entradaAmount)
  const installments: Installment[] = []

  if (entradaAmount > 0) {
    installments.push({
      id: crypto.randomUUID(),
      number: 0,
      label: 'Entrada',
      dueDate: entradaDate,
      expectedAmount: entradaAmount,
      paidAmount: 0,
    })
  }

  let count = parcelCount ?? 0
  let amount = parcelAmount ?? 0
  if (count <= 0 && amount > 0 && saldo > 0) {
    count = Math.ceil(saldo / amount)
  }
  if (amount <= 0 && count > 0 && saldo > 0) {
    amount = roundMoney(saldo / count)
  }
  if (count <= 0 || amount <= 0) return installments

  let remaining = saldo
  for (let i = 1; i <= count; i++) {
    const isLast = i === count
    const expected = isLast ? roundMoney(remaining) : roundMoney(amount)
    remaining = roundMoney(remaining - expected)
    let dueDate = firstParcelDate
    const step = i - 1
    if (periodicity === 'mensal') dueDate = addMonths(firstParcelDate, step)
    else if (periodicity === 'quinzenal') dueDate = addDays(firstParcelDate, step * 15)
    else dueDate = addWeeks(firstParcelDate, step)

    installments.push({
      id: crypto.randomUUID(),
      number: i,
      label: `Parcela ${i}`,
      dueDate,
      expectedAmount: expected,
      paidAmount: 0,
    })
  }
  return installments
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Vincula pagamentos às parcelas (útil após importação JSON) */
export function linkPaymentsToInstallments(data: AppData): AppData {
  let payments = [...data.payments]
  const lots = data.lots.map((lot) => {
    const lotPayments = getPaymentsForLot(payments, lot.id)
    for (const payment of lotPayments) {
      if (payment.installmentId) continue
      const synced = syncInstallmentPaidAmounts(lot, payments)
      const byDesc = synced.find((inst) => {
        const d = payment.description.toLowerCase()
        const label = inst.label.toLowerCase()
        if (d.includes(label)) return installmentAmountDue(inst) > 0
        if (inst.number != null && d.includes(String(inst.number))) {
          return installmentAmountDue(inst) > 0
        }
        if (label === 'entrada' && d.includes('entrada')) {
          return installmentAmountDue(inst) > 0
        }
        return false
      })
      const target =
        byDesc ??
        synced.find((inst) => installmentAmountDue(inst) > 0)
      if (!target) continue
      payments = payments.map((p) =>
        p.id === payment.id ? { ...p, installmentId: target.id } : p,
      )
    }
    return {
      ...lot,
      installments: syncInstallmentPaidAmounts(lot, payments),
    }
  })
  return { ...data, lots, payments }
}
