import { useMemo, useState } from 'react'
import { generateInstallments } from '../lib/calculations'
import { todayISO } from '../lib/dates'
import { createId } from '../lib/id'
import { parseMoneyInput, roundMoney } from '../lib/money'
import type { Installment, InstallmentPeriodicity, Lot, PaymentType } from '../types'
import { Field, PrimaryButton, SelectInput, TextInput } from './Field'

export function LotForm({
  clientId,
  initial,
  onSave,
  onCancel,
}: {
  clientId: string
  initial?: Lot
  onSave: (lot: Lot) => void
  onCancel: () => void
}) {
  const [quadra, setQuadra] = useState(initial?.quadra ?? '')
  const [lote, setLote] = useState(initial?.lote ?? '')
  const [totalValueStr, setTotalValueStr] = useState(
    initial ? String(initial.totalValue) : '',
  )
  const [paymentType, setPaymentType] = useState<PaymentType>(
    initial?.paymentType ?? 'parcelado',
  )
  const [avistaDate, setAvistaDate] = useState(initial?.avistaDueDate ?? todayISO())
  const [entradaStr, setEntradaStr] = useState('')
  const [entradaDate, setEntradaDate] = useState(todayISO())
  const [firstParcelDate, setFirstParcelDate] = useState(todayISO())
  const [periodicity, setPeriodicity] = useState<InstallmentPeriodicity>('mensal')
  const [parcelMode, setParcelMode] = useState<'count' | 'amount'>('count')
  const [parcelCount, setParcelCount] = useState('')
  const [parcelAmountStr, setParcelAmountStr] = useState('')
  const [installments, setInstallments] = useState<Installment[]>(
    initial?.installments ?? [],
  )
  const [editInstallments, setEditInstallments] = useState(false)

  const totalValue = useMemo(() => parseMoneyInput(totalValueStr), [totalValueStr])

  const generate = () => {
    const entrada = parseMoneyInput(entradaStr)
    const generated = generateInstallments({
      totalValue,
      entradaAmount: entrada,
      entradaDate,
      firstParcelDate,
      periodicity,
      parcelCount: parcelMode === 'count' ? parseInt(parcelCount, 10) || 0 : undefined,
      parcelAmount:
        parcelMode === 'amount' ? parseMoneyInput(parcelAmountStr) : undefined,
    })
    setInstallments(generated)
    setEditInstallments(true)
  }

  const updateInst = (id: string, patch: Partial<Installment>) => {
    setInstallments((list) =>
      list.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    )
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!quadra.trim() || !lote.trim() || totalValue <= 0) return
    let finalInstallments: Installment[] = []
    if (paymentType === 'avista') {
      finalInstallments = [
        {
          id: createId(),
          label: 'À vista',
          dueDate: avistaDate,
          expectedAmount: totalValue,
          paidAmount: 0,
        },
      ]
    } else {
      finalInstallments =
        installments.length > 0
          ? installments
          : generateInstallments({
              totalValue,
              entradaAmount: parseMoneyInput(entradaStr),
              entradaDate,
              firstParcelDate,
              periodicity,
              parcelCount: parseInt(parcelCount, 10) || undefined,
              parcelAmount: parseMoneyInput(parcelAmountStr) || undefined,
            })
    }

    onSave({
      id: initial?.id ?? createId(),
      clientId,
      quadra: quadra.trim(),
      lote: lote.trim(),
      totalValue,
      paymentType,
      installments: finalInstallments.map((i) => ({ ...i, paidAmount: i.paidAmount ?? 0 })),
      avistaDueDate: paymentType === 'avista' ? avistaDate : undefined,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    })
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quadra *">
          <TextInput value={quadra} onChange={(e) => setQuadra(e.target.value)} required />
        </Field>
        <Field label="Lote *">
          <TextInput value={lote} onChange={(e) => setLote(e.target.value)} required />
        </Field>
      </div>
      <Field label="Valor total (R$) *">
        <TextInput
          value={totalValueStr}
          onChange={(e) => setTotalValueStr(e.target.value)}
          inputMode="decimal"
          placeholder="25000"
          required
        />
      </Field>
      <Field label="Forma de pagamento">
        <SelectInput
          value={paymentType}
          onChange={(e) => setPaymentType(e.target.value as PaymentType)}
        >
          <option value="parcelado">Entrada + parcelas</option>
          <option value="avista">À vista</option>
        </SelectInput>
      </Field>

      {paymentType === 'avista' ? (
        <Field label="Data do pagamento">
          <TextInput
            type="date"
            value={avistaDate}
            onChange={(e) => setAvistaDate(e.target.value)}
          />
        </Field>
      ) : (
        <>
          <Field label="Valor da entrada (R$)">
            <TextInput
              value={entradaStr}
              onChange={(e) => setEntradaStr(e.target.value)}
              inputMode="decimal"
              placeholder="3000"
            />
          </Field>
          <Field label="Data da entrada">
            <TextInput
              type="date"
              value={entradaDate}
              onChange={(e) => setEntradaDate(e.target.value)}
            />
          </Field>
          <Field label="Vencimento da 1ª parcela">
            <TextInput
              type="date"
              value={firstParcelDate}
              onChange={(e) => setFirstParcelDate(e.target.value)}
            />
          </Field>
          <Field label="Periodicidade">
            <SelectInput
              value={periodicity}
              onChange={(e) => setPeriodicity(e.target.value as InstallmentPeriodicity)}
            >
              <option value="mensal">Mensal</option>
              <option value="quinzenal">Quinzenal</option>
              <option value="semanal">Semanal</option>
            </SelectInput>
          </Field>
          <Field label="Definir parcelas por">
            <SelectInput
              value={parcelMode}
              onChange={(e) => setParcelMode(e.target.value as 'count' | 'amount')}
            >
              <option value="count">Quantidade de parcelas</option>
              <option value="amount">Valor de cada parcela</option>
            </SelectInput>
          </Field>
          {parcelMode === 'count' ? (
            <Field label="Quantidade de parcelas">
              <TextInput
                type="number"
                min={1}
                value={parcelCount}
                onChange={(e) => setParcelCount(e.target.value)}
              />
            </Field>
          ) : (
            <Field label="Valor da parcela (R$)">
              <TextInput
                value={parcelAmountStr}
                onChange={(e) => setParcelAmountStr(e.target.value)}
                inputMode="decimal"
              />
            </Field>
          )}
          <button
            type="button"
            onClick={generate}
            className="w-full min-h-11 mb-3 rounded-xl border border-dashed border-teal-400 text-teal-800 font-medium text-sm hover:bg-teal-50"
          >
            Gerar / atualizar parcelas
          </button>

          {(editInstallments || (initial?.installments.length ?? 0) > 0) &&
            installments.length > 0 && (
              <div className="mb-4 rounded-xl border border-slate-200 overflow-hidden">
                <p className="bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                  Editar parcelas manualmente
                </p>
                <ul className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {installments.map((inst) => (
                    <li key={inst.id} className="p-2 grid grid-cols-2 gap-2 text-sm">
                      <TextInput
                        value={inst.label}
                        onChange={(e) => updateInst(inst.id, { label: e.target.value })}
                        className="min-h-10 text-sm col-span-2"
                      />
                      <TextInput
                        type="date"
                        value={inst.dueDate}
                        onChange={(e) => updateInst(inst.id, { dueDate: e.target.value })}
                        className="min-h-10 text-sm"
                      />
                      <TextInput
                        value={String(inst.expectedAmount)}
                        onChange={(e) =>
                          updateInst(inst.id, {
                            expectedAmount: roundMoney(parseMoneyInput(e.target.value)),
                          })
                        }
                        className="min-h-10 text-sm"
                      />
                    </li>
                  ))}
                </ul>
                <p className="px-3 py-2 text-xs text-slate-500">
                  Soma das parcelas + entrada:{' '}
                  {roundMoney(installments.reduce((s, i) => s + i.expectedAmount, 0))}
                </p>
              </div>
            )}
        </>
      )}

      <PrimaryButton type="submit">Salvar terreno</PrimaryButton>
      <button
        type="button"
        onClick={onCancel}
        className="w-full min-h-11 mt-2 text-sm text-slate-500"
      >
        Cancelar
      </button>
    </form>
  )
}
