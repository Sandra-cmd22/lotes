import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseImportJson, mergeImport } from '../src/lib/importJson'
import { getClientSummary } from '../src/lib/calculations'
import { applyEntradaAsPaid, applyOwnerStatusAdjustments } from '../src/lib/migrations'
import { emptyData } from '../src/lib/storage'
import { todayISO } from '../src/lib/dates'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const raw = JSON.parse(readFileSync(join(root, 'public/backup_banco.json'), 'utf8'))
let data = mergeImport(emptyData(), parseImportJson(raw, emptyData()))
data = applyEntradaAsPaid(data)
data = applyOwnerStatusAdjustments(data, todayISO())

const names = [
  'Raimundo',
  'Iranildo',
  'Marquinho',
  'Caique',
  'Marcelo',
  'Maria lucia',
  'Barroso',
  'Rerin',
  'Alex',
  'Fernando',
]

const today = todayISO()
console.log('Hoje:', today)
for (const n of names) {
  const c = data.clients.find((x) => x.name.toLowerCase().includes(n.toLowerCase()))
  if (!c) {
    console.log('—', n, 'NÃO ENCONTRADO')
    continue
  }
  const s = getClientSummary(c, data.lots, data.payments)
  console.log(c.name, '→', s.status, 'atrasos:', s.overdueCount, s.oldestOverdue)
}
