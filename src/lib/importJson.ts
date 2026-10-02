import { createId } from './id'
import { generateInstallments, linkPaymentsToInstallments, normalizeName } from './calculations'
import { isFirestoreBackup, parseFirestoreBackup } from './importFirestoreBackup'
import { roundMoney } from './money'
import type { AppData, Client, ImportPreview, Installment, Lot, Payment } from '../types'

export type { ImportPreview }

function asString(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

function asNumber(v: unknown): number {
  if (typeof v === 'number') return roundMoney(v)
  const s = asString(v).replace(/\./g, '').replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? roundMoney(n) : 0
}

function pickDate(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = asString(obj[k])
    if (!v) continue
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
    const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (br) return `${br[3]}-${br[2]}-${br[1]}`
  }
  return ''
}

function isAppDataShape(obj: Record<string, unknown>): boolean {
  return (
    Array.isArray(obj.clients) &&
    Array.isArray(obj.lots) &&
    Array.isArray(obj.payments)
  )
}

function previewFromAppData(
  data: AppData,
  existing: AppData,
  warnings: string[],
): ImportPreview {
  const existingNames = new Set(existing.clients.map((c) => normalizeName(c.name)))
  const duplicateNames = data.clients
    .map((c) => c.name)
    .filter((name) => existingNames.has(normalizeName(name)))
  return {
    clients: data.clients,
    lots: data.lots,
    payments: data.payments,
    duplicateNames,
    stats: {
      clientCount: data.clients.length,
      lotCount: data.lots.length,
      paymentCount: data.payments.length,
    },
    warnings: [...warnings, 'Formato de backup do sistema reconhecido.'],
  }
}

function unwrapBackupRoot(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const obj = raw as Record<string, unknown>
  if (isAppDataShape(obj)) return obj
  if (isFirestoreBackup(obj)) return obj

  for (const key of ['banco', 'dados', 'data', 'backup', 'database']) {
    const inner = obj[key]
    if (inner && typeof inner === 'object') {
      const innerObj = inner as Record<string, unknown>
      if (isAppDataShape(innerObj)) return innerObj
      if (
        Array.isArray(innerObj.clientes) ||
        Array.isArray(innerObj.clients) ||
        Array.isArray(innerObj.compradores)
      ) {
        return inner
      }
    }
  }
  return raw
}

