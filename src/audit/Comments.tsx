import { useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useAuth } from './auth'
import { addComment, deleteComment, useAuditData } from './store'
import type { AuditPage, Issue } from './types'
import { useConfirm } from './ui/ConfirmDialog'
import { button, input, label } from './ui/styles'

type Props = { page: AuditPage; issue?: Issue }

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** Comment thread on an issue (collapsible) or on the page itself. Viewers and the owner can post. */
export default function Comments({ page, issue }: Props) {
  const id = useId()
  const data = useAuditData()
  const { session } = useAuth()
  const [confirm, confirmDialog] = useConfirm()
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const issueId = issue?.id ?? null
  const comments = useMemo(
    () => data.comments.filter((c) => c.pageId === page.id && c.issueId === issueId),
    [data.comments, page.id, issueId],
  )
  const target = issue ? `issue #${issue.number}` : 'this page'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!body.trim()) {
      setError('Write a comment first.')
      fieldRef.current?.focus()
      return
    }
    setError('')
    setBusy(true)
    try {
      await addComment(page, issueId, body, session?.user.email ?? '')
      setBody('')
      setMessage(`Comment posted on ${target}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post the comment.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (commentId: string, author: string) => {
    const ok = await confirm({
      title: 'Delete comment?',
      message: `The comment by ${author} on ${target} will be deleted.`,
      confirmLabel: 'Delete comment',
      detail: 'This cannot be undone.',
    })
    if (!ok) return
    try {
      await deleteComment(commentId)
      setMessage('Comment deleted.')
      fieldRef.current?.focus()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not delete the comment.')
    }
  }

  const thread = (
    <>
      {comments.length > 0 && (
        <ul aria-label={`Comments on ${target}`} className="m-0 mt-2 grid list-none gap-2 p-0">
          {comments.map((c) => {
            const mine = c.authorId === data.userId
            const author = mine ? 'you' : c.authorEmail
            return (
              <li key={c.id} className="rounded-md border border-divider bg-cream px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="m-0 text-[0.75rem] text-slate">
                    <span className="break-all font-semibold text-ink">{mine ? 'You' : c.authorEmail}</span>
                    {' · '}
                    <time dateTime={c.createdAt}>{formatTime(c.createdAt)}</time>
                  </p>
                  {(data.isOwner || mine) && (
                    <button
                      type="button"
                      className={button('ghost', 'px-2 py-0.5 text-[0.75rem] text-danger-text')}
                      onClick={() => void remove(c.id, author)}
                    >
                      Delete<span className="sr-only"> comment by {author}</span>
                    </button>
                  )}
                </div>
                <p className="m-0 mt-1 whitespace-pre-line break-words text-[0.8125rem]">{c.body}</p>
              </li>
            )
          })}
        </ul>
      )}
      <form onSubmit={(e) => void submit(e)} noValidate className="mt-2">
        <label htmlFor={`${id}-body`} className={label}>
          Add a comment<span className="sr-only"> on {target}</span>
        </label>
        <textarea
          ref={fieldRef}
          id={`${id}-body`}
          rows={2}
          maxLength={4000}
          className={input}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {error && (
          <p id={`${id}-error`} className="m-0 mt-1 text-xs font-semibold text-danger-text">
            {error}
          </p>
        )}
        <button type="submit" className={button('secondary', 'mt-2 px-3 py-1.5')} disabled={busy}>
          {busy ? 'Posting…' : 'Post comment'}
          <span className="sr-only"> on {target}</span>
        </button>
      </form>
      <p role="status" className="sr-only">
        {message}
      </p>
      {confirmDialog}
    </>
  )

  if (issue) {
    return (
      <details className="mt-2 text-[0.8125rem]">
        <summary className="cursor-pointer font-semibold text-forest">
          Comments ({comments.length})<span className="sr-only"> on issue #{issue.number}</span>
        </summary>
        {thread}
      </details>
    )
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="mt-8">
      <h2 id={`${id}-heading`} className="m-0 font-serif text-xl">
        Comments on this page <span className="text-slate">({comments.length})</span>
      </h2>
      <p className="m-0 mt-1 text-[0.8125rem] text-slate">
        General feedback about the page. To discuss a specific issue, use the comments on that issue.
      </p>
      <div className="max-w-2xl">{thread}</div>
    </section>
  )
}
