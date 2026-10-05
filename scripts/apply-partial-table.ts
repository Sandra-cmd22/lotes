/**
 * Atualização da planilha: só nomes de clientes, nº dos lotes e cadastros novos.
 * NÃO altera totalValue, parcelas, pagamentos nem datas de entrada existentes.
 *
 * Uso: npx tsx scripts/apply-partial-table.ts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AppData, Client, Lot } from '../src/types/index.ts'
import { generateInstallments } from '../src/lib/calculations.ts'
import { createId } from '../src/lib/id.ts'
import { normalizeName } from '../src/lib/calculations.ts'
import { roundMoney } from '../src/lib/money.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_PATH = join(root, 'public/dados-loteamento.json')

const CLIENT_RENAMES: { from: string; to: string }[] = [
  { from: 'Lilian Cristina', to: 'Lilian' },
  { from: 'Maria lucia', to: 'Maria Lúcia' },
  { from: 'Marquinho oficina', to: 'Marquinhos' },
  { from: 'Fernando Guerreiro', to: 'Fernando' },
]

/** Só o campo `lote` — valores financeiros intactos */
const LOT_RENUMBER: { clientMatch: string; fromLote: string; toLote: string }[] = [
  { clientMatch: 'Alex', fromLote: '65', toLote: '01,02' },
  { clientMatch: 'Lilian', fromLote: '7', toLote: '04' },
  { clientMatch: 'Barroso', fromLote: '06', toLote: '21' },
  { clientMatch: 'Evandir', fromLote: 'Evandir', toLote: '07' },
  { clientMatch: 'Caique', fromLote: '87', toLote: '08' },
  { clientMatch: 'Daniel', fromLote: '54', toLote: '09,10' },
  { clientMatch: 'Fernando', fromLote: '8', toLote: '12' },
  { clientMatch: 'Tânia', fromLote: '88', toLote: '15' },
  { clientMatch: 'Maria Lúcia', fromLote: '65', toLote: '30' },
  { clientMatch: 'Denir', fromLote: '33', toLote: '31' },
  { clientMatch: 'Marquinhos', fromLote: '71', toLote: '32' },
  { clientMatch: 'Marquinhos', fromLote: '76', toLote: '40' },
  { clientMatch: 'Marcelo', fromLote: '77', toLote: '33' },
  { clientMatch: 'Rerin', fromLote: '44', toLote: '42' },
  { clientMatch: 'Iranildo', fromLote: '88', toLote: '43,44' },
  { clientMatch: 'Leonardo', fromLote: '22', toLote: '06' },
]

/** Clientes novos na planilha — só cria se ainda não existir (sem mexer nos antigos) */
const NEW_CLIENT_LOTS: { clientName: string; lote: string }[] = [
  { clientName: 'Eudes', lote: '05' },
  { clientName: 'Régia', lote: '11' },
  { clientName: 'Pago', lote: '13' },
  { clientName: 'Pago', lote: '14' },
  { clientName: 'Jajá', lote: '16' },
  { clientName: 'Naldo', lote: '17' },
  { clientName: 'Robertânia', lote: '18' },
  { clientName: 'Davi', lote: '19' },
  { clientName: 'Fernanda', lote: '45' },
  { clientName: 'Sarah', lote: '46' },
  { clientName: 'Jonas', lote: '22,23,26,27' },
]

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '')
}

function nameKey(name: string): string {
  return stripAccents(normalizeName(name))
}

function findClient(data: AppData, name: string): Client | undefined {
  const key = nameKey(name)
  return data.clients.find((c) => nameKey(c.name) === key)
}

function ensureClient(data: AppData, name: string): Client {
  let c = findClient(data, name)
  if (c) return c
  c = { id: createId(), name, createdAt: new Date().toISOString().slice(0, 10) }
  data.clients.push(c)
  return c
}

function lotExists(data: AppData, clientId: string, lote: string): boolean {
  return data.lots.some((l) => l.clientId === clientId && l.lote === lote)
}

function apply(data: AppData): string[] {
  const log: string[] = []

  for (const { from, to } of CLIENT_RENAMES) {
    const c = data.clients.find((x) => x.name === from)
    if (c) {
      c.name = to
      log.push(`Nome: ${from} → ${to}`)
    }
  }

  ensureClient(data, 'Deurismar')
  ensureClient(data, 'Jonas')

  for (const map of LOT_RENUMBER) {
    const client = findClient(data, map.clientMatch)
    if (!client) continue
    const lot = data.lots.find(
      (l) =>
        l.clientId === client.id &&
        (l.lote === map.fromLote ||
          l.lote.replace(/^0+/, '') === map.fromLote.replace(/^0+/, '')),
    )
    if (lot && lot.lote !== map.toLote) {
      const old = lot.lote
      lot.lote = map.toLote
      log.push(`${map.clientMatch}: nº lote ${old} → ${map.toLote}`)
    }
  }

  for (const { clientName, lote } of NEW_CLIENT_LOTS) {
    const client = ensureClient(data, clientName)
    if (lotExists(data, client.id, lote)) continue
    const today = new Date().toISOString().slice(0, 10)
    const totalValue = 20000
    const entrada = 2000
    const saldo = roundMoney(totalValue - entrada)
    const parcelCount = Math.max(1, Math.round(saldo / 250))
    const newLot: Lot = {
      id: createId(),
      clientId: client.id,
      quadra: '—',
      lote,
      totalValue,
      paymentType: 'parcelado',
      installments: generateInstallments({
        totalValue,
        entradaAmount: entrada,
        entradaDate: today,
        firstParcelDate: today,
        periodicity: 'mensal',
        parcelCount,
        parcelAmount: roundMoney(saldo / parcelCount),
      }),
      createdAt: today,
    }
    data.lots.push(newLot)
    log.push(`Novo cadastro: ${clientName} lote ${lote} (estrutura inicial — ajuste no app se precisar)`)
  }

  log.push('Raimundo: sem nº na planilha — lote no sistema mantido como está')
  return log
}

const write = process.argv.includes('--write')
const data = JSON.parse(readFileSync(DATA_PATH, 'utf8')) as AppData
const before = structuredClone(data)
const log = apply(data)

console.log('Somente números de lote / nomes / cadastros novos:\n')
log.forEach((l) => console.log(' •', l))
console.log('\nClientes:', data.clients.length, '(antes', before.clients.length, ')')
console.log('Lotes:', data.lots.length, '(antes', before.lots.length, ')')
console.log('Pagamentos:', data.payments.length, '(antes', before.payments.length, ')')

if (write) {
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8')
  console.log('\nGravado:', DATA_PATH)
} else {
  console.log('\nUse --write para gravar')
}
