import { syncInstallmentPaidAmounts } from './calculations'
import { daysBetween } from './dates'
import { createId } from './id'
import { roundMoney } from './money'
import type { AppData, Payment } from '../types'

const MIGRATION_KEY = 'loteamento_migrations_v1'

function getApplied(): string[] {
  try {
    return JSON.parse(localStorage.getItem(MIGRATION_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

function markApplied(id: string) {
  const list = getApplied()
  if (!list.includes(id)) {
    localStorage.setItem(MIGRATION_KEY, JSON.stringify([...list, id]))
  }
}

/** Entrada não vinha marcada paga no Firebase — considerar quitada na importação */
export function applyEntradaAsPaid(data: AppData): AppData {
  const payments: Payment[] = [...data.payments]
  const lots = data.lots.map((lot) => {
    let changed = false
    const installments = lot.installments.map((inst) => {
      if (inst.label !== 'Entrada' && inst.number !== 0) return inst
      if (inst.expectedAmount <= 0) return inst
      if (inst.paidAmount >= inst.expectedAmount - 0.01) return inst
      changed = true
      return { ...inst, paidAmount: inst.expectedAmount }
    })

    if (!changed) return lot

    const entrada = installments.find((i) => i.label === 'Entrada' || i.number === 0)
    if (entrada && !payments.some((p) => p.lotId === lot.id && p.installmentId === entrada.id)) {
      payments.push({
        id: createId(),
        clientId: lot.clientId,
        lotId: lot.id,
        date: entrada.dueDate,
        amount: roundMoney(entrada.expectedAmount),
        description: 'Entrada',
        installmentId: entrada.id,
        createdAt: new Date().toISOString(),
      })
    }

    return {
      ...lot,
      installments: syncInstallmentPaidAmounts({ ...lot, installments }, payments),
    }
  })

  return { ...data, lots, payments }
}

/** Ajustes informados pelo proprietário (out/2026) */
const EM_DIA_NAME_PARTS = [
  'raimundo',
  'alex',
  'deurismar',
  'roberlania',
  'robertania',
  'davi',
  'barroso',
  'maria lucia',
  'marcelo',
  'sarah',
]

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function matchesEmDia(clientName: string): boolean {
  const n = normalizeName(clientName)
  return EM_DIA_NAME_PARTS.some((part) => n.includes(part))
}

function matchesFernando(clientName: string): boolean {
  return normalizeName(clientName).includes('fernando')
}

/**
 * Marca parcelas vencidas como pagas para clientes confirmados em dia.
 * Fernando: mantém apenas a parcela vencida ~1 mês atrás em aberto.
 */
export function applyOwnerStatusAdjustments(data: AppData, asOf: string): AppData {
  let payments: Payment[] = [...data.payments]

  const lots = data.lots.map((lot) => {
    const client = data.clients.find((c) => c.id === lot.clientId)
    if (!client) return lot

    const isEmDia = matchesEmDia(client.name)
    const isFernando = matchesFernando(client.name)
    if (!isEmDia && !isFernando) return lot

    const synced = syncInstallmentPaidAmounts(lot, payments)
    let installments = synced

    for (const inst of installments) {
      if (inst.label === 'Entrada' || inst.number === 0) continue
      const due = roundMoney(inst.expectedAmount - inst.paidAmount)
      if (due <= 0) continue
      if (inst.dueDate >= asOf) continue

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
            note: 'Ajuste: confirmado em dia',
            createdAt: new Date().toISOString(),
          })
        }
      }

      if (isFernando) {
        // Quita vencimentos antigos; deixa em aberto a parcela com ~1 mês de atraso
        const overdueOpen = installments.filter(
          (i) =>
            i.label !== 'Entrada' &&
            i.number !== 0 &&
            i.dueDate < asOf &&
            roundMoney(i.expectedAmount - i.paidAmount) > 0,
        )

        const keepOpen = overdueOpen.reduce<(typeof overdueOpen)[0] | undefined>(
          (best, cur) => {
            const days = daysBetween(cur.dueDate, asOf)
            if (!best) return cur
            const bestDays = daysBetween(best.dueDate, asOf)
            return Math.abs(days - 30) < Math.abs(bestDays - 30) ? cur : best
          },
          undefined,
        )
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
              note: 'Ajuste: regularizado',
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

export function runMigrations(data: AppData, asOf: string): AppData {
  const applied = getApplied()
  let next = data
  let changed = false

  if (!applied.includes('entrada_paid_v1')) {
    next = applyEntradaAsPaid(next)
    markApplied('entrada_paid_v1')
    changed = true
  }

  if (!applied.includes('owner_status_oct2026_v2')) {
    next = applyOwnerStatusAdjustments(next, asOf)
    markApplied('owner_status_oct2026_v2')
    changed = true
  }

  return changed ? next : data
}
