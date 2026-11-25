import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { getWcag } from '../data/wcag'
import Comments from './Comments'
import IssueForm from './IssueForm'
import IssueImageGallery from './IssueImageGallery'
import MoveIssueDialog from './MoveIssueDialog'
import { hrefFor, navigate } from './router'
import { copyIssueToPage, deleteIssue, saveIssue, updateIssueStatus, useAuditData } from './store'
import { STATUSES, type AuditPage, type Issue, type IssueStatus, type Project } from './types'
import Badge from './ui/Badge'
import { useConfirm } from './ui/ConfirmDialog'
import Dialog from './ui/Dialog'
import { button, card, hint, input, label, link } from './ui/styles'

type Props = { project: Project; page: AuditPage; issue: Issue }

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function Field({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.75rem] font-semibold uppercase tracking-wide text-slate">{term}</dt>
      <dd className="m-0 mt-1 break-words text-[0.9375rem]">{children}</dd>
    </div>
  )
}

function TextSection({ title, text }: { title: string; text: string }) {
  if (!text.trim()) return null
  return (
    <section className="mt-8">
      <h2 className="m-0 font-serif text-xl">{title}</h2>
      <p className="m-0 mt-2 max-w-4xl whitespace-pre-line text-base leading-7">{text}</p>
    </section>
  )
}

