import { ChevronLeft, ChevronRight, MapPin, Pencil, Phone, Plus, Trash2, TriangleAlert } from 'lucide-react'
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
  syncInstallmentPaidAmounts,
} from '../lib/calculations'
import { formatDateBR as fmt } from '../lib/dates'
import { useData } from '../context/DataContext'
import type { Client, Lot, Payment } from '../types'

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
  const [payDefaults, setPayDefaults] = useState<{
    lotId?: string
    installmentId?: string
  }>({})
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

  const hasContact = client.address || client.phone

  return (
    <div className="space-y-6 md:space-y-8 text-left pb-24 md:pb-8 max-w-3xl">
      <Link
        to="/clientes"
        className="text-xs md:text-sm text-slate-500 hover:text-teal-700 font-medium inline-flex items-center gap-0.5 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
        Clientes
      </Link>

      {/* Identidade */}
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">{client.name}</h1>
            {hasContact && (
              <div className="mt-2 space-y-1 text-sm text-slate-600">
                {client.address && (
                  <p className="inline-flex items-start gap-1.5">
                    <MapPin className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" strokeWidth={2} aria-hidden />
                    <span>{client.address}</span>
                  </p>
                )}
                {client.phone && (
                  <p className="inline-flex items-center gap-1.5">
                    <Phone className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
                    {client.phone}
                  </p>
                )}
              </div>
            )}
          </div>
          <StatusBadge status={summary.status} />
        </div>

        {client.notes && (
          <p className="text-sm text-slate-500 border-l-2 border-slate-200 pl-3 whitespace-pre-line">
            {client.notes}
          </p>
        )}

        {summary.status === 'atraso' && summary.oldestOverdue && (
          <p className="text-sm text-rose-800 flex items-start gap-2 py-2 border-b border-rose-100">
            <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" strokeWidth={2} aria-hidden />
            <span>
              <span className="font-medium">Em atraso</span>
              {' — '}
              {summary.oldestOverdue.lotLabel}, venc. {fmt(summary.oldestOverdue.dueDate)},{' '}
              <Money value={summary.oldestOverdue.amount} /> ({summary.oldestOverdue.daysLate} dias)
              {summary.overdueCount > 1 && (
                <span className="text-slate-500"> · +{summary.overdueCount - 1} parcela(s)</span>
              )}
            </span>
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditClient(true)}
            className="min-h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Editar
          </button>
          <button
            type="button"
            onClick={() => setLotModal('new')}
            className="min-h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            + Terreno
          </button>
        </div>
      </header>

      {/* Resumo financeiro */}
      <section aria-labelledby="resumo-financeiro">
        <h2 id="resumo-financeiro" className="sr-only">
          Resumo financeiro
        </h2>
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
            <MetricCell label="Total comprado" value={<Money value={summary.totalPurchased} />} />
            <MetricCell
              label="Total pago"
              value={<Money value={summary.totalPaid} className="text-emerald-700" />}
            />
            <MetricCell
              label="Restante"
              value={<Money value={summary.totalRemaining} className="text-teal-800 font-bold" />}
              highlight
            />
          </div>
          <dl className="grid grid-cols-2 divide-x divide-slate-100 text-center text-sm">
            <div className="py-3 px-2">
              <dt className="text-xs text-slate-500">Terrenos</dt>
              <dd className="font-semibold text-slate-900 mt-0.5">{summary.lotCount}</dd>
            </div>
            <div className="py-3 px-2">
              <dt className="text-xs text-slate-500">Parcelas restantes</dt>
              <dd className="font-semibold text-slate-900 mt-0.5">{summary.remainingInstallments}</dd>
            </div>
          </dl>
          {summary.lastPaymentDate && (
            <p className="text-xs text-slate-500 text-center py-2 border-t border-slate-100 bg-slate-50/80">
              Último pagamento: {fmt(summary.lastPaymentDate)}
            </p>
          )}
        </div>
      </section>

      {savedRemaining != null && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-900">
          Pagamento registrado. Saldo restante neste terreno: <Money value={savedRemaining} className="font-semibold" />
        </div>
      )}

      {/* Terrenos */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Terrenos</h2>
          <span className="text-xs text-slate-500">{lots.length} cadastrado(s)</span>
        </div>
        {lots.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center rounded-xl border border-dashed border-slate-200">
            Nenhum terreno cadastrado.
          </p>
        ) : (
          <ul className="space-y-3">
            {lots.map((lot) => (
              <li key={lot.id}>
                <LotCard
                  lot={lot}
                  client={client}
                  payments={data.payments}
                  onEdit={() => setLotModal(lot)}
                  onRegisterEntrada={(lotId, installmentId) => {
                    setSavedRemaining(null)
                    setPayDefaults({ lotId, installmentId })
                    setPayModal(true)
                  }}
                  onDelete={() => {
                    if (window.confirm('Excluir este terreno e seus pagamentos?')) deleteLot(lot.id)
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Histórico */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Histórico de pagamentos</h2>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500 py-4">Nenhum pagamento registrado.</p>
        ) : (
          <>
            <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Data</th>
                    <th className="px-4 py-2.5 font-medium">Terreno</th>
                    <th className="px-4 py-2.5 font-medium">Descrição</th>
                    <th className="px-4 py-2.5 font-medium text-right">Valor</th>
                    <th className="px-4 py-2.5 font-medium text-right">Saldo após</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyPagination.slice.map((h) => (
                    <tr key={h.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 text-slate-700">{fmt(h.date)}</td>
                      <td className="px-4 py-2.5 text-slate-600">{h.lotLabel}</td>
                      <td className="px-4 py-2.5">{h.description}</td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                        <Money value={h.amount} />
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">
                        <Money value={h.balanceAfter} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden space-y-2">
              {historyPagination.slice.map((h) => (
                <li
                  key={h.id}
                  className="rounded-lg border border-slate-200 bg-white p-3 text-sm"
                >
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="font-medium text-slate-900">{fmt(h.date)}</span>
                    <Money value={h.amount} className="font-semibold tabular-nums" />
                  </div>
                  <p className="text-slate-600 mt-1 text-xs leading-relaxed">
                    {h.lotLabel} · {h.description}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 tabular-nums">
                    Saldo: <Money value={h.balanceAfter} />
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

      <DangerButton onClick={confirmDelete} className="mt-4">
        Excluir cliente
      </DangerButton>

      <div className="fixed bottom-[3.25rem] left-0 right-0 z-20 px-3 md:static md:px-0">
        <button
          type="button"
          onClick={() => {
            setSavedRemaining(null)
            setPayDefaults({})
            setPayModal(true)
          }}
          className="w-full max-w-3xl mx-auto min-h-11 md:min-h-12 rounded-xl bg-teal-700 text-white text-sm md:text-base font-semibold shadow-md hover:bg-teal-800 active:scale-[0.99] transition-transform inline-flex items-center justify-center gap-2"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden />
          Registrar pagamento
        </button>
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

      <Modal
        title={payDefaults.installmentId ? 'Registrar entrada' : 'Registrar pagamento'}
        open={payModal}
        onClose={() => setPayModal(false)}
      >
        <PaymentForm
          key={`${payDefaults.lotId ?? ''}-${payDefaults.installmentId ?? ''}`}
          clientId={client.id}
          lots={lots}
          defaultLotId={payDefaults.lotId}
          defaultInstallmentId={payDefaults.installmentId}
          onSaved={(remaining) => {
            setSavedRemaining(remaining)
            setPayModal(false)
            setPayDefaults({})
          }}
          onCancel={() => {
            setPayModal(false)
            setPayDefaults({})
          }}
        />
      </Modal>
    </div>
  )
}

function MetricCell({
  label,
  value,
  highlight,
}: {
  label: string
  value: React.ReactNode
  highlight?: boolean
}) {
  return (
    <div className={`py-4 px-2 md:px-4 text-center ${highlight ? 'bg-teal-50/40' : ''}`}>
      <p className="text-[10px] md:text-xs uppercase tracking-wide text-slate-500 font-medium">{label}</p>
      <p className="mt-1 text-sm md:text-base font-semibold text-slate-900 tabular-nums">{value}</p>
    </div>
  )
}

function LotCard({
  lot,
  client,
  payments,
  onEdit,
  onRegisterEntrada,
  onDelete,
}: {
  lot: Lot
  client: Client
  payments: Payment[]
  onEdit: () => void
  onRegisterEntrada: (lotId: string, installmentId: string) => void
  onDelete: () => void
}) {
  const synced = syncInstallmentPaidAmounts(lot, payments)
  const paid = getLotTotalPaid(lot, payments)
  const remaining = getLotRemaining(lot, payments)
  const paidInst = synced.filter((i) => installmentAmountDue(i) <= 0.01).length
  const restInst = countRemainingInstallments(lot, payments)
  const overdue = getLotOverdueItems(client, lot, payments)
  const nextDue = synced
    .filter((i) => installmentAmountDue(i) > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
  const worstOverdue = overdue.length > 0 ? overdue[0] : null
  const entradaInst = synced.find((i) => i.label === 'Entrada' || i.number === 0)
  const entradaAberta =
    entradaInst &&
    entradaInst.expectedAmount > 0 &&
    installmentAmountDue(entradaInst) > 0.01

  return (
    <article className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Lote {lot.lote}
              {lot.quadra !== '—' && (
                <span className="text-slate-500 font-normal text-sm"> · Quadra {lot.quadra}</span>
              )}
            </h3>
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 text-sm font-medium text-teal-700 hover:text-teal-800 inline-flex items-center gap-0.5 min-h-9 px-2 -mr-2"
          >
            Editar
            <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Valor do lote</dt>
            <dd className="font-semibold text-slate-900 mt-0.5 tabular-nums">
              <Money value={lot.totalValue} />
            </dd>
          </div>
          {entradaInst && entradaInst.expectedAmount > 0 ? (
            <div>
              <dt className="text-xs text-slate-500">Entrada</dt>
              <dd className="font-semibold text-slate-900 mt-0.5 tabular-nums">
                <Money value={entradaInst.expectedAmount} />
                <span className="block text-[11px] font-normal text-slate-500 mt-0.5">
                  venc. {fmt(entradaInst.dueDate)}
                  {installmentAmountDue(entradaInst) <= 0.01 ? ' · paga' : ' · em aberto'}
                </span>
                {entradaAberta && (
                  <button
                    type="button"
                    onClick={() => onRegisterEntrada(lot.id, entradaInst.id)}
                    className="mt-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800"
                  >
                    Registrar entrada
                  </button>
                )}
              </dd>
            </div>
          ) : (
            <div>
              <dt className="text-xs text-slate-500">Entrada</dt>
              <dd className="text-slate-400 mt-0.5 text-xs">—</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-slate-500">Já pago</dt>
            <dd className="font-semibold text-emerald-700 mt-0.5 tabular-nums">
              <Money value={paid} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Restante</dt>
            <dd className="font-semibold text-teal-800 mt-0.5 tabular-nums">
              <Money value={remaining} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Parcelas</dt>
            <dd className="font-medium text-slate-800 mt-0.5">
              {paidInst} pagas · {restInst} restantes
            </dd>
          </div>
        </dl>

        {nextDue && (
          <p className="mt-3 text-xs text-slate-600 border-t border-slate-100 pt-3">
            Próximo vencimento:{' '}
            <span className="font-medium text-slate-800">{fmt(nextDue.dueDate)}</span>
            {' — '}
            <Money value={installmentAmountDue(nextDue)} />
          </p>
        )}

        {worstOverdue && (
          <p className="mt-2 text-xs text-rose-700">
            <TriangleAlert className="h-3.5 w-3.5 inline -mt-0.5 mr-1" strokeWidth={2} aria-hidden />
            {overdue.length === 1 ? '1 parcela em atraso' : `${overdue.length} parcelas em atraso`}
            {' — '}
            {worstOverdue.installmentLabel}, {worstOverdue.daysLate} dias (
            <Money value={worstOverdue.amountDue} />)
          </p>
        )}
      </div>

      <div className="flex justify-end border-t border-slate-100 bg-slate-50/50 px-3 py-2">
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-slate-500 hover:text-red-600 font-medium min-h-9 px-2 inline-flex items-center gap-1"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Excluir terreno
        </button>
      </div>
    </article>
  )
}
