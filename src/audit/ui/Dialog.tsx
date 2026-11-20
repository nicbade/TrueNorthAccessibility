import { useEffect, useId, useRef, type ReactNode } from 'react'

type Props = {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg'
}

/** Native modal dialog: provides focus containment, Escape to close and inert background. */
export default function Dialog({ title, description, onClose, children, footer, size = 'md' }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const dialog = ref.current
    dialog?.showModal()
    dialog?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    return () => {
      dialog?.close()
      if (opener && opener.isConnected) opener.focus()
    }
  }, [])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className={`m-auto w-[calc(100%-2rem)] ${size === 'lg' ? 'max-w-4xl' : 'max-w-xl'} max-h-[calc(100dvh-2rem)] overflow-hidden rounded-xl bg-cream p-0 text-ink shadow-2xl backdrop:bg-black/60`}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-divider px-6 py-4">
          <div>
            <h2 id={titleId} className="m-0 font-serif text-xl">
              {title}
            </h2>
            {description && (
              <p id={descId} className="m-0 mt-1 text-[0.8125rem] leading-5 text-slate">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 rounded-md p-2 text-slate hover:bg-surface hover:text-ink cursor-pointer"
          >
            <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="sr-only">Close dialog</span>
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-divider bg-surface px-6 py-3">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  )
}