/** Converte estruturas comuns de JSON legado para o modelo interno */
export function parseImportJson(raw: unknown, existing: AppData): ImportPreview {
  const warnings: string[] = []
  const clients: Client[] = []
  const lots: Lot[] = []
  const payments: Payment[] = []

  const unwrapped = unwrapBackupRoot(raw)
  if (unwrapped && typeof unwrapped === 'object') {
    const obj = unwrapped as Record<string, unknown>
    if (isFirestoreBackup(obj)) {
      return parseFirestoreBackup(obj, existing, warnings)
    }
    if (isAppDataShape(obj)) {
      return previewFromAppData(
        {
          clients: obj.clients as Client[],
          lots: obj.lots as Lot[],
          payments: obj.payments as Payment[],
          version: typeof obj.version === 'number' ? obj.version : 1,
        },
        existing,
        warnings,
      )
    }
  }

  const existingNames = new Set(existing.clients.map((c) => normalizeName(c.name)))

  const pushClient = (item: Record<string, unknown>, index: number) => {
    const name =
      asString(item.nome) ||
      asString(item.nome_completo) ||
      asString(item.nomeCompleto) ||
      asString(item.name) ||
      asString(item.cliente) ||
      asString(item.comprador) ||
      `Cliente ${index + 1}`
    const client: Client = {
      id: createId(),
      name,
      phone: asString(item.telefone) || asString(item.phone) || undefined,
      address:
        asString(item.endereco) ||
        asString(item.address) ||
        asString(item.endereço) ||
        undefined,
      notes: asString(item.observacoes) || asString(item.notes) || undefined,
      createdAt: new Date().toISOString(),
    }
    clients.push(client)

    const terrenos =
      (item.terrenos as unknown[]) ||
      (item.lotes as unknown[]) ||
      (item.lots as unknown[]) ||
      (item.vendas as unknown[]) ||
      (item.imoveis as unknown[]) ||
      (item.propriedades as unknown[]) ||
      []

    if (Array.isArray(terrenos) && terrenos.length > 0) {
      terrenos.forEach((t, ti) => parseTerreno(t, client, ti))
    } else if (item.quadra || item.lote || item.valor) {
      parseTerreno(item, client, 0)
    }

    const pagamentosLegado =
      (item.pagamentos as unknown[]) || (item.payments as unknown[]) || []
    if (Array.isArray(pagamentosLegado)) {
      pagamentosLegado.forEach((p) => parsePagamento(p, client))
    }
  }

  const parseTerreno = (raw: unknown, client: Client, index: number) => {
    if (!raw || typeof raw !== 'object') return
    const t = raw as Record<string, unknown>
    const totalValue =
      asNumber(t.valor) ||
      asNumber(t.valorTotal) ||
      asNumber(t.totalValue) ||
      asNumber(t.preco)
    const quadra = asString(t.quadra) || '—'
    const lote = asString(t.lote) || String(index + 1)
    const paymentTypeRaw = asString(t.formaPagamento || t.paymentType).toLowerCase()
    const paymentType =
      paymentTypeRaw.includes('vista') || t.aVista === true ? 'avista' : 'parcelado'

    let installments: Installment[] = []
    const parcelasRaw = (t.parcelas as unknown[]) || (t.installments as unknown[]) || []

    if (Array.isArray(parcelasRaw) && parcelasRaw.length > 0) {
      installments = parcelasRaw.map((p, i) => {
        const pr = p as Record<string, unknown>
        return {
          id: createId(),
          number: typeof pr.numero === 'number' ? pr.numero : i,
          label:
            asString(pr.descricao) ||
            asString(pr.label) ||
            (i === 0 ? 'Entrada' : `Parcela ${i}`),
          dueDate:
            pickDate(pr, ['vencimento', 'dueDate', 'data', 'dataVencimento']) ||
            pickDate(t, ['dataPrimeiraParcela', 'firstParcelDate']) ||
            new Date().toISOString().slice(0, 10),
          expectedAmount:
            asNumber(pr.valor) || asNumber(pr.expectedAmount) || asNumber(pr.amount),
          paidAmount: asNumber(pr.pago) || asNumber(pr.paidAmount) || 0,
        }
      })
    } else if (paymentType === 'parcelado') {
      const entrada = asNumber(t.entrada) || asNumber(t.entradaValor) || 0
      const entradaDate =
        pickDate(t, ['dataEntrada', 'entradaDate']) || new Date().toISOString().slice(0, 10)
      const firstParcel =
        pickDate(t, ['dataPrimeiraParcela', 'firstParcelDate']) ||
        pickDate(t, ['vencimentoPrimeiraParcela']) ||
        entradaDate
      const qtd =
        asNumber(t.qtdParcelas) ||
        asNumber(t.parcelasQuantidade) ||
        asNumber(t.installmentCount) ||
        0
      const valorParcela =
        asNumber(t.valorParcela) || asNumber(t.parcelaValor) || asNumber(t.installmentAmount) || 0
      installments = generateInstallments({
        totalValue: totalValue || entrada + qtd * valorParcela,
        entradaAmount: entrada,
        entradaDate,
        firstParcelDate: firstParcel,
        periodicity: 'mensal',
        parcelCount: qtd || undefined,
        parcelAmount: valorParcela || undefined,
      })
    }

    const lot: Lot = {
      id: createId(),
      clientId: client.id,
      quadra,
      lote,
      totalValue: totalValue || installments.reduce((s, i) => s + i.expectedAmount, 0),
      paymentType,
      installments,
      avistaDueDate:
        paymentType === 'avista'
          ? pickDate(t, ['dataPagamento', 'avistaDueDate', 'data']) || undefined
          : undefined,
      notes: asString(t.observacoes) || undefined,
      createdAt: new Date().toISOString(),
    }
    lots.push(lot)

    const pagamentosTerreno = (t.pagamentos as unknown[]) || (t.payments as unknown[]) || []
    if (Array.isArray(pagamentosTerreno)) {
      pagamentosTerreno.forEach((p) => parsePagamento(p, client, lot))
    }
  }

  const parsePagamento = (raw: unknown, client: Client, lot?: Lot) => {
    if (!raw || typeof raw !== 'object') return
    const p = raw as Record<string, unknown>
    const amount = asNumber(p.valor) || asNumber(p.amount) || asNumber(p.value)
    if (amount <= 0) return
    const date =
      pickDate(p, ['data', 'date', 'dataPagamento']) || new Date().toISOString().slice(0, 10)
    const desc =
      asString(p.descricao) ||
      asString(p.description) ||
      (p.parcela != null ? `Parcela ${p.parcela}` : 'Pagamento')

    let lotId = lot?.id
    if (!lotId) {
      const lotRef =
        asString(p.lote) || asString(p.terreno) || asString(p.lotLabel) || asString(p.quadraLote)
      const found = lots.find(
        (l) =>
          l.clientId === client.id &&
          (lotLabelMatch(l, lotRef) || `${l.quadra}-${l.lote}` === lotRef),
      )
      lotId = found?.id
    }
    if (!lotId) {
      const clientLots = lots.filter((l) => l.clientId === client.id)
      lotId = clientLots[0]?.id
    }
    if (!lotId) {
      warnings.push(`Pagamento de R$ ${amount} para ${client.name} sem terreno associado — ignorado.`)
      return
    }

    payments.push({
      id: createId(),
      clientId: client.id,
      lotId,
      date,
      amount,
      description: desc,
      note: asString(p.observacao) || asString(p.note) || undefined,
      createdAt: new Date().toISOString(),
    })
  }

  function lotLabelMatch(l: Lot, ref: string): boolean {
    if (!ref) return false
    const norm = ref.toLowerCase()
    return norm.includes(l.lote.toLowerCase()) && norm.includes(l.quadra.toLowerCase())
  }

  const source = unwrapBackupRoot(raw)

  if (Array.isArray(source)) {
    source.forEach((item, i) => {
      if (item && typeof item === 'object') pushClient(item as Record<string, unknown>, i)
    })
  } else if (source && typeof source === 'object') {
    const obj = source as Record<string, unknown>
    let list: unknown[] | null =
      (obj.clientes as unknown[]) ||
      (obj.clients as unknown[]) ||
      (obj.compradores as unknown[]) ||
      (obj.data as unknown[]) ||
      null

    if (!list && obj.compradores && typeof obj.compradores === 'object') {
      list = Object.values(obj.compradores as Record<string, unknown>)
    }
    if (!list && obj.clientes && typeof obj.clientes === 'object' && !Array.isArray(obj.clientes)) {
      list = Object.values(obj.clientes as Record<string, unknown>)
    }

    if (Array.isArray(list)) {
      list.forEach((item, i) => {
        if (item && typeof item === 'object') pushClient(item as Record<string, unknown>, i)
      })
    } else if (obj.clients && typeof obj.clients === 'object' && !Array.isArray(obj.clients)) {
      warnings.push('Formato não reconhecido — use uma lista de clientes.')
    } else {
      pushClient(obj, 0)
    }

    if (Array.isArray(obj.lots) && clients.length === 1) {
      ;(obj.lots as unknown[]).forEach((t, ti) => parseTerreno(t, clients[0], ti))
    }
    if (Array.isArray(obj.payments) && clients.length === 1) {
      ;(obj.payments as unknown[]).forEach((p) => parsePagamento(p, clients[0]))
    }
  } else {
    warnings.push('Arquivo JSON inválido ou vazio.')
  }

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

export function mergeImport(existing: AppData, preview: ImportPreview): AppData {
  return linkPaymentsToInstallments({
    ...existing,
    clients: [...existing.clients, ...preview.clients],
    lots: [...existing.lots, ...preview.lots],
    payments: [...existing.payments, ...preview.payments],
  })
}
