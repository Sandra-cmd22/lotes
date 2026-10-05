import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { syncBundledAppDataIfNewer, tryAutoSeedFromBackup } from '../lib/seedBackup'
import { syncInstallmentPaidAmounts } from '../lib/calculations'
import { createId } from '../lib/id'
import { isSupabaseConfigured } from '../lib/supabase'
import {
  fetchRemoteSnapshot,
  hasLocalData,
  pushRemoteSnapshot,
  subscribeRemoteSnapshot,
} from '../lib/supabaseSync'
import { loadData, saveData, emptyData } from '../lib/storage'
import type { AppData, Client, Lot, Payment } from '../types'

export type SyncState = 'local' | 'loading' | 'synced' | 'saving' | 'error'

interface DataContextValue {
  data: AppData
  syncState: SyncState
  syncError: string | null
  cloudEnabled: boolean
  refresh: () => void
  upsertClient: (client: Omit<Client, 'createdAt'> & { createdAt?: string }) => void
  deleteClient: (id: string) => void
  upsertLot: (lot: Omit<Lot, 'createdAt'> & { createdAt?: string }) => void
  deleteLot: (id: string) => void
  addPayment: (payment: Omit<Payment, 'id' | 'createdAt'>) => Payment
  replaceData: (data: AppData) => void
}

const DataContext = createContext<DataContextValue | null>(null)

const LOCAL_SYNC_KEY = 'loteamento_last_remote_sync'

function getLocalSyncTime(): number {
  const v = localStorage.getItem(LOCAL_SYNC_KEY)
  return v ? parseInt(v, 10) : 0
}

function setLocalSyncTime(iso: string) {
  localStorage.setItem(LOCAL_SYNC_KEY, String(new Date(iso).getTime()))
}

export function DataProvider({ children }: { children: ReactNode }) {
  const cloudEnabled = isSupabaseConfigured()
  const [data, setData] = useState<AppData>(() => loadData())
  const [syncState, setSyncState] = useState<SyncState>(cloudEnabled ? 'loading' : 'local')
  const [syncError, setSyncError] = useState<string | null>(null)
  const skipNextRemotePush = useRef(false)
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pushToCloud = useCallback(async (payload: AppData) => {
    if (!cloudEnabled) return
    setSyncState('saving')
    const { error } = await pushRemoteSnapshot(payload)
    if (error) {
      setSyncError(error)
      setSyncState('error')
    } else {
      setSyncError(null)
      setSyncState('synced')
      setLocalSyncTime(new Date().toISOString())
    }
  }, [cloudEnabled])

  const persist = useCallback(
    (next: AppData, options?: { skipCloud?: boolean }) => {
      setData(next)
      saveData(next)
      if (!cloudEnabled || options?.skipCloud) return
      if (skipNextRemotePush.current) {
        skipNextRemotePush.current = false
        return
      }
      if (pushTimer.current) clearTimeout(pushTimer.current)
      pushTimer.current = setTimeout(() => {
        void pushToCloud(next)
      }, 400)
    },
    [cloudEnabled, pushToCloud],
  )

  useEffect(() => {
    let unsubscribe: (() => void) | null = null

    const boot = async () => {
      if (!cloudEnabled) {
        await tryAutoSeedFromBackup()
        const bundled = await syncBundledAppDataIfNewer()
        setData(bundled ?? loadData())
        setSyncState('local')
        return
      }

      setSyncState('loading')
      await tryAutoSeedFromBackup()
      const bundled = await syncBundledAppDataIfNewer()
      if (bundled) {
        setData(bundled)
        await pushRemoteSnapshot(bundled)
        setLocalSyncTime(new Date().toISOString())
        setSyncState('synced')
        unsubscribe = subscribeRemoteSnapshot((incoming) => {
          skipNextRemotePush.current = true
          saveData(incoming)
          setData(incoming)
          setSyncState('synced')
        })
        return
      }
      const local = loadData()
      const remote = await fetchRemoteSnapshot()

      if (remote.error && !remote.data) {
        setSyncError(remote.error)
      }

      if (remote.data && hasLocalData(remote.data)) {
        if (!hasLocalData(local)) {
          skipNextRemotePush.current = true
          saveData(remote.data)
          setData(remote.data)
          if (remote.updatedAt) setLocalSyncTime(remote.updatedAt)
        } else {
          const remoteTs = remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0
          const localTs = getLocalSyncTime()
          if (remoteTs >= localTs) {
            skipNextRemotePush.current = true
            saveData(remote.data)
            setData(remote.data)
          } else {
            await pushRemoteSnapshot(local)
            if (remote.updatedAt) setLocalSyncTime(new Date().toISOString())
          }
        }
      } else if (hasLocalData(local)) {
        await pushRemoteSnapshot(local)
        setLocalSyncTime(new Date().toISOString())
      } else {
        await tryAutoSeedFromBackup()
        const seeded = loadData()
        setData(seeded)
        if (hasLocalData(seeded)) {
          await pushRemoteSnapshot(seeded)
          setLocalSyncTime(new Date().toISOString())
        }
      }

      setSyncState('synced')
      setSyncError((e) => (remote.error && !hasLocalData(loadData()) ? remote.error! : e))

      unsubscribe = subscribeRemoteSnapshot((incoming) => {
        skipNextRemotePush.current = true
        saveData(incoming)
        setData(incoming)
        setSyncState('synced')
      })
    }

    void boot()

    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current)
      unsubscribe?.()
    }
  }, [cloudEnabled])

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
      syncState,
      syncError,
      cloudEnabled,
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
      syncState,
      syncError,
      cloudEnabled,
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
