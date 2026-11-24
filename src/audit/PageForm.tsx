import { useId, useState, type FormEvent } from 'react'
import type { PageInput } from './store'
import type { AuditPage } from './types'
import Dialog from './ui/Dialog'
import { button, input, label } from './ui/styles'

type Props = {
  page?: AuditPage
  onSubmit: (input: PageInput) => Promise<void>
  onClose: () => void
}

export default function PageForm({ page, onSubmit, onClose }: Props) {
  const [values, setValues] = useState<PageInput>(() => ({
    name: page?.name ?? '',
    url: page?.url ?? '',
    notes: page?.notes ?? '',
  }))
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const id = useId()
  const formId = `${id}-form`

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!values.name.trim()) {
      setError('Enter a page name.')
      document.getElementById(`${id}-name`)?.focus()
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      await onSubmit({ ...values, name: values.name.trim(), url: values.url.trim() })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save. Please try again.')
      setSaving(false)
    }
  }

  return (
    <Dialog
      title={page ? 'Edit page' : 'Add page'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={button('secondary')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className={button('primary')} disabled={saving}>
            {saving ? 'Saving…' : page ? 'Save changes' : 'Add page'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="grid gap-4">
        {saveError && (
          <p
            role="alert"
            className="m-0 rounded border border-danger-border bg-danger-bg px-3 py-2 text-[0.8125rem] font-semibold text-danger-text sm:col-span-2"
          >
            {saveError}
          </p>
        )}
        <div>
          <label htmlFor={`${id}-name`} className={label}>
            Page name{' '}
            <span aria-hidden="true" className="text-danger-text">
              *
            </span>
          </label>
          <input
            id={`${id}-name`}
            data-autofocus
            className={input}
            placeholder="e.g. Checkout – Shipping step"
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            required
            aria-required="true"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-name-error` : undefined}
          />
          {error && (
            <p id={`${id}-name-error`} className="m-0 mt-1 text-[0.75rem] font-semibold text-danger-text">
              {error}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`${id}-url`} className={label}>
            Page URL
          </label>
          <input
            id={`${id}-url`}
            type="url"
            inputMode="url"
            placeholder="https://example.com/checkout"
            className={input}
            value={values.url}
            onChange={(e) => setValues((v) => ({ ...v, url: e.target.value }))}
          />
        </div>
        <div>
          <label htmlFor={`${id}-notes`} className={label}>
            Notes
          </label>
          <textarea
            id={`${id}-notes`}
            rows={3}
            className={input}
            value={values.notes}
            onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
          />
        </div>
      </form>
    </Dialog>
  )
}
