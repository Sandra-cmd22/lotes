import { useEffect, type ReactNode } from 'react'

export function Modal({
  title,
  open,
  onClose,
  children,
  wide,
}: {
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div
        className={`relative w-full max-h-[92svh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200 ${
          wide ? 'max-w-lg' : 'max-w-md'
        }`}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-3 py-2 md:px-4 md:py-3 gap-2">
          <h2 className="text-sm md:text-base font-semibold text-slate-900 leading-snug">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 md:h-10 md:w-10 shrink-0 rounded-full text-slate-500 hover:bg-slate-100 text-lg md:text-xl leading-none"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <div className="p-3 md:p-4">{children}</div>
      </div>
    </div>
  )
}
