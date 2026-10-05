/**
 * Aplica supabase/schema.sql via psql (opcional).
 * No .env, adicione DATABASE_URL (Settings → Database → Connection string → URI).
 * Não commite a senha.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

async function tableExists(): Promise<boolean> {
  const url = process.env.VITE_SUPABASE_URL?.trim()
  const key = process.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) return false
  const { error } = await createClient(url, key)
    .from('loteamento_snapshot')
    .select('id')
    .limit(1)
  if (!error) return true
  return !(
    error.message.includes('does not exist') ||
    error.code === 'PGRST205' ||
    error.message.includes('schema cache')
  )
}

function resolveDatabaseUrl(): string | null {
  const direct = process.env.DATABASE_URL?.trim()
  if (direct) return direct

  const password = process.env.SUPABASE_DB_PASSWORD?.trim()
  const projectUrl = process.env.VITE_SUPABASE_URL?.trim()
  if (!password || !projectUrl) return null

  const ref = projectUrl.replace(/^https:\/\//, '').replace(/\.supabase\.co\/?$/, '')
  if (!ref) return null

  const user = encodeURIComponent('postgres')
  const pass = encodeURIComponent(password)
  return `postgresql://${user}:${pass}@db.${ref}.supabase.co:5432/postgres`
}

if (await tableExists()) {
  console.log('Tabela loteamento_snapshot já existe — pulando schema.')
  process.exit(0)
}

const dbUrl = resolveDatabaseUrl()

if (!dbUrl) {
  console.error(`Falta criar a tabela no Supabase.

Opção A — SQL Editor (~1 min):
  1. https://supabase.com/dashboard/project/cwbomcwshxzgqsbaocka/sql/new
  2. Cole supabase/schema.sql → Run
  3. npm run supabase:seed

Opção B — Terminal:
  No .env, descomente e preencha SUPABASE_DB_PASSWORD (senha em Database → Settings)
  Depois: npm run supabase:setup
`)
  process.exit(1)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sqlPath = join(root, 'supabase/schema.sql')

const psql = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', sqlPath], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})

if (psql.status !== 0) {
  console.error(psql.stderr || psql.stdout || 'psql falhou')
  process.exit(psql.status ?? 1)
}

console.log('Schema aplicado:', readFileSync(sqlPath, 'utf8').split('\n')[0])
