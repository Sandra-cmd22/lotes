import { Download, LayoutDashboard, Users } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 md:px-3 md:py-2 text-[10px] md:text-xs font-medium min-w-[3.75rem] md:min-w-[4.5rem] rounded-lg transition-colors ${
    isActive ? 'text-teal-700 bg-teal-50' : 'text-slate-500 hover:text-slate-800'
  }`

const iconClass = 'h-[18px] w-[18px] md:h-5 md:w-5 shrink-0'

export function Layout() {
  return (
    <div className="min-h-svh flex flex-col max-w-3xl mx-auto w-full bg-white shadow-sm md:shadow-md md:my-4 md:rounded-2xl md:min-h-[calc(100svh-2rem)] overflow-hidden">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur px-3 py-2 md:px-4 md:py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wide text-teal-700">
              Loteamento
            </p>
            <h1 className="text-sm md:text-lg font-semibold text-slate-900 leading-tight truncate">
              Controle de vendas
            </h1>
          </div>
        </div>
      </header>

      <main className="flex-1 px-3 py-3 pb-[4.5rem] md:px-4 md:py-4 md:pb-6">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur pb-[max(0.25rem,env(safe-area-inset-bottom))] md:static md:border-t md:px-2 md:py-2 md:pb-0">
        <div className="max-w-3xl mx-auto flex justify-around md:justify-center md:gap-2 pt-0.5 md:pt-0">
          <NavLink to="/" end className={linkClass}>
            <LayoutDashboard className={iconClass} strokeWidth={2} aria-hidden />
            Início
          </NavLink>
          <NavLink to="/clientes" className={linkClass}>
            <Users className={iconClass} strokeWidth={2} aria-hidden />
            Clientes
          </NavLink>
          <NavLink to="/importar" className={linkClass}>
            <Download className={iconClass} strokeWidth={2} aria-hidden />
            Importar
          </NavLink>
        </div>
      </nav>
    </div>
  )
}
