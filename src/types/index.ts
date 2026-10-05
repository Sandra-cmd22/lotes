export type PaymentType = 'avista' | 'parcelado'
export type InstallmentPeriodicity = 'mensal' | 'quinzenal' | 'semanal'
export type ClientStatus = 'em_dia' | 'atraso' | 'quitado'

export interface Client {
  id: string
  name: string
  phone?: string
  address?: string
  notes?: string
  /** Legado — não usar em novos cadastros */
  cpf?: string
  createdAt: string
}

export interface Installment {
  id: string
  number?: number
  label: string
  dueDate: string
  expectedAmount: number
  paidAmount: number
}

export interface Lot {
  id: string
  clientId: string
  quadra: string
  lote: string
  totalValue: number
  paymentType: PaymentType
  installments: Installment[]
  /** Data do pagamento à vista (quando paymentType === avista) */
  avistaDueDate?: string
  notes?: string
  createdAt: string
}

export interface Payment {
  id: string
  clientId: string
  lotId: string
  /** Omitido quando só a planilha confirma o pagamento, sem data no Firestore. */
  date?: string
  amount: number
  description: string
  installmentId?: string
  note?: string
  createdAt: string
}

export interface AppData {
  clients: Client[]
  lots: Lot[]
  payments: Payment[]
  version: number
  /** Atualizado ao gravar public/dados-loteamento.json — o app recarrega quando muda. */
  bundledAt?: string
}

export interface ImportPreview {
  clients: Client[]
  lots: Lot[]
  payments: Payment[]
  duplicateNames: string[]
  stats: {
    clientCount: number
    lotCount: number
    paymentCount: number
  }
  warnings: string[]
}

export interface ClientFinancialSummary {
  clientId: string
  totalPurchased: number
  totalPaid: number
  totalRemaining: number
  lotCount: number
  remainingInstallments: number
  status: ClientStatus
  overdueCount: number
  oldestOverdue?: {
    dueDate: string
    amount: number
    daysLate: number
    lotLabel: string
  }
  lastPaymentDate?: string
}

export interface DashboardStats {
  totalClients: number
  totalLotsSold: number
  totalSoldValue: number
  totalReceived: number
  totalToReceive: number
  overdueInstallmentsCount: number
  clientsInArrears: number
}

export interface OverdueItem {
  clientId: string
  clientName: string
  lotId: string
  lotLabel: string
  installmentId: string
  installmentLabel: string
  dueDate: string
  amountDue: number
  daysLate: number
}
