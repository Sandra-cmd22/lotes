import { TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Money } from '../components/Money'
import { PaginationBar, usePagination } from '../components/Pagination'
import { StatusBadge } from '../components/StatusBadge'
import { getClientSummary, getDashboardStats } from '../lib/calculations'
import { formatDateBR } from '../lib/dates'
import { useData } from '../context/DataContext'
import type { ClientStatus } from '../types'

type Filter = 'todos' | ClientStatus

export function Dashboard() {
  const { data } = useData()
  const [filter, setFilter] = useState<Filter>('todos')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(8)

  const stats = useMemo(() => getDashboardStats(data), [data])

  const rows = useMemo(() => {
    return data.clients
      .map((c) => ({ client: c, summary: getClientSummary(c, data.lots, data.payments) }))
      .sort((a, b) => {
        const order = { atraso: 0, em_dia: 1, quitado: 2 }
        const d = order[a.summary.status] - order[b.summary.status]
        if (d !== 0) return d
        return a.client.name.localeCompare(b.client.name, 'pt-BR')
      })
  }, [data])

  const filtered = rows.filter((r) => filter === 'todos' || r.summary.status === filter)

  useEffect(() => {
    setPage(1)
  }, [filter])

  const pagination = usePagination(filtered, pageSize, page)

  const overdueHighlight = rows.filter((r) => r.summary.status === 'atraso')

  return (
    <div className="space-y-4 md:space-y-6 text-left">
      <section className="grid grid-cols-2 gap-2 md:gap-3 sm:grid-cols-3">
        <StatCard label="Clientes" value={String(stats.totalClients)} />
        <StatCard label="Terrenos vendidos" value={String(stats.totalLotsSold)} />
        <StatCard label="Valor vendido" money={stats.totalSoldValue} className="col-span-2 sm:col-span-1" />
        <StatCard label="Já recebido" money={stats.totalReceived} accent />
        <StatCard label="A receber" money={stats.totalToReceive} />
        <StatCard label="Parcelas atrasadas" value={String(stats.overdueInstallmentsCount)} warn={stats.overdueInstallmentsCount > 0} />
        <StatCard label="Clientes em atraso" value={String(stats.clientsInArrears)} warn={stats.clientsInArrears > 0} />
      </section>

      {overdueHighlight.length > 0 && (
        <section className="rounded-xl md:rounded-2xl border border-amber-200 bg-amber-50/80 p-3 md:p-4">
          <h2 className="text-xs md:text-sm font-bold text-amber-900 mb-2 md:mb-3 flex items-center gap-1.5">
            <TriangleAlert className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
            Clientes em atraso
          </h2>
          <ul className="space-y-3">
            {overdueHighlight.map(({ client, summary }) => (
              <li key={client.id}>
                <Link
                  to={`/clientes/${client.id}`}
                  className="block rounded-lg md:rounded-xl bg-white border border-amber-100 p-2.5 md:p-3 hover:border-amber-300"
                >
                  <p className="text-sm font-semibold text-slate-900">{client.name}</p>
                  {summary.oldestOverdue && (
                    <p className="text-[11px] md:text-sm text-amber-900 mt-1 leading-snug">
                      Parcela vencida: {formatDateBR(summary.oldestOverdue.dueDate)} —{' '}
                      <Money value={summary.oldestOverdue.amount} /> —{' '}
                      {summary.oldestOverdue.daysLate} dias em atraso ({summary.oldestOverdue.lotLabel})
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm md:text-base font-semibold text-slate-900 w-full sm:w-auto">Clientes</h2>
          <div className="flex flex-wrap gap-1 w-full sm:w-auto">
            {(
              [
                ['todos', 'Todos'],
                ['em_dia', 'Em dia'],
                ['atraso', 'Atraso'],
                ['quitado', 'Quitados'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`min-h-7 md:min-h-9 px-2 md:px-3 rounded-full text-[10px] md:text-xs font-semibold border ${
                  filter === key
                    ? 'bg-teal-700 text-white border-teal-700'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">
            Nenhum cliente encontrado.{' '}
            <Link to="/clientes" className="text-teal-700 font-medium">
              Adicionar cliente
            </Link>
          </p>
        ) : (
          <ul className="space-y-2 md:space-y-3">
            {pagination.slice.map(({ client, summary }) => (
              <li key={client.id}>
                <Link
                  to={`/clientes/${client.id}`}
                  className={`block rounded-xl md:rounded-2xl border p-3 md:p-4 hover:border-teal-300 transition-colors ${
                    summary.status === 'atraso'
                      ? 'border-amber-200 bg-amber-50/30'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 pr-1">{client.name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {summary.lotCount} terreno{summary.lotCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <StatusBadge status={summary.status} />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 md:mt-3 text-xs md:text-sm">
                    <div>
                      <dt className="text-slate-500 text-[10px] md:text-xs">Total compra</dt>
                      <dd className="font-medium">
                        <Money value={summary.totalPurchased} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 text-[10px] md:text-xs">Pago</dt>
                      <dd className="font-medium text-emerald-700">
                        <Money value={summary.totalPaid} />
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-slate-500 text-[10px] md:text-xs">Restante</dt>
                      <dd className="font-semibold text-teal-800">
                        <Money value={summary.totalRemaining} />
                      </dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {filtered.length > 0 && (
          <PaginationBar
            page={pagination.safePage}
            totalPages={pagination.totalPages}
            total={pagination.total}
            start={pagination.start}
            end={pagination.end}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
          />
        )}
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  money,
  accent,
  warn,
  className = '',
}: {
  label: string
  value?: string
  money?: number
  accent?: boolean
  warn?: boolean
  className?: string
}) {
  return (
    <div
      className={`rounded-xl md:rounded-2xl border p-2 md:p-3 ${warn ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'} ${className}`}
    >
      <p className="text-[10px] md:text-xs text-slate-500 font-medium leading-tight">{label}</p>
      <p
        className={`text-sm md:text-lg font-bold mt-0.5 md:mt-1 tabular-nums ${accent ? 'text-teal-800' : warn ? 'text-amber-900' : 'text-slate-900'}`}
      >
        {money != null ? <Money value={money} /> : value}
      </p>
    </div>
  )
}
