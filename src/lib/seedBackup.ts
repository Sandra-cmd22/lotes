import { mergeImport, parseImportJson } from './importJson'
import { emptyData, loadData, saveData } from './storage'

export const BACKUP_JSON_PATH = '/backup_banco.json'
export const APP_DATA_JSON_PATH = '/dados-loteamento.json'

export async function fetchProjectBackup(): Promise<unknown | null> {
  try {
    const res = await fetch(BACKUP_JSON_PATH, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as unknown
  } catch {
    return null
  }
}

function isAppData(raw: unknown): raw is import('../types').AppData {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  return Array.isArray(o.clients) && Array.isArray(o.lots) && Array.isArray(o.payments)
}

/** Carrega dados do repo se o sistema ainda estiver vazio */
export async function tryAutoSeedFromBackup(): Promise<boolean> {
  const current = loadData()
  if (current.clients.length > 0) return false

  try {
    const appRes = await fetch(APP_DATA_JSON_PATH, { cache: 'no-store' })
    if (appRes.ok) {
      const json = (await appRes.json()) as unknown
      if (isAppData(json)) {
        saveData(json)
        return true
      }
    }
  } catch {
    /* fallback */
  }

  const raw = await fetchProjectBackup()
  if (!raw) return false

  const preview = parseImportJson(raw, emptyData())
  if (preview.clients.length === 0) return false

  const merged = mergeImport(emptyData(), preview)
  saveData(merged)
  return true
}

export async function previewProjectBackup(existing = loadData()) {
  const raw = await fetchProjectBackup()
  if (!raw) return { error: 'Arquivo backup_banco.json não encontrado em public/.' as const }
  return { preview: parseImportJson(raw, existing) }
}
