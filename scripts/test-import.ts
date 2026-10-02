import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseImportJson } from '../src/lib/importJson'
import { emptyData } from '../src/lib/storage'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const raw = JSON.parse(readFileSync(join(root, 'public/backup_banco.json'), 'utf8'))
const preview = parseImportJson(raw, emptyData())
console.log('Clientes:', preview.stats.clientCount)
console.log('Terrenos:', preview.stats.lotCount)
console.log('Pagamentos:', preview.stats.paymentCount)
if (preview.warnings.length) console.log('Avisos:', preview.warnings.slice(0, 5))
