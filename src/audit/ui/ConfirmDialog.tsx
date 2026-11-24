import { useCallback, useRef, useState, type ReactNode } from 'react'
import Dialog from './Dialog'
import { button } from './styles'

export type ConfirmOptions = {
  title: string
  message: string
  confirmLabel: string
  /** Extra line under the message, e.g. "This cannot be undone." */
  detail?: string
}

/**
 * Promise-based confirmation in a modal dialog (focus moves to Cancel, Escape cancels, focus returns
 * to the control that opened it). Render the returned element once in the component.
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<(ok: boolean) => void>(() => undefined)

  const confirm = useCallback(
    (next: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve
        setOptions(next)
      }),
    [],
  )

  const settle = (ok: boolean) => {
    setOptions(null)
    resolver.current(ok)
  }

  const element = options && (
    <Dialog
      title={options.title}
      description={options.message}
      onClose={() => settle(false)}
      footer={
        <>
          <button type="button" className={button('secondary')} data-autofocus onClick={() => settle(false)}>
            Cancel
          </button>
          <button type="button" className={button('danger')} onClick={() => settle(true)}>
            {options.confirmLabel}
          </button>
        </>
      }
    >
      {options.detail && <p className="m-0 text-sm font-semibold">{options.detail}</p>}
    </Dialog>
  )

  return [confirm, element]
}
