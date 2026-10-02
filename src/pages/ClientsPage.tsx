import { UserPlus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClientForm } from '../components/ClientForm'
import { Modal } from '../components/Modal'
import { Money } from '../components/Money'
import { PaginationBar, usePagination } from '../components/Pagination'
import { StatusBadge } from '../components/StatusBadge'
import { getClientSummary } from '../lib/calculations'
import { formatDateBR } from '../lib/dates'
import { useData } from '../context/DataContext'

export function ClientsPage() {
  const { data, upsertClient } = useData()
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(12)

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return data.clients
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .map((c) => ({
        client: c,
        summary: getClientSummary(c, data.lots, data.payments),
      }))
      .sort((a, b) => a.client.name.localeCompare(b.client.name, 'pt-BR'))
  }, [data, search])

  useEffect(() => {
    setPage(1)
  }, [search])

  const pagination = usePagination(list, pageSize, page)

  return (
    <div className="space-y-3 md:space-y-4 text-left">
      <div className="flex flex-col gap-2 md:gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          placeholder="Pesquisar pelo nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-h-10 md:min-h-12 rounded-lg md:rounded-xl border border-slate-300 px-3 md:px-4 text-sm md:text-base focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
        />
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="min-h-10 md:min-h-12 px-4 md:px-5 rounded-lg md:rounded-xl bg-teal-700 text-white text-sm md:text-base font-semibold whitespace-nowrap hover:bg-teal-800 inline-flex items-center justify-center gap-1.5"
        >
          <UserPlus className="h-4 w-4 md:h-5 md:w-5" strokeWidth={2} aria-hidden />
          Novo cliente
        </button>
      </div>

      {list.length === 0 ? (
        <p className="text-center text-slate-500 py-12 text-sm">
          {data.clients.length === 0
            ? 'Nenhum cliente cadastrado ainda.'
            : 'Nenhum resultado para a busca.'}
        </p>
      ) : (
        <ul className="space-y-1.5 md:space-y-2">
          {pagination.slice.map(({ client, summary }) => (
            <li key={client.id}>
              <Link
                to={`/clientes/${client.id}`}
                className="flex items-start justify-between gap-2 md:gap-3 rounded-lg md:rounded-xl border border-slate-200 bg-white p-3 md:p-4 hover:border-teal-400"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">{client.name}</p>
                  <p className="text-xs md:text-sm text-slate-600 mt-0.5 md:mt-1 leading-snug">
                    Total{' '}
                    <Money value={summary.totalPurchased} className="font-medium" />
                    <span className="text-slate-400 mx-0.5">·</span>
                    Restante{' '}
                    <Money value={summary.totalRemaining} className="font-semibold text-teal-800" />
                  </p>
                  <p className="text-[11px] md:text-xs text-slate-500 mt-0.5">
                    Último pagamento:{' '}
                    {summary.lastPaymentDate ? (
                      <span className="font-medium text-slate-700">
                        {formatDateBR(summary.lastPaymentDate)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </p>
                </div>
                <StatusBadge status={summary.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {list.length > 0 && (
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

      <Modal title="Novo cliente" open={showNew} onClose={() => setShowNew(false)}>
        <ClientForm
          onSave={(c) => {
            upsertClient(c)
            setShowNew(false)
          }}
          onCancel={() => setShowNew(false)}
        />
      </Modal>
    </div>
  )
}
