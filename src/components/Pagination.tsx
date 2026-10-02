import { ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE_OPTIONS = [8, 12, 20] as const

export function usePagination<T>(items: T[], pageSize: number, page: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  const slice = items.slice(start, start + pageSize)
  return { slice, totalPages, safePage, total: items.length, start: start + 1, end: Math.min(start + pageSize, items.length) }
}

export function PaginationBar({
  page,
  totalPages,
  total,
  start,
  end,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  totalPages: number
  total: number
  start: number
  end: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
}) {
  if (total === 0) return null

  return (
    <div className="flex flex-col gap-2 md:gap-3 sm:flex-row sm:items-center sm:justify-between pt-3 md:pt-4 border-t border-slate-100 mt-3 md:mt-4">
      <p className="text-[11px] md:text-xs text-slate-500 tabular-nums">
        {start}–{end} de {total}
      </p>
      <div className="flex items-center gap-1.5 md:gap-2 justify-between sm:justify-end">
        {onPageSizeChange && (
          <label className="flex items-center gap-1 text-[11px] md:text-xs text-slate-600 mr-0.5">
            <span className="sr-only">Itens por página</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="min-h-8 md:min-h-10 rounded-lg border border-slate-300 bg-white px-1.5 md:px-2 text-xs md:text-sm"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}/pág
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          aria-label="Página anterior"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="min-h-8 min-w-8 md:min-h-10 md:min-w-10 inline-flex items-center justify-center rounded-lg md:rounded-xl border border-slate-300 bg-white text-slate-700 disabled:opacity-40 disabled:pointer-events-none hover:bg-slate-50"
        >
          <ChevronLeft className="h-4 w-4 md:h-5 md:w-5" strokeWidth={2} />
        </button>
        <span className="text-xs md:text-sm font-medium text-slate-700 min-w-[3.25rem] md:min-w-[4.5rem] text-center tabular-nums">
          {page}/{totalPages}
        </span>
        <button
          type="button"
          aria-label="Próxima página"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="min-h-8 min-w-8 md:min-h-10 md:min-w-10 inline-flex items-center justify-center rounded-lg md:rounded-xl border border-slate-300 bg-white text-slate-700 disabled:opacity-40 disabled:pointer-events-none hover:bg-slate-50"
        >
          <ChevronRight className="h-4 w-4 md:h-5 md:w-5" strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
