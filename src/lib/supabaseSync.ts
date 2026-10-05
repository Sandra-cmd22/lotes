import { runMigrations } from './migrations'
import { todayISO } from './dates'
import { getSupabase, isSupabaseConfigured, SNAPSHOT_ID, type SnapshotRow } from './supabase'
import type { AppData } from '../types'

function normalizePayload(raw: unknown): AppData | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!Array.isArray(o.clients) || !Array.isArray(o.lots) || !Array.isArray(o.payments)) {
    return null
  }
  return runMigrations(
    {
      clients: o.clients as AppData['clients'],
      lots: o.lots as AppData['lots'],
      payments: o.payments as AppData['payments'],
      version: typeof o.version === 'number' ? o.version : 1,
    },
    todayISO(),
  )
}

export async function fetchRemoteSnapshot(): Promise<{
  data: AppData | null
  updatedAt: string | null
  error?: string
}> {
  if (!isSupabaseConfigured()) {
    return { data: null, updatedAt: null }
  }
  const supabase = getSupabase()!
  const { data, error } = await supabase
    .from('loteamento_snapshot')
    .select('payload, updated_at')
    .eq('id', SNAPSHOT_ID)
    .maybeSingle()

  if (error) {
    return { data: null, updatedAt: null, error: error.message }
  }
  if (!data) return { data: null, updatedAt: null }

  const row = data as Pick<SnapshotRow, 'payload' | 'updated_at'>
  const parsed = normalizePayload(row.payload)
  return {
    data: parsed,
    updatedAt: row.updated_at,
    error: parsed ? undefined : 'Dados remotos inválidos',
  }
}

export async function pushRemoteSnapshot(payload: AppData): Promise<{ error?: string }> {
  if (!isSupabaseConfigured()) return {}
  const supabase = getSupabase()!
  const { error } = await supabase.from('loteamento_snapshot').upsert(
    {
      id: SNAPSHOT_ID,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )
  return error ? { error: error.message } : {}
}

export function subscribeRemoteSnapshot(
  onUpdate: (data: AppData) => void,
): (() => void) | null {
  if (!isSupabaseConfigured()) return null
  const supabase = getSupabase()!

  const channel = supabase
    .channel('loteamento_snapshot_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'loteamento_snapshot', filter: `id=eq.${SNAPSHOT_ID}` },
      (payload) => {
        const row = (payload.new ?? payload.old) as SnapshotRow | undefined
        if (!row?.payload) return
        const parsed = normalizePayload(row.payload)
        if (parsed) onUpdate(parsed)
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

export function hasLocalData(data: AppData): boolean {
  return data.clients.length > 0
}
