import { mergeImport, parseImportJson } from './importJson'
import { emptyData, loadData, saveData } from './storage'

export const BACKUP_JSON_PATH = '/backup_banco.json'

export async function fetchProjectBackup(): Promise<unknown | null> {
  try {
    const res = await fetch(BACKUP_JSON_PATH, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as unknown
  } catch {
    return null
  }
}

/** Carrega backup_banco.json se o sistema ainda estiver vazio */
export async function tryAutoSeedFromBackup(): Promise<boolean> {
  const current = loadData()
  if (current.clients.length > 0) return false

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
