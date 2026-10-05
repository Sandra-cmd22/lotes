/**
 * Cruzamento completo: Firestore + planilha (estrutura + pagamentos).
 * Uso: npx tsx scripts/cross-table-data.ts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AppData } from '../src/types/index.ts'
import { applyTableFinancialStructure, getFinancialStructureLog } from './apply-table-financial-structure.ts'
import { applyTablePaidState, getPaidStateLog } from './apply-table-paid-state.ts'
import { run as fuseFirestoreTable } from './fuse-firestore-table.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_PATH = join(root, 'public/dados-loteamento.json')

const write = process.argv.includes('--write')

const data: AppData = process.argv.includes('--from-file')
  ? (JSON.parse(readFileSync(DATA_PATH, 'utf8')) as AppData)
  : fuseFirestoreTable()

let result = applyTableFinancialStructure(data)
result = applyTablePaidState(result)

console.log('=== Cruzamento Firestore + planilha ===\n')
console.log('--- Estrutura ---')
getFinancialStructureLog().forEach((l) => console.log(' •', l))
console.log('\n--- Pagamentos (planilha) ---')
getPaidStateLog().forEach((l) => console.log(' •', l))

console.log(
  `\n${result.clients.length} clientes, ${result.lots.length} lotes, ${result.payments.length} pagamentos`,
)

if (write) {
  result.bundledAt = new Date().toISOString()
  writeFileSync(DATA_PATH, JSON.stringify(result, null, 2) + '\n', 'utf8')
  console.log('\nGravado:', DATA_PATH, '(bundledAt', result.bundledAt, ')')
} else {
  console.log('\nDry-run. Use --write para gravar.')
}