/** Full-page view of one issue, linkable at #/projects/:id/pages/:pid/issues/:iid. */
export default function IssueView({ project, page, issue }: Props) {
  const id = useId()
  const data = useAuditData()
  const { isOwner } = data
  const [confirm, confirmDialog] = useConfirm()
  const [editing, setEditing] = useState(false)
  const [copying, setCopying] = useState(false)
  const [moving, setMoving] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  const siblings = useMemo(
    () => data.issues.filter((i) => i.pageId === page.id).sort((a, b) => a.number - b.number),
    [data.issues, page.id],
  )
  const position = siblings.findIndex((i) => i.id === issue.id)
  const prev = position > 0 ? siblings[position - 1] : undefined
  const next = position >= 0 && position < siblings.length - 1 ? siblings[position + 1] : undefined
  const pageHref = hrefFor.page(project.id, page.id)
  const component = issue.componentId ? data.components.find((c) => c.id === issue.componentId) : undefined
  const issueHref = (i: Issue) => hrefFor.issue(project.id, page.id, i.id)

  const remove = async () => {
    const shots = issue.images.length
    const ok = await confirm({
      title: `Delete issue #${issue.number}?`,
      message: `Issue #${issue.number}${shots ? `, its ${shots} screenshot${shots === 1 ? '' : 's'}` : ''} and its comments will be deleted.`,
      confirmLabel: 'Delete issue',
      detail: 'This cannot be undone.',
    })
    if (!ok) return
    try {
      await deleteIssue(issue.id, () => navigate(pageHref))
    } catch (e) {
      setAnnouncement(e instanceof Error ? e.message : 'Could not delete the issue.')
    }
  }

  return (
    <article aria-labelledby={`${id}-title`}>
      <nav
        aria-label="Issue navigation"
        className="flex flex-wrap items-center justify-between gap-3 border-b border-divider pb-4"
      >
        <a href={pageHref} className={`${link} text-[0.875rem] font-semibold`}>
          <span aria-hidden="true">← </span>Back to {page.name}
        </a>
        <div className="flex flex-wrap items-center gap-2">
          <p className="m-0 mr-1 text-[0.8125rem] text-slate">
            Issue {position + 1} of {siblings.length} on this page
          </p>
          {prev ? (
            <a href={issueHref(prev)} rel="prev" className={button('secondary')}>
              <span aria-hidden="true">← </span>Previous issue
              <span className="sr-only"> #{prev.number}</span>
            </a>
          ) : (
            <span aria-disabled="true" className={button('secondary', 'pointer-events-none opacity-60')}>
              <span aria-hidden="true">← </span>Previous issue
              <span className="sr-only"> (none, this is the first)</span>
            </span>
          )}
          {next ? (
            <a href={issueHref(next)} rel="next" className={button('secondary')}>
              Next issue<span className="sr-only"> #{next.number}</span>
              <span aria-hidden="true"> →</span>
            </a>
          ) : (
            <span aria-disabled="true" className={button('secondary', 'pointer-events-none opacity-60')}>
              Next issue<span className="sr-only"> (none, this is the last)</span>
              <span aria-hidden="true"> →</span>
            </span>
          )}
        </div>
      </nav>

      <header className="mt-6">
        <p className="m-0 text-[0.875rem] font-semibold text-slate">
          Issue #{issue.number} · {page.name}
        </p>
        <h1 id={`${id}-title`} tabIndex={-1} className="m-0 mt-1 max-w-5xl font-serif text-3xl leading-tight">
          <span className="sr-only">Issue {issue.number}: </span>
          {issue.description}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {issue.priority && <Badge kind="priority" value={issue.priority} srPrefix="Priority" />}
          <Badge kind="status" value={issue.status} srPrefix="Status" />
          {issue.category && <Badge kind="neutral" value={issue.category} srPrefix="Category" />}
          {issue.siteWide && <Badge kind="siteWide" value="Site-wide" />}
        </div>
      </header>

      {isOwner && (
        <div
          role="group"
          aria-label="Issue actions"
          className={`${card} mt-5 flex flex-wrap items-end justify-between gap-3 p-4`}
        >
          <div>
            <label htmlFor={`${id}-status`} className={label}>
              Status
            </label>
            <select
              id={`${id}-status`}
              className={`${input} w-auto`}
              value={issue.status}
              onChange={(e) => {
                const value = e.target.value as IssueStatus
                updateIssueStatus(issue.id, value).then(
                  () => setAnnouncement(`Issue #${issue.number} marked ${value}.`),
                  (err) =>
                    setAnnouncement(err instanceof Error ? err.message : 'Could not update the status.'),
                )
              }}
            >
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button('secondary')} onClick={() => setEditing(true)}>
              Edit issue
            </button>
            <button type="button" className={button('secondary')} onClick={() => setCopying(true)}>
              Copy to a page
            </button>
            <button type="button" className={button('secondary')} onClick={() => setMoving(true)}>
              Move to page…
            </button>
            <button type="button" className={button('danger')} onClick={() => void remove()}>
              Delete issue
            </button>
          </div>
        </div>
      )}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <section aria-labelledby={`${id}-details`} className={`${card} mt-6 p-5`}>
        <h2 id={`${id}-details`} className="sr-only">
          Details
        </h2>
        <dl className="m-0 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field term="Priority">{issue.priority || 'Not set'}</Field>
          <Field term="Status">{issue.status}</Field>
          <Field term="Category">{issue.category || 'Not set'}</Field>
          <Field term="Location">{issue.location || 'Not set'}</Field>
          <Field term="Scope">{issue.siteWide ? 'Site-wide' : 'This page only'}</Field>
          <Field term="Component">
            {component ? (
              <a href={hrefFor.component(project.id, component.id)} className={link}>
                {component.name}
              </a>
            ) : (
              'None'
            )}
          </Field>
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-[0.75rem] font-semibold uppercase tracking-wide text-slate">WCAG criteria</dt>
            <dd className="m-0 mt-1 text-[0.9375rem]">
              {issue.wcag.length ? (
                <ul className="m-0 list-none p-0">
                  {issue.wcag.map((w) => {
                    const c = getWcag(w)
                    return <li key={w}>{c ? `${w} ${c.name} (Level ${c.level})` : w}</li>
                  })}
                </ul>
              ) : (
                'None listed'
              )}
            </dd>
          </div>
          <Field term="Logged">
            <time dateTime={issue.createdAt}>{formatDate(issue.createdAt)}</time>
          </Field>
          <Field term="Last updated">
            <time dateTime={issue.updatedAt}>{formatDate(issue.updatedAt)}</time>
          </Field>
        </dl>
      </section>

      <TextSection title="Expected behavior" text={issue.expectedBehavior} />
      <TextSection title="How to fix" text={issue.fix} />
      <TextSection title="Auditor notes" text={issue.comments} />

      {issue.examples.some((ex) => ex.url) && (
        <section className="mt-8">
          <h2 className="m-0 font-serif text-xl">Working examples and references</h2>
          <ul className="m-0 mt-2 grid gap-1 pl-5 text-base">
            {issue.examples
              .filter((ex) => ex.url)
              .map((ex, i) => (
                <li key={i}>
                  <a href={ex.url} target="_blank" rel="noopener noreferrer" className={`break-all ${link}`}>
                    {ex.label || ex.url}
                    <span className="sr-only"> (opens in new tab)</span>
                  </a>
                  <span className="text-[0.8125rem] text-slate"> · {ex.kind}</span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <section aria-labelledby={`${id}-shots`} className="mt-8">
        <h2 id={`${id}-shots`} className="m-0 font-serif text-xl">
          Screenshots <span className="text-slate">({issue.images.length})</span>
        </h2>
        {issue.images.length ? (
          <>
            <p className="m-0 mb-3 mt-1 text-[0.8125rem] text-slate">Select a screenshot to enlarge it.</p>
            <IssueImageGallery issue={issue} large />
          </>
        ) : (
          <p className="m-0 mt-2 text-[0.875rem] text-slate">No screenshots for this issue.</p>
        )}
      </section>

      <Comments page={page} issue={issue} expanded />

      {editing && (
        <IssueForm
          issue={issue}
          projectId={project.id}
          platform={project.platform}
          pageName={page.name}
          onClose={() => setEditing(false)}
          onSubmit={async (draft, pending) => {
            const saved = await saveIssue(page, draft, pending, issue.id)
            setEditing(false)
            setAnnouncement(`Issue #${saved.number} saved.`)
          }}
        />
      )}
      {copying && (
        <CopyToPageDialog
          project={project}
          page={page}
          issue={issue}
          onClose={() => setCopying(false)}
          onCopied={(copy) => {
            setCopying(false)
            navigate(hrefFor.issue(project.id, copy.pageId, copy.id))
          }}
        />
      )}
      {moving && (
        <MoveIssueDialog
          page={page}
          issue={issue}
          onClose={() => setMoving(false)}
          onMoved={(moved, to) => {
            setMoving(false)
            navigate(hrefFor.issue(project.id, to.id, moved.id))
          }}
        />
      )}
      {confirmDialog}
    </article>
  )
}

function CopyToPageDialog({
  project,
  page,
  issue,
  onClose,
  onCopied,
}: {
  project: Project
  page: AuditPage
  issue: Issue
  onClose: () => void
  onCopied: (copy: Issue) => void
}) {
  const id = useId()
  const formId = `${id}-form`
  const data = useAuditData()
  const pages = data.pages.filter((p) => p.projectId === project.id)
  const [target, setTarget] = useState(pages.find((p) => p.id !== page.id)?.id ?? page.id)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const dest = pages.find((p) => p.id === target)
    if (!dest) return
    setBusy(true)
    setError('')
    try {
      onCopied(await copyIssueToPage(issue, dest))
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : 'Could not copy the issue.')
    }
  }

  return (
    <Dialog
      title={`Copy issue #${issue.number}`}
      description="The copy gets the next issue number, starts as Open and keeps the screenshots. You'll be taken to the copy."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={button('secondary')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className={button('primary')} disabled={busy}>
            {busy ? 'Copying…' : 'Copy issue'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate>
        <label htmlFor={`${id}-page`} className={label}>
          Copy to page
        </label>
        <select
          id={`${id}-page`}
          data-autofocus
          className={input}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
        >
          {pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.id === page.id ? ' (this page)' : ''}
              {p.hidden ? ' (hidden from clients)' : ''}
            </option>
          ))}
        </select>
        {error ? (
          <p id={`${id}-error`} role="alert" className="m-0 mt-1 text-xs font-semibold text-danger-text">
            {error}
          </p>
        ) : (
          <p id={`${id}-hint`} className={hint}>
            Use this when the same problem appears on another page.
          </p>
        )}
      </form>
    </Dialog>
  )
}
