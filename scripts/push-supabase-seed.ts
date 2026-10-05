/**
 * Envia public/dados-loteamento.json para o Supabase (primeira carga).
 * Requer: .env com VITE_SUPABASE_* e tabela criada (supabase/schema.sql)
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import type { AppData } from '../src/types'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const url = process.env.VITE_SUPABASE_URL?.trim()
const key = process.env.VITE_SUPABASE_ANON_KEY?.trim()

if (!url || !key) {
  console.error('Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env')
  process.exit(1)
}

const jsonPath = join(root, 'public/dados-loteamento.json')
const payload = JSON.parse(readFileSync(jsonPath, 'utf8')) as AppData

const supabase = createClient(url, key)
const { error } = await supabase.from('loteamento_snapshot').upsert(
  {
    id: 'main',
    payload,
    updated_at: new Date().toISOString(),
  },
  { onConflict: 'id' },
)

if (error) {
  console.error('Erro:', error.message)
  if (error.message.includes('does not exist') || error.code === 'PGRST205') {
    console.error('\n→ Execute supabase/schema.sql no SQL Editor do Supabase.')
  }
  process.exit(1)
}

console.log('OK — nuvem atualizada:', payload.clients.length, 'clientes')
