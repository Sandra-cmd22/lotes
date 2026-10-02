import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

const labelClass = 'block text-xs md:text-sm font-medium text-slate-700 mb-0.5 md:mb-1'
const inputClass =
  'w-full min-h-10 md:min-h-12 rounded-lg md:rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 md:px-3 md:py-2 text-sm md:text-base text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20'

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block mb-3 md:mb-4">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  )
}

export function TextInput({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClass} ${className}`} {...props} />
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={inputClass} {...props} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${inputClass} min-h-[4rem] md:min-h-[5rem]`} {...props} />
}

export function PrimaryButton({
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`w-full min-h-10 md:min-h-12 rounded-lg md:rounded-xl bg-teal-700 text-white font-semibold text-sm md:text-base hover:bg-teal-800 active:bg-teal-900 disabled:opacity-50 disabled:pointer-events-none ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`w-full min-h-10 md:min-h-12 rounded-lg md:rounded-xl border border-slate-300 bg-white text-slate-800 font-semibold text-sm md:text-base hover:bg-slate-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function DangerButton({
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`w-full min-h-9 md:min-h-11 rounded-lg md:rounded-xl border border-red-200 text-red-700 text-sm font-medium hover:bg-red-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
