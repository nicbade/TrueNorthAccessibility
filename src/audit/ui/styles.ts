export const btn = {
  base: 'inline-flex items-center justify-center gap-1.5 rounded px-4 py-2 text-sm font-medium leading-5 transition-colors disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer',
  primary: 'bg-forest-btn text-white hover:bg-forest-btn-hover',
  secondary: 'border border-slate bg-transparent text-ink hover:border-forest hover:text-forest',
  ghost: 'text-ink hover:bg-cream hover:text-forest',
  danger: 'border border-danger-border bg-transparent text-danger-text hover:bg-danger-bg',
}

export const button = (variant: keyof Omit<typeof btn, 'base'> = 'secondary', extra = '') =>
  `${btn.base} ${btn[variant]} ${extra}`

export const input =
  'block w-full rounded border border-slate bg-cream px-3 py-2 text-sm leading-6 text-ink placeholder:text-slate focus:border-forest'

export const label = 'block text-[0.8125rem] font-semibold text-ink mb-1'

export const hint = 'mt-1 text-xs leading-5 text-slate'

export const card = 'rounded-lg border border-divider bg-surface'

export const link = 'text-forest underline underline-offset-2 hover:text-forest-dark'

export const PRIORITY_STYLES: Record<string, string> = {
  Blocker: 'bg-red-100 text-red-900 ring-red-300 dark:bg-red-950 dark:text-red-100 dark:ring-red-700',
  Critical:
    'bg-orange-100 text-orange-900 ring-orange-300 dark:bg-orange-950 dark:text-orange-100 dark:ring-orange-700',
  Major:
    'bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-700',
  Minor: 'bg-sky-100 text-sky-900 ring-sky-300 dark:bg-sky-950 dark:text-sky-100 dark:ring-sky-700',
}

export const PRIORITY_BAR: Record<string, string> = {
  Blocker: 'bg-red-700 dark:bg-red-400',
  Critical: 'bg-orange-600 dark:bg-orange-400',
  Major: 'bg-amber-500 dark:bg-amber-300',
  Minor: 'bg-sky-600 dark:bg-sky-400',
}

export const STATUS_STYLES: Record<string, string> = {
  Open: 'bg-cream text-ink ring-slate',
  'In progress':
    'bg-indigo-100 text-indigo-900 ring-indigo-300 dark:bg-indigo-950 dark:text-indigo-100 dark:ring-indigo-700',
  'Needs retest':
    'bg-violet-100 text-violet-900 ring-violet-300 dark:bg-violet-950 dark:text-violet-100 dark:ring-violet-700',
  Fixed:
    'bg-emerald-100 text-emerald-900 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-700',
  "Won't fix":
    'bg-stone-200 text-stone-900 ring-stone-400 dark:bg-stone-800 dark:text-stone-100 dark:ring-stone-500',
}

export const NEUTRAL_BADGE = 'bg-cream text-ink ring-divider'
