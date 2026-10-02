import { normalizeName } from './calculations'
import { toDateOnly } from './dates'
import { createId } from './id'
import { roundMoney } from './money'
import type { AppData, Client, ImportPreview, Installment, Lot, Payment } from '../types'

type FirestoreTimestamp = { _seconds?: number; _nanoseconds?: number }

function asString(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

function asNumber(v: unknown): number {
  if (typeof v === 'number') return roundMoney(v)
  const n = parseFloat(asString(v).replace(',', '.'))
  return Number.isFinite(n) ? roundMoney(n) : 0
}

function firestoreDateToISO(v: unknown): string {
  if (!v) return ''
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
    const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (br) return `${br[3]}-${br[2]}-${br[1]}`
    return ''
  }
  if (typeof v === 'object' && v !== null && '_seconds' in v) {
    const sec = (v as FirestoreTimestamp)._seconds
    if (typeof sec === 'number') return toDateOnly(new Date(sec * 1000))
  }
  return ''
}

function isFirestoreBackup(obj: Record<string, unknown>): boolean {
  return (
    typeof obj.buyers === 'object' &&
    obj.buyers !== null &&
    typeof obj.lots === 'object' &&
    obj.lots !== null &&
    typeof obj.installments === 'object' &&
    obj.installments !== null
  )
}

/** Backup Firebase/Firestore: buyers, lots, installments */
export function parseFirestoreBackup(
  raw: Record<string, unknown>,
  existing: AppData,
  warnings: string[] = [],
): ImportPreview {
  const buyersMap = raw.buyers as Record<string, Record<string, unknown>>
  const lotsMap = raw.lots as Record<string, Record<string, unknown>>
  const installmentsMap = raw.installments as Record<string, Record<string, unknown>>

  const clients: Client[] = []
  const lots: Lot[] = []
  const payments: Payment[] = []

  const buyerIdToClient = new Map<string, string>()
  const lotIdToNew = new Map<string, string>()

  for (const [fbBuyerId, buyer] of Object.entries(buyersMap)) {
    const name = asString(buyer.name)
    if (!name) {
      warnings.push(`Comprador ${fbBuyerId} sem nome — ignorado.`)
      continue
    }
    const address = asString(buyer.address) || undefined
    const email = asString(buyer.email)
    const notes = email ? `E-mail: ${email}` : undefined

    const client: Client = {
      id: createId(),
      name,
      phone: asString(buyer.phone) || undefined,
      address,
      notes,
      createdAt: firestoreDateToISO(buyer.createdAt) || new Date().toISOString(),
    }
    buyerIdToClient.set(fbBuyerId, client.id)
    clients.push(client)
  }

  const installmentsByLot = new Map<string, Array<{ fbId: string; data: Record<string, unknown> }>>()
  for (const [fbInstId, inst] of Object.entries(installmentsMap)) {
    const lotId = asString(inst.lotId)
    if (!lotId) continue
    const list = installmentsByLot.get(lotId) ?? []
    list.push({ fbId: fbInstId, data: inst })
    installmentsByLot.set(lotId, list)
  }

  for (const [fbLotId, lotData] of Object.entries(lotsMap)) {
    const fbBuyerId = asString(lotData.buyerId)
    const clientId = buyerIdToClient.get(fbBuyerId)
    if (!clientId) {
      warnings.push(`Lote ${fbLotId} sem comprador válido — ignorado.`)
      continue
    }

    const newLotId = createId()
    lotIdToNew.set(fbLotId, newLotId)

    const totalValue = asNumber(lotData.totalAmount)
    const downPayment = asNumber(lotData.downPayment)
    const startDate = firestoreDateToISO(lotData.startDate) || new Date().toISOString().slice(0, 10)
    const loteNumber = asString(lotData.loteNumber) || '—'

    const instList = (installmentsByLot.get(fbLotId) ?? []).sort(
      (a, b) => asNumber(a.data.installmentNumber) - asNumber(b.data.installmentNumber),
    )

    const installmentEntities: Installment[] = []

    let entradaInstId: string | null = null
    if (downPayment > 0) {
      entradaInstId = createId()
      installmentEntities.push({
        id: entradaInstId,
        number: 0,
        label: 'Entrada',
        dueDate: startDate,
        expectedAmount: downPayment,
        paidAmount: downPayment,
      })
      payments.push({
        id: createId(),
        clientId,
        lotId: newLotId,
        date: startDate,
        amount: downPayment,
        description: 'Entrada',
        installmentId: entradaInstId,
        createdAt: firestoreDateToISO(lotData.createdAt) || new Date().toISOString(),
      })
    }

    for (const { data: inst } of instList) {
      const num = asNumber(inst.installmentNumber)
      const expected = asNumber(inst.amount)
      const newInstId = createId()
      const paid = inst.paid === true

      installmentEntities.push({
        id: newInstId,
        number: num,
        label: num > 0 ? `Parcela ${num}` : 'Parcela',
        dueDate: firestoreDateToISO(inst.dueDate) || startDate,
        expectedAmount: expected,
        paidAmount: paid ? expected : 0,
      })

      if (paid && expected > 0) {
        payments.push({
          id: createId(),
          clientId,
          lotId: newLotId,
          date:
            firestoreDateToISO(inst.paidAt) ||
            firestoreDateToISO(inst.dueDate) ||
            startDate,
          amount: expected,
          description: num > 0 ? `Parcela ${num}` : 'Parcela',
          installmentId: newInstId,
          createdAt: firestoreDateToISO(inst.createdAt) || new Date().toISOString(),
        })
      }
    }

    const lot: Lot = {
      id: newLotId,
      clientId,
      quadra: '—',
      lote: loteNumber,
      totalValue: totalValue || roundMoney(downPayment + instList.reduce((s, i) => s + asNumber(i.data.amount), 0)),
      paymentType: 'parcelado',
      installments: installmentEntities,
      createdAt: firestoreDateToISO(lotData.createdAt) || new Date().toISOString(),
    }
    lots.push(lot)
  }

  const existingNames = new Set(existing.clients.map((c) => normalizeName(c.name)))
  const duplicateNames = clients
    .map((c) => c.name)
    .filter((name) => existingNames.has(normalizeName(name)))

  return {
    clients,
    lots,
    payments,
    duplicateNames,
    stats: {
      clientCount: clients.length,
      lotCount: lots.length,
      paymentCount: payments.length,
    },
    warnings,
  }
}

export { isFirestoreBackup }
