import type { AppData } from '../types'
import { mergeImport, parseImportJson } from './importJson'
import { emptyData, loadData, saveData } from './storage'

export const BACKUP_JSON_PATH = '/backup_banco.json'
export const APP_DATA_JSON_PATH = '/dados-loteamento.json'

const BUNDLED_AT_APPLIED_KEY = 'loteamento_bundled_at_applied'

export async function fetchPublicAppData(): Promise<AppData | null> {
  try {
    const res = await fetch(`${APP_DATA_JSON_PATH}?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const json = (await res.json()) as unknown
    if (!isAppData(json)) return null
    return json
  } catch {
    return null
  }
}

/** Substitui localStorage se public/dados-loteamento.json tiver bundledAt mais recente. */
export async function syncBundledAppDataIfNewer(): Promise<AppData | null> {
  const file = await fetchPublicAppData()
  if (!file?.bundledAt) return null
  const applied = localStorage.getItem(BUNDLED_AT_APPLIED_KEY)
  if (applied === file.bundledAt) return null
  saveData(file)
  localStorage.setItem(BUNDLED_AT_APPLIED_KEY, file.bundledAt)
  return file
}

/** Força recarga do JSON do projeto (substitui tudo). */
export async function replaceFromPublicAppData(): Promise<
  { ok: true; data: AppData } | { ok: false; error: string }
> {
  const file = await fetchPublicAppData()
  if (!file) {
    return { ok: false, error: 'Não foi possível carregar public/dados-loteamento.json.' }
  }
  saveData(file)
  if (file.bundledAt) {
    localStorage.setItem(BUNDLED_AT_APPLIED_KEY, file.bundledAt)
  }
  return { ok: true, data: file }
}

export async function fetchProjectBackup(): Promise<unknown | null> {
  try {
    const res = await fetch(BACKUP_JSON_PATH, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as unknown
  } catch {
    return null
  }
}

function isAppData(raw: unknown): raw is AppData {
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
