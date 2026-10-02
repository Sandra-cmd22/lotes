import { useMemo, useState } from 'react'
import { createId } from '../lib/id'
import type { Client } from '../types'
import { Field, PrimaryButton, TextArea, TextInput } from './Field'

function initialAddressAndNotes(client?: Client): { address: string; notes: string } {
  if (!client) return { address: '', notes: '' }
  if (client.address) {
    return { address: client.address, notes: client.notes ?? '' }
  }
  let notes = client.notes ?? ''
  let address = ''
  const match = notes.match(/^Endereço:\s*(.+?)(?:\n|$)/i)
  if (match) {
    address = match[1].trim()
    notes = notes.replace(/^Endereço:\s*.+?(?:\n|$)/i, '').trim()
  }
  return { address, notes }
}

export function ClientForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Client
  onSave: (client: Client) => void
  onCancel: () => void
}) {
  const legacy = useMemo(() => initialAddressAndNotes(initial), [initial])
  const [name, setName] = useState(initial?.name ?? '')
  const [address, setAddress] = useState(legacy.address)
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [notes, setNotes] = useState(legacy.notes)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({
      id: initial?.id ?? createId(),
      name: name.trim(),
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    })
  }

  return (
    <form onSubmit={submit}>
      <Field label="Nome *">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </Field>
      <Field label="Endereço">
        <TextInput
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Rua, bairro, cidade..."
        />
      </Field>
      <Field label="Telefone">
        <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" />
      </Field>
      <Field label="Observações">
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </Field>
      <div className="flex flex-col gap-2 mt-2">
        <PrimaryButton type="submit">Salvar cliente</PrimaryButton>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 text-sm text-slate-500 hover:text-slate-800"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
