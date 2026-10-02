import { ChevronLeft, ChevronRight, MapPin, Phone, Plus, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PaginationBar, usePagination } from '../components/Pagination'
import { ClientForm } from '../components/ClientForm'
import { LotEditor } from '../components/LotEditor'
import { LotForm } from '../components/LotForm'
import { Modal } from '../components/Modal'
import { PaymentForm } from '../components/PaymentForm'
import { Money } from '../components/Money'
import { StatusBadge } from '../components/StatusBadge'
import { DangerButton } from '../components/Field'
import {
  buildPaymentHistoryWithBalance,
  countRemainingInstallments,
  getClientLots,
  getClientSummary,
  getLotOverdueItems,
  getLotRemaining,
  getLotTotalPaid,
  installmentAmountDue,
  lotLabel,
  syncInstallmentPaidAmounts,
} from '../lib/calculations'
import { formatDateBR as fmt } from '../lib/dates'
import { useData } from '../context/DataContext'
import type { Lot } from '../types'

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, upsertClient, deleteClient, upsertLot, deleteLot } = useData()

  const client = data.clients.find((c) => c.id === id)
  const lots = useMemo(
    () => (client ? getClientLots(data.lots, client.id) : []),
    [client, data.lots],
  )
  const summary = client ? getClientSummary(client, data.lots, data.payments) : null
  const history = client
    ? buildPaymentHistoryWithBalance(client.id, data.lots, data.payments)
    : []

  const [editClient, setEditClient] = useState(false)
  const [lotModal, setLotModal] = useState<Lot | 'new' | null>(null)
  const [payModal, setPayModal] = useState(false)
  const [savedRemaining, setSavedRemaining] = useState<number | null>(null)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState(10)

  const historyNewestFirst = useMemo(() => [...history].reverse(), [history])
  const historyPagination = usePagination(historyNewestFirst, historyPageSize, historyPage)

  if (!client || !summary) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-600">Cliente não encontrado.</p>
        <Link to="/clientes" className="text-teal-700 font-medium mt-2 inline-block">
          Voltar
        </Link>
      </div>
    )
  }

  const confirmDelete = () => {
    if (window.confirm(`Excluir ${client.name} e todos os terrenos/pagamentos?`)) {
      deleteClient(client.id)
      navigate('/clientes')
    }
  }

  return (
    <div className="space-y-4 md:space-y-6 text-left pb-6 md:pb-8">
      <Link
        to="/clientes"
        className="text-xs md:text-sm text-teal-700 font-medium inline-flex items-center gap-0.5"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
        Clientes
      </Link>

      <header className="rounded-xl md:rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3 md:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-base md:text-xl font-bold text-slate-900 leading-snug pr-1">{client.name}</h1>
          <StatusBadge status={summary.status} />
        </div>
        {client.address && (
          <p className="text-xs md:text-sm text-slate-600 mt-1 inline-flex items-start gap-1">
            <MapPin className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0 text-slate-400 mt-0.5" strokeWidth={2} aria-hidden />
            <span>{client.address}</span>
          </p>
        )}
        {client.phone && (
          <p className="text-xs md:text-sm text-slate-600 mt-1 inline-flex items-center gap-1">
            <Phone className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
            {client.phone}
          </p>
        )}
        {client.notes && (
          <p className="text-xs md:text-sm text-slate-500 mt-2 whitespace-pre-line">{client.notes}</p>
        )}

        <dl className="grid grid-cols-2 gap-2 md:gap-3 mt-3 md:mt-4 text-xs md:text-sm">
          <SummaryItem label="Total comprado" value={<Money value={summary.totalPurchased} />} />
          <SummaryItem label="Total pago" value={<Money value={summary.totalPaid} className="text-emerald-700" />} />
          <SummaryItem
            label="Total restante"
            value={<Money value={summary.totalRemaining} className="text-teal-800 font-bold" />}
          />
          <SummaryItem label="Terrenos" value={String(summary.lotCount)} />
          <SummaryItem label="Parcelas restantes" value={String(summary.remainingInstallments)} />
        </dl>

        {summary.status === 'atraso' && summary.oldestOverdue && (
          <p className="mt-2 md:mt-3 text-xs md:text-sm font-medium text-amber-900 bg-amber-50 rounded-lg px-2.5 py-2 md:px-3 border border-amber-100 flex gap-1.5">
            <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={2.5} aria-hidden />
            <span>
            Em atraso — venc. {fmt(summary.oldestOverdue.dueDate)} —{' '}
            <Money value={summary.oldestOverdue.amount} /> — {summary.oldestOverdue.daysLate} dias (
            {summary.oldestOverdue.lotLabel})
            </span>
          </p>
        )}

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            type="button"
            onClick={() => setEditClient(true)}
            className="min-h-9 md:min-h-10 px-3 md:px-4 rounded-lg md:rounded-xl border border-slate-300 text-xs md:text-sm font-medium"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => setLotModal('new')}
            className="min-h-9 md:min-h-10 px-3 md:px-4 rounded-lg md:rounded-xl border border-slate-300 text-xs md:text-sm font-medium"
          >
            + Terreno
          </button>
        </div>
      </header>

      {savedRemaining != null && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-900 text-sm font-medium">
          Pagamento registrado! Novo saldo restante neste terreno:{' '}
          <Money value={savedRemaining} />
        </div>
      )}

      <section className="space-y-4">
        <h2 className="text-sm md:text-base font-semibold">Terrenos</h2>
        {lots.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum terreno cadastrado.</p>
        ) : (
          lots.map((lot) => (
            <LotCard
              key={lot.id}
              lot={lot}
              client={client}
              payments={data.payments}
              onEdit={() => setLotModal(lot)}
              onDelete={() => {
                if (window.confirm('Excluir este terreno e seus pagamentos?')) deleteLot(lot.id)
              }}
            />
          ))
        )}
      </section>

      <section>
        <h2 className="text-sm md:text-base font-semibold mb-2 md:mb-3">Histórico de pagamentos</h2>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum pagamento registrado.</p>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-3 font-semibold">Data</th>
                    <th className="p-3 font-semibold">Terreno</th>
                    <th className="p-3 font-semibold">Descrição</th>
                    <th className="p-3 font-semibold text-right">Valor</th>
                    <th className="p-3 font-semibold text-right">Saldo após</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyPagination.slice.map((h) => (
                    <tr key={h.id}>
                      <td className="p-3">{fmt(h.date)}</td>
                      <td className="p-3">{h.lotLabel}</td>
                      <td className="p-3">{h.description}</td>
                      <td className="p-3 text-right font-medium">
                        <Money value={h.amount} />
                      </td>
                      <td className="p-3 text-right text-slate-600">
                        <Money value={h.balanceAfter} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden space-y-2">
              {historyPagination.slice.map((h) => (
                <li key={h.id} className="rounded-lg md:rounded-xl border border-slate-200 p-2.5 md:p-3 text-xs md:text-sm">
                  <div className="flex justify-between font-medium">
                    <span>{fmt(h.date)}</span>
                    <Money value={h.amount} />
                  </div>
                  <p className="text-slate-600 mt-1">
                    {h.lotLabel} — {h.description}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Saldo após: <Money value={h.balanceAfter} />
                  </p>
                </li>
              ))}
            </ul>
            <PaginationBar
              page={historyPagination.safePage}
              totalPages={historyPagination.totalPages}
              total={historyPagination.total}
              start={historyPagination.start}
              end={historyPagination.end}
              pageSize={historyPageSize}
              onPageChange={setHistoryPage}
              onPageSizeChange={(size) => {
                setHistoryPageSize(size)
                setHistoryPage(1)
              }}
            />
          </>
        )}
      </section>

      <DangerButton onClick={confirmDelete} className="mt-8">
        Excluir cliente
      </DangerButton>

      <div className="fixed bottom-[3.25rem] left-0 right-0 z-20 px-3 md:static md:px-0 md:mt-4">
        <div className="max-w-3xl mx-auto">
          <button
            type="button"
            onClick={() => {
              setSavedRemaining(null)
              setPayModal(true)
            }}
            className="w-full min-h-11 md:min-h-14 rounded-xl md:rounded-2xl bg-teal-700 text-white text-sm md:text-lg font-bold shadow-lg hover:bg-teal-800 active:scale-[0.99] transition-transform inline-flex items-center justify-center gap-1.5 md:gap-2"
          >
            <Plus className="h-5 w-5 md:h-6 md:w-6" strokeWidth={2.5} aria-hidden />
            REGISTRAR PAGAMENTO
          </button>
        </div>
      </div>

      <Modal title="Editar cliente" open={editClient} onClose={() => setEditClient(false)}>
        <ClientForm
          initial={client}
          onSave={(c) => {
            upsertClient(c)
            setEditClient(false)
          }}
          onCancel={() => setEditClient(false)}
        />
      </Modal>

      <Modal
        title={lotModal === 'new' ? 'Novo terreno' : 'Editar lote e parcelas'}
        open={lotModal !== null}
        onClose={() => setLotModal(null)}
        wide
      >
        {lotModal === 'new' ? (
          <LotForm
            clientId={client.id}
            onSave={(lot) => {
              upsertLot(lot)
              setLotModal(null)
            }}
            onCancel={() => setLotModal(null)}
          />
        ) : (
          lotModal && (
            <LotEditor
              clientId={client.id}
              initial={lotModal}
              payments={data.payments}
              onSave={(lot) => {
                upsertLot(lot)
                setLotModal(null)
              }}
              onCancel={() => setLotModal(null)}
            />
          )
        )}
      </Modal>

      <Modal title="Registrar pagamento" open={payModal} onClose={() => setPayModal(false)}>
        <PaymentForm
          clientId={client.id}
          lots={lots}
          onSaved={(remaining) => {
            setSavedRemaining(remaining)
            setPayModal(false)
          }}
          onCancel={() => setPayModal(false)}
        />
      </Modal>
    </div>
  )
}

