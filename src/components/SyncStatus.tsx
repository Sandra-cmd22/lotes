import { Cloud, CloudOff, Loader2 } from 'lucide-react'
import { useData } from '../context/DataContext'

const labels: Record<string, string> = {
  loading: 'Carregando nuvem…',
  saving: 'Salvando…',
  synced: 'Sincronizado',
  error: 'Erro ao sincronizar',
  local: 'Só neste aparelho',
}

export function SyncStatus() {
  const { syncState, syncError, cloudEnabled } = useData()

  if (!cloudEnabled) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] md:text-xs text-slate-400">
        <CloudOff className="h-3 w-3" strokeWidth={2} aria-hidden />
        {labels.local}
      </span>
    )
  }

  const busy = syncState === 'loading' || syncState === 'saving'

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] md:text-xs max-w-[9rem] truncate ${
        syncState === 'error' ? 'text-red-600' : 'text-teal-700'
      }`}
      title={syncError ?? labels[syncState]}
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin shrink-0" strokeWidth={2} aria-hidden />
      ) : (
        <Cloud className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
      )}
      {syncState === 'error' ? labels.error : labels[syncState]}
    </span>
  )
}
