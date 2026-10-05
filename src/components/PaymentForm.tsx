import { useEffect, useMemo, useState } from 'react'
import {
  getLotRemaining,
  getLotTotalPaid,
  installmentAmountDue,
  lotLabel,
  syncInstallmentPaidAmounts,
} from '../lib/calculations'
import { todayISO } from '../lib/dates'
import { parseMoneyInput } from '../lib/money'
import type { Lot } from '../types'
import { useData } from '../context/DataContext'
import { Field, PrimaryButton, SelectInput, TextArea, TextInput } from './Field'
import { Money } from './Money'

export function PaymentForm({
  clientId,
  lots,
  defaultLotId,
  defaultInstallmentId,
  onSaved,
  onCancel,
}: {
  clientId: string
  lots: Lot[]
  defaultLotId?: string
  defaultInstallmentId?: string
  onSaved: (remaining: number) => void
  onCancel: () => void
}) {
  const { data, addPayment } = useData()
  const [lotId, setLotId] = useState(defaultLotId ?? lots[0]?.id ?? '')
  const [amountStr, setAmountStr] = useState('')
  const [date, setDate] = useState(todayISO())
  const [installmentId, setInstallmentId] = useState(defaultInstallmentId ?? '')
  const [note, setNote] = useState('')

  const lot = lots.find((l) => l.id === lotId)
  const synced = useMemo(
    () => (lot ? syncInstallmentPaidAmounts(lot, data.payments) : []),
    [lot, data.payments],
  )

  const pendingInstallments = synced.filter((i) => installmentAmountDue(i) > 0)

  const selectedInst = installmentId ? synced.find((i) => i.id === installmentId) : undefined
  const isEntradaPayment =
    selectedInst != null &&
    (selectedInst.label === 'Entrada' || selectedInst.number === 0)

  useEffect(() => {
    if (!defaultInstallmentId || !lot) return
    const inst = synced.find((i) => i.id === defaultInstallmentId)
    if (!inst) return
    setInstallmentId(defaultInstallmentId)
    const due = installmentAmountDue(inst)
    if (due > 0) {
      setAmountStr(
        due.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      )
    }
    if (inst.label === 'Entrada' || inst.number === 0) setDate('')
  }, [defaultInstallmentId, lot, synced])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!lot) return
    const amount = parseMoneyInput(amountStr)
    if (amount <= 0) return

    let description = 'Pagamento'
    const inst = installmentId ? synced.find((i) => i.id === installmentId) : undefined
    if (inst) description = inst.label

    addPayment({
      clientId,
      lotId: lot.id,
      ...(date.trim() ? { date: date.trim() } : {}),
      amount,
      description,
      installmentId: inst?.id,
      note: note.trim() || undefined,
    })

    const remaining = Math.max(
      0,
      lot.totalValue - getLotTotalPaid(lot, data.payments) - amount,
    )
    onSaved(remaining)
  }

  if (lots.length === 0) {
    return (
      <p className="text-slate-600 text-sm">Cadastre um terreno antes de registrar pagamentos.</p>
    )
  }

  return (
    <form onSubmit={submit}>
      <Field label="Terreno">
        <SelectInput value={lotId} onChange={(e) => setLotId(e.target.value)}>
          {lots.map((l) => (
            <option key={l.id} value={l.id}>
              {lotLabel(l)} — restante{' '}
              {getLotRemaining(l, data.payments).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
            </option>
          ))}
        </SelectInput>
      </Field>

      {lot && (
        <div className="mb-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
          <p>
            Já pago: <Money value={getLotTotalPaid(lot, data.payments)} className="font-semibold" />
          </p>
          <p>
            Restante:{' '}
            <Money value={getLotRemaining(lot, data.payments)} className="font-semibold text-teal-800" />
          </p>
        </div>
      )}

      <Field label="Valor pago (R$) *">
        <TextInput
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          inputMode="decimal"
          required
          autoFocus
          placeholder="1000"
        />
      </Field>
      <Field
        label={isEntradaPayment ? 'Data do pagamento (opcional)' : 'Data do pagamento *'}
      >
        <TextInput
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required={!isEntradaPayment}
        />
        {isEntradaPayment && (
          <p className="mt-1 text-xs text-slate-500">
            Deixe em branco se ainda não souber a data; o valor entra no &quot;Já pago&quot; mesmo
            assim.
          </p>
        )}
      </Field>
      <Field label="Parcela (opcional)">
        <SelectInput
          value={installmentId}
          onChange={(e) => setInstallmentId(e.target.value)}
        >
          <option value="">Não vincular a uma parcela</option>
          {pendingInstallments.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label} — venc. {i.dueDate} — falta{' '}
              {installmentAmountDue(i).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
            </option>
          ))}
        </SelectInput>
      </Field>
      <Field label="Observação">
        <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </Field>
      <PrimaryButton type="submit">Salvar pagamento</PrimaryButton>
      <button type="button" onClick={onCancel} className="w-full min-h-11 mt-2 text-sm text-slate-500">
        Cancelar
      </button>
    </form>
  )
}
