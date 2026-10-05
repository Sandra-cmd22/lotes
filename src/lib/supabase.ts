import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AppData } from '../types'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey)
}

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null
  if (!client) {
    client = createClient(url!, anonKey!)
  }
  return client
}

export type SnapshotRow = {
  id: string
  payload: AppData
  updated_at: string
}

export const SNAPSHOT_ID = 'main'
