import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const paths = [
  join(root, 'public', 'backup_banco.json'),
  join(root, 'backup_banco.json'),
]

for (const p of paths) {
  if (!existsSync(p)) continue
  const raw = readFileSync(p, 'utf8')
  const json = JSON.parse(raw)
  const keys = Object.keys(json)
  let clients = 0
  if (Array.isArray(json)) clients = json.length
  else if (Array.isArray(json.clientes)) clients = json.clientes.length
  else if (Array.isArray(json.clients)) clients = json.clients.length
  else if (Array.isArray(json.compradores)) clients = json.compradores.length
  else if (json.buyers && typeof json.buyers === 'object') clients = Object.keys(json.buyers).length
  else if (json.clients && Array.isArray(json.clients)) clients = json.clients.length

  let lots = 0
  if (json.lots && typeof json.lots === 'object') lots = Object.keys(json.lots).length
  let installments = 0
  if (json.installments && typeof json.installments === 'object') {
    installments = Object.keys(json.installments).length
  }

  console.log(`OK: ${p}`)
  console.log(`Chaves raiz: ${keys.join(', ')}`)
  console.log(`Clientes (estimado): ${clients}`)
  if (lots) console.log(`Lotes: ${lots}`)
  if (installments) console.log(`Parcelas no backup: ${installments}`)
  process.exit(0)
}

console.log('Nenhum backup_banco.json em public/ ou na raiz do projeto.')
process.exit(1)
