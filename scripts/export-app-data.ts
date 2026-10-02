/**
 * Gera public/dados-loteamento.json a partir do backup Firebase + migrações.
 * Execute após alterar public/backup_banco.json: npm run export-dados
 */
import { writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyEntradaAsPaid, applyOwnerStatusAdjustments } from '../src/lib/migrations'
import { mergeImport, parseImportJson } from '../src/lib/importJson'
import { emptyData, exportDataJson } from '../src/lib/storage'
import { todayISO } from '../src/lib/dates'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const backupPath = join(root, 'public/backup_banco.json')
const outPath = join(root, 'public/dados-loteamento.json')

const raw = JSON.parse(readFileSync(backupPath, 'utf8'))
let data = mergeImport(emptyData(), parseImportJson(raw, emptyData()))
data = applyEntradaAsPaid(data)
data = applyOwnerStatusAdjustments(data, todayISO())

writeFileSync(outPath, exportDataJson(data), 'utf8')
console.log('OK:', outPath)
console.log(
  'Clientes:',
  data.clients.length,
  '| Terrenos:',
  data.lots.length,
  '| Pagamentos:',
  data.payments.length,
)
