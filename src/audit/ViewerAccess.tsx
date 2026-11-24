import { useId, useState, type FormEvent } from 'react'
import { addViewer, removeViewer, revokeAccount, useAuditData } from './store'
import type { Project } from './types'
import { button, card, hint, input, label } from './ui/styles'
import { useConfirm } from './ui/ConfirmDialog'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ViewerAccess({ project }: { project: Project }) {
  const [confirm, confirmDialog] = useConfirm()
  const id = useId()
  const { viewers } = useAuditData()
  const list = viewers.filter((v) => v.projectId === project.id)
  const [email, setEmail] = useState('')
  const [sendLink, setSendLink] = useState(true)
  const [busy, setBusy] = useState(false)
  const [fieldError, setFieldError] = useState('')
  const [message, setMessage] = useState('')
  const [noAccess, setNoAccess] = useState('')

  const invite = async (e: FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    setMessage('')
    setNoAccess('')
    if (!EMAIL_RE.test(value)) {
      setFieldError('Enter an email address, like name@example.com.')
      document.getElementById(`${id}-email`)?.focus()
      return
    }
    if (list.some((v) => v.email.toLowerCase() === value.toLowerCase())) {
      setFieldError(`${value} already has access to this project.`)
      document.getElementById(`${id}-email`)?.focus()
      return
    }
    setFieldError('')
    setBusy(true)
    try {
      const result = await addViewer(project.id, value, sendLink)
      const note = !sendLink
        ? ' They can sign in at this page with that address.'
        : result.emailed
          ? ' A sign-in link was emailed to them.'
          : ' The sign-in email could not be sent; ask them to sign in at this page with that address.'
      setMessage(`${value} can now view this project.${note}`)
      setEmail('')
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : 'Could not add the viewer.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (viewerEmail: string) => {
    const ok = await confirm({
      title: 'Remove viewer?',
      message: `${viewerEmail} will no longer be able to see ${project.name}. You can invite them again later.`,
      confirmLabel: 'Remove viewer',
    })
    if (!ok) return
    try {
      await removeViewer(project.id, viewerEmail)
      const elsewhere = viewers.some(
        (v) => v.email.toLowerCase() === viewerEmail.toLowerCase() && v.projectId !== project.id,
      )
      setMessage(
        `${viewerEmail} no longer has access to this project.${
          elsewhere ? '' : ' They cannot see any project now.'
        }`,
      )
      setNoAccess(elsewhere ? '' : viewerEmail)
      document.getElementById(`${id}-email`)?.focus()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not remove the viewer.')
    }
  }

  const revoke = async () => {
    const target = noAccess
    const ok = await confirm({
      title: 'Delete their sign-in?',
      message: `${target} will no longer be able to sign in to Audit Hub. Their comments stay. You can invite them again later.`,
      confirmLabel: 'Delete sign-in',
    })
    if (!ok) return
    try {
      const { deleted } = await revokeAccount(target)
      setNoAccess('')
      setMessage(deleted ? `${target} can no longer sign in.` : `${target} had no sign-in to delete.`)
      document.getElementById(`${id}-email`)?.focus()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not delete their sign-in.')
    }
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="mt-8">
      <h2 id={`${id}-heading`} className="m-0 mb-3 font-serif text-xl">
        Viewer access
      </h2>
      <div className={`${card} p-5`}>
        <p className="m-0 text-[0.8125rem] text-slate">
          Viewers can see this project's dashboard, pages, issues and screenshots and export to Excel. They
          cannot make changes.
        </p>
        <form onSubmit={(e) => void invite(e)} noValidate className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <label htmlFor={`${id}-email`} className={label}>
              Viewer email
            </label>
            <input
              id={`${id}-email`}
              type="email"
              autoComplete="off"
              className={input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? `${id}-error` : `${id}-hint`}
            />
            {fieldError ? (
              <p id={`${id}-error`} className="m-0 mt-1 text-xs font-semibold text-danger-text">
                {fieldError}
              </p>
            ) : (
              <p id={`${id}-hint`} className={hint}>
                They sign in with this address to get read-only access.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 pb-7">
            <input
              id={`${id}-send`}
              type="checkbox"
              className="h-4 w-4 accent-forest-btn"
              checked={sendLink}
              onChange={(e) => setSendLink(e.target.checked)}
            />
            <label htmlFor={`${id}-send`} className="text-[0.8125rem] text-ink">
              Email them a sign-in link
            </label>
          </div>
          <button type="submit" className={button('primary', 'mb-7')} disabled={busy}>
            {busy ? 'Inviting…' : 'Invite viewer'}
          </button>
        </form>
        <div role="status" aria-live="polite" className="text-[0.8125rem]">
          {message && <p className="m-0 mt-1">{message}</p>}
        </div>
        {noAccess && (
          <button type="button" className={button('secondary', 'mt-2')} onClick={() => void revoke()}>
            Also delete their sign-in
            <span className="sr-only"> for {noAccess}</span>
          </button>
        )}
        {list.length === 0 ? (
          <p className="m-0 mt-3 text-[0.8125rem] text-slate">
            No viewers yet. Only owners can see this project.
          </p>
        ) : (
          <ul aria-label="Viewers" className="m-0 mt-3 grid list-none gap-2 p-0">
            {list.map((v) => (
              <li
                key={v.email}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-divider bg-cream px-3 py-2"
              >
                <span className="break-all text-sm">{v.email}</span>
                <button
                  type="button"
                  className={button('ghost', 'text-danger-text')}
                  onClick={() => void remove(v.email)}
                >
                  Remove<span className="sr-only"> {v.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {confirmDialog}
    </section>
  )
}
