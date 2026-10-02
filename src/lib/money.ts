const fmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export function formatMoney(value: number): string {
  return fmt.format(value)
}

export function parseMoneyInput(raw: string): number {
  const cleaned = raw.replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export function nearlyZero(value: number): boolean {
  return Math.abs(value) < 0.01
}
