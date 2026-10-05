import { TriangleAlert } from 'lucide-react'
import type { ClientStatus } from '../types'

const config: Record<
  ClientStatus,
  { label: string; short: string; className: string; dot: string }
> = {
  em_dia: {
    label: 'Em dia',
    short: 'Em dia',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  atraso: {
    label: 'Em atraso',
    short: 'Atraso',
    className: 'bg-rose-50 text-rose-800 border-rose-200',
    dot: 'bg-rose-500',
  },
  quitado: {
    label: 'Quitado',
    short: 'Quitado',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
  },
}

export function StatusBadge({ status }: { status: ClientStatus }) {
  const c = config[status]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] md:text-xs font-semibold max-w-[5.5rem] md:max-w-none ${c.className}`}
    >
      <span className={`h-1.5 w-1.5 md:h-2 md:w-2 rounded-full shrink-0 ${c.dot}`} />
      {status === 'atraso' && (
        <TriangleAlert className="h-3 w-3 shrink-0 md:h-3.5 md:w-3.5" strokeWidth={2.5} aria-hidden />
      )}
      <span className="truncate md:hidden">{c.short}</span>
      <span className="truncate hidden md:inline">{c.label}</span>
    </span>
  )
}
