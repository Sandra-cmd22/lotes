import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { syncInstallmentPaidAmounts } from '../lib/calculations'
import { todayISO } from '../lib/dates'
import { createId } from '../lib/id'
import { parseMoneyInput, roundMoney } from '../lib/money'
import type { Installment, Lot, Payment } from '../types'
import { Field, PrimaryButton, TextInput } from './Field'
import { Money } from './Money'

function initInstallments(lot: Lot | undefined, payments: Payment[]): Installment[] {
  if (!lot) return []
  return syncInstallmentPaidAmounts(lot, payments)
}

export function LotEditor({
  clientId,
  initial,
  payments,
  onSave,
  onCancel,
}: {
  clientId: string
  initial?: Lot
  payments: Payment[]
  onSave: (lot: Lot) => void
  onCancel: () => void
}) {
  const [quadra, setQuadra] = useState(initial?.quadra ?? '—')
  const [lote, setLote] = useState(initial?.lote ?? '')
  const [totalValueStr, setTotalValueStr] = useState(
    initial ? String(initial.totalValue) : '',
  )
  const [installments, setInstallments] = useState<Installment[]>(() =>
    initInstallments(initial, payments),
  )

  const totalValue = useMemo(() => parseMoneyInput(totalValueStr), [totalValueStr])
  const scheduleSum = useMemo(
    () => roundMoney(installments.reduce((s, i) => s + i.expectedAmount, 0)),
    [installments],
  )
  const totalPaidOnLot = useMemo(() => {
    if (!initial) return 0
    return roundMoney(
      payments.filter((p) => p.lotId === initial.id).reduce((s, p) => s + p.amount, 0),
    )
  }, [initial, payments])

  const updateInst = (id: string, patch: Partial<Installment>) => {
    setInstallments((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }

  const addInstallment = () => {
    const n = installments.filter((i) => i.number != null && i.number > 0).length + 1
    setInstallments((list) => [
      ...list,
      {
        id: createId(),
        number: n,
        label: `Parcela ${n}`,
        dueDate: todayISO(),
        expectedAmount: 0,
        paidAmount: 0,
      },
    ])
  }

  const removeInstallment = (inst: Installment) => {
    if (inst.paidAmount > 0.01) {
      if (!window.confirm('Esta parcela já tem pagamentos. Remover mesmo assim?')) return
    }
    setInstallments((list) => list.filter((i) => i.id !== inst.id))
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!lote.trim() || totalValue <= 0) return

    const lotId = initial?.id ?? createId()
    const draft: Lot = {
      id: lotId,
      clientId,
      quadra: quadra.trim() || '—',
      lote: lote.trim(),
      totalValue,
      paymentType: initial?.paymentType ?? 'parcelado',
      installments,
      avistaDueDate: initial?.avistaDueDate,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    }

    onSave({
      ...draft,
      installments: syncInstallmentPaidAmounts(draft, payments),
    })
  }

  return (
    <form onSubmit={submit} className="space-y-3 md:space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quadra">
          <TextInput value={quadra} onChange={(e) => setQuadra(e.target.value)} />
        </Field>
        <Field label="Lote *">
          <TextInput value={lote} onChange={(e) => setLote(e.target.value)} required />
        </Field>
      </div>

      <Field label="Valor total do lote (R$) *">
        <TextInput
          value={totalValueStr}
          onChange={(e) => setTotalValueStr(e.target.value)}
          inputMode="decimal"
          required
        />
      </Field>

      {initial && (
        <p className="text-sm text-slate-600 -mt-2">
          Já pago (pagamentos registrados):{' '}
          <Money value={totalPaidOnLot} className="font-semibold text-emerald-700" />
        </p>
      )}

      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between bg-slate-50 px-2.5 md:px-3 py-1.5 md:py-2 gap-2">
          <p className="text-xs md:text-sm font-semibold text-slate-800">Parcelas</p>
          <button
            type="button"
            onClick={addInstallment}
            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 min-h-9 px-2 rounded-lg hover:bg-teal-50"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Adicionar
          </button>
        </div>

        <div className="hidden sm:grid grid-cols-[1fr_7rem_6rem_5rem_2rem] gap-2 px-3 py-2 text-xs font-semibold text-slate-500 border-b border-slate-100">
          <span>Descrição</span>
          <span>Vencimento</span>
          <span>Valor (R$)</span>
          <span className="text-right">Pago</span>
          <span />
        </div>

        <ul className="divide-y divide-slate-100 max-h-[min(50svh,22rem)] overflow-y-auto">
          {installments.length === 0 ? (
            <li className="p-4 text-sm text-slate-500 text-center">Nenhuma parcela. Adicione acima.</li>
          ) : (
            installments.map((inst) => (
              <li
                key={inst.id}
                className="p-2.5 md:p-3 border-b border-slate-50 last:border-0 sm:border-0 grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_7rem_6rem_5rem_2rem] gap-x-2 gap-y-1.5 sm:gap-2 items-center"
              >
                <TextInput
                  value={inst.label}
                  onChange={(e) => updateInst(inst.id, { label: e.target.value })}
                  className="min-h-9 text-xs md:text-sm col-span-2 sm:col-span-1"
                  aria-label="Descrição da parcela"
                />
                <span className="text-[10px] text-slate-400 sm:hidden">Vencimento</span>
                <TextInput
                  type="date"
                  value={inst.dueDate}
                  onChange={(e) => updateInst(inst.id, { dueDate: e.target.value })}
                  className="min-h-9 text-xs md:text-sm"
                  aria-label="Vencimento"
                />
                <span className="text-[10px] text-slate-400 sm:hidden">Valor R$</span>
                <TextInput
                  value={String(inst.expectedAmount)}
                  onChange={(e) =>
                    updateInst(inst.id, {
                      expectedAmount: roundMoney(parseMoneyInput(e.target.value)),
                    })
                  }
                  inputMode="decimal"
                  className="min-h-9 text-xs md:text-sm"
                  aria-label="Valor"
                />
                <p className="text-xs text-slate-600 tabular-nums col-span-2 sm:col-span-1 sm:text-right">
                  Pago: <Money value={inst.paidAmount} />
                </p>
                <button
                  type="button"
                  onClick={() => removeInstallment(inst)}
                  className="min-h-9 min-w-9 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg justify-self-end col-span-2 sm:col-span-1 sm:col-start-auto"
                  aria-label="Remover parcela"
                >
                  <Trash2 className="h-3.5 w-3.5 md:h-4 md:w-4" strokeWidth={2} />
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="px-3 py-2 text-xs text-slate-500 border-t border-slate-100 space-y-0.5">
          <p>
            Soma das parcelas: <Money value={scheduleSum} />
            {Math.abs(scheduleSum - totalValue) > 0.02 && totalValue > 0 && (
              <span className="text-amber-700 ml-1">
                (diferente do total do lote: <Money value={totalValue} />)
              </span>
            )}
          </p>
        </div>
      </div>

      <PrimaryButton type="submit">Salvar terreno e parcelas</PrimaryButton>
      <button type="button" onClick={onCancel} className="w-full min-h-11 text-sm text-slate-500">
        Cancelar
      </button>
    </form>
  )
}
