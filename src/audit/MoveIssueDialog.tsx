import { useId, useState, type FormEvent } from 'react'
import { moveIssueToPage, useAuditData } from './store'
import type { AuditPage, Issue } from './types'
import Dialog from './ui/Dialog'
import { button, hint, input, label } from './ui/styles'

type Props = {
  page: AuditPage
  issue: Issue
  onClose: () => void
  /** Called once the move is saved, just before the issue leaves this page in the store. */
  onMoved: (moved: Issue, to: AuditPage) => void
}

/** Owner-only: moves an issue (number, screenshots and comments included) to another page of the project. */
export default function MoveIssueDialog({ page, issue, onClose, onMoved }: Props) {
  const id = useId()
  const formId = `${id}-form`
  const data = useAuditData()
  const pages = data.pages.filter((p) => p.projectId === page.projectId && p.id !== page.id)
  const [target, setTarget] = useState(pages[0]?.id ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const dest = pages.find((p) => p.id === target)
  const comments = data.comments.filter((c) => c.issueId === issue.id).length
  const shots = issue.images.length
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!dest) return
    setBusy(true)
    setError('')
    try {
      await moveIssueToPage(issue, dest, (moved) => onMoved(moved, dest))
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : 'Could not move the issue.')
    }
  }

  return (
    <Dialog
      title={`Move issue #${issue.number}`}
      description={`Move this issue off ${page.name} and onto another page. It keeps its number, ${plural(shots, 'screenshot')} and ${plural(comments, 'comment')}.`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={button('secondary')} onClick={onClose}>
            Cancel
          </button>
          {dest && (
            <button type="submit" form={formId} className={button('primary')} disabled={busy}>
              {busy ? 'Moving…' : `Move to ${dest.name}`}
            </button>
          )}
        </>
      }
    >
      {pages.length === 0 ? (
        <p className="m-0 text-sm">
          This project has no other pages yet. Add a page first, then move the issue.
        </p>
      ) : (
        <form id={formId} onSubmit={(e) => void submit(e)} noValidate>
          <label htmlFor={`${id}-page`} className={label}>
            Move to page
          </label>
          <select
            id={`${id}-page`}
            data-autofocus
            className={input}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-describedby={`${id}-summary${error ? ` ${id}-error` : ''}`}
          >
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.hidden ? ' (hidden from clients)' : ''}
              </option>
            ))}
          </select>
          <p id={`${id}-summary`} className={hint}>
            Issue #{issue.number} will no longer appear on {page.name}.
            {dest?.hidden && !page.hidden
              ? ` ${dest.name} is hidden, so clients will stop seeing this issue.`
              : ''}
          </p>
          {error && (
            <p id={`${id}-error`} role="alert" className="m-0 mt-1 text-xs font-semibold text-danger-text">
              {error}
            </p>
          )}
        </form>
      )}
    </Dialog>
  )
}
