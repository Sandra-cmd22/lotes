import { todayISO } from './dates'
import { runMigrations } from './migrations'
import type { AppData } from '../types'

const STORAGE_KEY = 'loteamento_app_v1'

export const emptyData = (): AppData => ({
  clients: [],
  lots: [],
  payments: [],
  version: 1,
})

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyData()
    const parsed = JSON.parse(raw) as AppData
    if (!parsed.clients || !parsed.lots || !parsed.payments) return emptyData()
    const migrated = runMigrations(parsed, todayISO())
    if (migrated !== parsed) saveData(migrated)
    return migrated
  } catch {
    return emptyData()
  }
}

export function saveData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function exportDataJson(data: AppData): string {
  return JSON.stringify(data, null, 2)
}
