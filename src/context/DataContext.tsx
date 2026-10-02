import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { tryAutoSeedFromBackup } from '../lib/seedBackup'
import { syncInstallmentPaidAmounts } from '../lib/calculations'
import { createId } from '../lib/id'
import { loadData, saveData, emptyData } from '../lib/storage'
import type { AppData, Client, Lot, Payment } from '../types'

interface DataContextValue {
  data: AppData
  refresh: () => void
  upsertClient: (client: Omit<Client, 'createdAt'> & { createdAt?: string }) => void
  deleteClient: (id: string) => void
  upsertLot: (lot: Omit<Lot, 'createdAt'> & { createdAt?: string }) => void
  deleteLot: (id: string) => void
  addPayment: (payment: Omit<Payment, 'id' | 'createdAt'>) => Payment
  replaceData: (data: AppData) => void
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadData())

  useEffect(() => {
    void tryAutoSeedFromBackup().then(() => setData(loadData()))
  }, [])

  const persist = useCallback((next: AppData) => {
    setData(next)
    saveData(next)
  }, [])

  const refresh = useCallback(() => {
    setData(loadData())
  }, [])

  const upsertClient = useCallback(
    (client: Omit<Client, 'createdAt'> & { createdAt?: string }) => {
      persist({
        ...data,
        clients: data.clients.some((c) => c.id === client.id)
          ? data.clients.map((c) =>
              c.id === client.id
                ? { ...c, ...client, createdAt: client.createdAt ?? c.createdAt }
                : c,
            )
          : [...data.clients, { ...client, createdAt: client.createdAt ?? new Date().toISOString() }],
      })
    },
    [data, persist],
  )

  const deleteClient = useCallback(
    (id: string) => {
      const lotIds = new Set(data.lots.filter((l) => l.clientId === id).map((l) => l.id))
      persist({
        ...data,
        clients: data.clients.filter((c) => c.id !== id),
        lots: data.lots.filter((l) => l.clientId !== id),
        payments: data.payments.filter((p) => p.clientId !== id && !lotIds.has(p.lotId)),
      })
    },
    [data, persist],
  )

  const upsertLot = useCallback(
    (lot: Omit<Lot, 'createdAt'> & { createdAt?: string }) => {
      const withSync: Lot = {
        ...lot,
        createdAt: lot.createdAt ?? new Date().toISOString(),
        installments: syncInstallmentPaidAmounts(
          { ...lot, createdAt: lot.createdAt ?? '' },
          data.payments,
        ),
      }
      persist({
        ...data,
        lots: data.lots.some((l) => l.id === lot.id)
          ? data.lots.map((l) => (l.id === lot.id ? { ...l, ...withSync } : l))
          : [...data.lots, withSync],
      })
    },
    [data, persist],
  )

  const deleteLot = useCallback(
    (id: string) => {
      persist({
        ...data,
        lots: data.lots.filter((l) => l.id !== id),
        payments: data.payments.filter((p) => p.lotId !== id),
      })
    },
    [data, persist],
  )

  const addPayment = useCallback(
    (payment: Omit<Payment, 'id' | 'createdAt'>) => {
      const newPayment: Payment = {
        ...payment,
        id: createId(),
        createdAt: new Date().toISOString(),
      }
      const nextPayments = [...data.payments, newPayment]
      const nextLots = data.lots.map((lot) => {
        if (lot.id !== payment.lotId) return lot
        return {
          ...lot,
          installments: syncInstallmentPaidAmounts(lot, nextPayments),
        }
      })
      persist({ ...data, payments: nextPayments, lots: nextLots })
      return newPayment
    },
    [data, persist],
  )

  const replaceData = useCallback(
    (next: AppData) => {
      persist(next)
    },
    [persist],
  )

  const value = useMemo(
    () => ({
      data,
      refresh,
      upsertClient,
      deleteClient,
      upsertLot,
      deleteLot,
      addPayment,
      replaceData,
    }),
    [
      data,
      refresh,
      upsertClient,
      deleteClient,
      upsertLot,
      deleteLot,
      addPayment,
      replaceData,
    ],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}

export { emptyData }