function SummaryItem({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div>
      <dt className="text-[10px] md:text-xs text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-900 mt-0.5 text-xs md:text-sm">{value}</dd>
    </div>
  )
}

function LotCard({
  lot,
  client,
  payments,
  onEdit,
  onDelete,
}: {
  lot: Lot
  client: { id: string; name: string }
  payments: import('../types').Payment[]
  onEdit: () => void
  onDelete: () => void
}) {
  const synced = syncInstallmentPaidAmounts(lot, payments)
  const paid = getLotTotalPaid(lot, payments)
  const remaining = getLotRemaining(lot, payments)
  const paidInst = synced.filter((i) => installmentAmountDue(i) <= 0.01).length
  const restInst = countRemainingInstallments(lot, payments)
  const overdue = getLotOverdueItems(client as import('../types').Client, lot, payments)
  const nextDue = synced
    .filter((i) => installmentAmountDue(i) > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]

  return (
    <article className="rounded-xl md:rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={onEdit}
        className="w-full text-left p-3 md:p-4 hover:bg-slate-50/80 active:bg-slate-50 transition-colors"
      >
        <div className="flex justify-between items-start gap-1.5">
          <div className="min-w-0">
            <h3 className="text-sm md:text-base font-bold text-slate-900 leading-snug">
              Quadra {lot.quadra}, Lote {lot.lote}
            </h3>
            <p className="text-[11px] text-slate-500">{lotLabel(lot)}</p>
            <p className="text-[11px] md:text-xs text-teal-700 font-medium mt-1.5 inline-flex items-center gap-0.5">
              Editar valor e parcelas
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            </p>
          </div>
          <ChevronRight className="h-4 w-4 md:h-5 md:w-5 text-slate-300 shrink-0 mt-0.5" strokeWidth={2} aria-hidden />
        </div>
      <ul className="mt-2 md:mt-3 space-y-0.5 text-xs md:text-sm text-slate-700">
        <li>
          Valor: <Money value={lot.totalValue} className="font-medium" />
        </li>
        <li>
          Já pago: <Money value={paid} className="text-emerald-700" /> — Restante:{' '}
          <Money value={remaining} className="font-semibold text-teal-800" />
        </li>
        <li>
          Parcelas: {paidInst} pagas · {restInst} restantes
        </li>
        {nextDue && (
          <li>Próximo vencimento: {fmt(nextDue.dueDate)} — <Money value={installmentAmountDue(nextDue)} /></li>
        )}
      </ul>
      {overdue.length > 0 && (
        <ul className="mt-2 text-[11px] md:text-xs text-amber-900 bg-amber-50 rounded-lg p-2 space-y-0.5 leading-snug">
          {overdue.map((o) => (
            <li key={o.installmentId}>
              <TriangleAlert className="h-3.5 w-3.5 inline shrink-0" strokeWidth={2.5} aria-hidden />{' '}
              {o.installmentLabel} — venc. {fmt(o.dueDate)} — <Money value={o.amountDue} /> —{' '}
              {o.daysLate} dias
            </li>
          ))}
        </ul>
      )}
      </button>
      <div className="px-4 pb-3 flex justify-end border-t border-slate-100 pt-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="text-xs text-red-600 font-medium min-h-9 px-3"
        >
          Excluir terreno
        </button>
      </div>
    </article>
  )
}
