import { useId, useMemo, useState, type FormEvent } from 'react'
import { copyIssueToPage, useAuditData } from './store'
import type { AuditPage, Issue } from './types'
import Badge from './ui/Badge'
import Dialog from './ui/Dialog'
import { button, card, hint, input, label } from './ui/styles'

type Props = {
  page: AuditPage
  onClose: () => void
  onCopied: (copy: Issue, source: Issue) => void
}

/** Copies an existing issue from any page of the project onto this page, looked up by issue number. */
export default function CopyIssueDialog({ page, onClose, onCopied }: Props) {
  const id = useId()
  const formId = `${id}-form`
  const data = useAuditData()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const number = /^\s*#?\d+\s*$/.test(value) ? Number(value.replace(/\D/g, '')) : null
  const match = useMemo(
    () =>
      number ? data.issues.find((i) => i.projectId === page.projectId && i.number === number) : undefined,
    [data.issues, number, page.projectId],
  )
  const matchPage = match && data.pages.find((p) => p.id === match.pageId)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!match) {
      setError(
        number
          ? `There is no issue #${number} in this project.`
          : 'Enter the number of an existing issue, like 12.',
      )
      document.getElementById(`${id}-number`)?.focus()
      return
    }
    setError('')
    setBusy(true)
    try {
      onCopied(await copyIssueToPage(match, page), match)
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : 'Could not copy the issue.')
    }
  }

  return (
    <Dialog
      title="Copy an existing issue"
      description={`Copy an issue from any page of this project onto ${page.name}. The copy gets a new number and starts as Open.`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={button('secondary')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className={button('primary')} disabled={busy}>
            {busy ? 'Copying…' : 'Copy to this page'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate>
        <label htmlFor={`${id}-number`} className={label}>
          Issue number
        </label>
        <input
          id={`${id}-number`}
          data-autofocus
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className={`${input} max-w-40`}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError('')
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
        />
        <p id={`${id}-hint`} className={hint}>
          All fields and screenshots are copied. Comments are not.
        </p>
        {error && (
          <p id={`${id}-error`} role="alert" className="m-0 mt-1 text-xs font-semibold text-danger-text">
            {error}
          </p>
        )}
      </form>
      <div aria-live="polite" className="mt-4">
        {match && (
          <div className={`${card} p-3`}>
            <p className="m-0 text-[0.75rem] text-slate">
              <span className="font-bold">#{match.number}</span> on{' '}
              <span className="font-semibold text-ink">{matchPage?.name ?? 'another page'}</span>
              {match.images.length > 0 &&
                ` · ${match.images.length} screenshot${match.images.length === 1 ? '' : 's'}`}
            </p>
            <p className="m-0 mt-1 text-sm font-semibold">{match.description}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {match.priority && <Badge kind="priority" value={match.priority} srPrefix="Priority" />}
              {match.category && <Badge kind="neutral" value={match.category} srPrefix="Category" />}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
