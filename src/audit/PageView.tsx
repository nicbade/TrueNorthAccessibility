import { useId, useMemo, useState } from 'react'
import { PRIORITIES } from '../data/commonIssues'
import { getWcag } from '../data/wcag'
import IssueForm from './IssueForm'
import IssueImageGallery from './IssueImageGallery'
import PageForm from './PageForm'
import { hrefFor, navigate } from './router'
import ScreenshotPanel from './ScreenshotPanel'
import { deleteIssue, deletePage, saveIssue, updateIssueStatus, updatePage, useAuditData } from './store'
import { STATUSES, type AuditPage, type Issue, type IssueStatus, type Project } from './types'
import Badge from './ui/Badge'
import { button, card, input, label, link } from './ui/styles'

type Props = { project: Project; page: AuditPage }

const PRIORITY_RANK: Record<string, number> = { Blocker: 0, Critical: 1, Major: 2, Minor: 3 }

export default function PageView({ project, page }: Props) {
  const data = useAuditData()
  const id = useId()
  const { isOwner } = data
  const [editingPage, setEditingPage] = useState(false)
  const [issueForm, setIssueForm] = useState<{ issue?: Issue } | null>(null)
  const [statusFilter, setStatusFilter] = useState<'All' | IssueStatus>('All')
  const [priorityFilter, setPriorityFilter] = useState('All')
  const [sort, setSort] = useState<'number' | 'priority'>('number')
  const [announcement, setAnnouncement] = useState('')

  const issues = useMemo(() => data.issues.filter((i) => i.pageId === page.id), [data.issues, page.id])
  const visible = useMemo(
    () =>
      issues
        .filter((i) => statusFilter === 'All' || i.status === statusFilter)
        .filter((i) => priorityFilter === 'All' || (i.priority || 'Not set') === priorityFilter)
        .sort((a, b) =>
          sort === 'priority'
            ? (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) || a.number - b.number
            : a.number - b.number,
        ),
    [issues, statusFilter, priorityFilter, sort],
  )

  const removePage = async () => {
    if (!window.confirm(`Delete page "${page.name}" with its ${issues.length} issue(s) and screenshot?`))
      return
    try {
      await deletePage(page.id)
      navigate(hrefFor.project(project.id))
    } catch (e) {
      setAnnouncement(e instanceof Error ? e.message : 'Could not delete the page.')
    }
  }

  const removeIssue = async (issue: Issue) => {
    const shots = issue.images.length
    if (
      !window.confirm(
        `Delete issue #${issue.number}${shots ? ` and its ${shots} screenshot${shots === 1 ? '' : 's'}` : ''}?`,
      )
    )
      return
    try {
      await deleteIssue(issue.id)
      setAnnouncement(`Issue #${issue.number} deleted.`)
      document.getElementById(`${id}-add`)?.focus()
    } catch (e) {
      setAnnouncement(e instanceof Error ? e.message : 'Could not delete the issue.')
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 tabIndex={-1} className="m-0 font-serif text-3xl">
            {page.name}
          </h1>
          {page.url && (
            <p className="m-0 mt-1 text-[0.8125rem]">
              <a href={page.url} target="_blank" rel="noopener noreferrer" className={`break-all ${link}`}>
                {page.url}
                <span className="sr-only"> (opens in new tab)</span>
              </a>
            </p>
          )}
          {page.notes && <p className="m-0 mt-1 text-[0.8125rem] text-slate">{page.notes}</p>}
        </div>
        {isOwner && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button('secondary')} onClick={() => setEditingPage(true)}>
              Edit page
            </button>
            <button type="button" className={button('danger')} onClick={() => void removePage()}>
              Delete page
            </button>
          </div>
        )}
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <ScreenshotPanel page={page} />

        <section aria-labelledby={`${id}-issues`} className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id={`${id}-issues`} className="m-0 font-serif text-xl">
              Issues <span className="text-slate">({issues.length})</span>
            </h2>
            {isOwner && (
              <button
                id={`${id}-add`}
                type="button"
                className={button('primary')}
                onClick={() => setIssueForm({})}
              >
                <span aria-hidden="true">+</span> Add issue
              </button>
            )}
          </div>

          {issues.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Filter and sort issues">
              <div>
                <label htmlFor={`${id}-fs`} className={label}>
                  Status
                </label>
                <select
                  id={`${id}-fs`}
                  className={input}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'All' | IssueStatus)}
                >
                  <option>All</option>
                  {STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-fp`} className={label}>
                  Priority
                </label>
                <select
                  id={`${id}-fp`}
                  className={input}
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                >
                  <option>All</option>
                  {PRIORITIES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                  <option>Not set</option>
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-sort`} className={label}>
                  Sort by
                </label>
                <select
                  id={`${id}-sort`}
                  className={input}
                  value={sort}
                  onChange={(e) => setSort(e.target.value as 'number' | 'priority')}
                >
                  <option value="number">Issue number</option>
                  <option value="priority">Priority</option>
                </select>
              </div>
            </div>
          )}

          {issues.length === 0 ? (
            <div className={`${card} mt-3 p-8 text-center`}>
              <p className="mx-auto my-0 text-[0.875rem] text-slate">
                {isOwner ? (
                  <>
                    No issues logged for this page. Use <strong>Add issue</strong> and search the common
                    issues library to fill in the details quickly.
                  </>
                ) : (
                  'No issues have been logged for this page.'
                )}
              </p>
            </div>
          ) : (
            <>
              <p className="m-0 mt-3 text-[0.75rem] text-slate" aria-live="polite">
                Showing {visible.length} of {issues.length}
              </p>
              <ol className="m-0 mt-2 grid list-none gap-3 p-0">
                {visible.map((issue) => (
                  <li key={issue.id}>
                    <article className={`${card} p-4`} aria-labelledby={`${id}-i-${issue.id}`}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[0.75rem] font-bold text-slate">#{issue.number}</span>
                        {issue.priority && (
                          <Badge kind="priority" value={issue.priority} srPrefix="Priority" />
                        )}
                        <Badge kind="status" value={issue.status} srPrefix="Status" />
                        {issue.category && (
                          <Badge kind="neutral" value={issue.category} srPrefix="Category" />
                        )}
                      </div>
                      <h3
                        id={`${id}-i-${issue.id}`}
                        className="m-0 mt-2 font-sans text-[0.9375rem] font-semibold leading-6"
                      >
                        <span className="sr-only">Issue {issue.number}: </span>
                        {issue.description}
                      </h3>
                      {issue.location && (
                        <p className="m-0 mt-1 text-[0.75rem] text-slate">
                          <span className="font-semibold">Location:</span> {issue.location}
                        </p>
                      )}
                      {issue.wcag.length > 0 && (
                        <p className="m-0 mt-1 text-[0.75rem] text-slate">
                          <span className="font-semibold">WCAG:</span>{' '}
                          {issue.wcag.map((w) => (getWcag(w) ? `${w} ${getWcag(w)!.name}` : w)).join('; ')}
                        </p>
                      )}
                      <IssueImageGallery issue={issue} />
                      {(issue.expectedBehavior || issue.fix) && (
                        <details className="mt-2 text-[0.8125rem]">
                          <summary className="cursor-pointer font-semibold text-forest">
                            Expected behavior and fix
                          </summary>
                          {issue.expectedBehavior && (
                            <p className="mb-0 mt-2 whitespace-pre-line">
                              <span className="font-semibold">Expected:</span> {issue.expectedBehavior}
                            </p>
                          )}
                          {issue.fix && (
                            <p className="mb-0 mt-2 whitespace-pre-line">
                              <span className="font-semibold">Fix:</span> {issue.fix}
                            </p>
                          )}
                        </details>
                      )}
                      {isOwner && (
                        <div className="mt-3 flex flex-wrap items-end justify-between gap-2 border-t border-divider pt-3">
                          <div className="flex items-center gap-2">
                            <label
                              htmlFor={`${id}-st-${issue.id}`}
                              className="text-[0.75rem] font-semibold text-slate"
                            >
                              Status<span className="sr-only"> for issue #{issue.number}</span>
                            </label>
                            <select
                              id={`${id}-st-${issue.id}`}
                              className={`${input} w-auto py-1`}
                              value={issue.status}
                              onChange={(e) => {
                                const next = e.target.value as IssueStatus
                                updateIssueStatus(issue.id, next).then(
                                  () => setAnnouncement(`Issue #${issue.number} marked ${next}.`),
                                  (err) =>
                                    setAnnouncement(
                                      err instanceof Error ? err.message : 'Could not update the status.',
                                    ),
                                )
                              }}
                            >
                              {STATUSES.map((s) => (
                                <option key={s}>{s}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className={button('ghost')}
                              onClick={() => setIssueForm({ issue })}
                            >
                              Edit<span className="sr-only"> issue #{issue.number}</span>
                            </button>
                            <button
                              type="button"
                              className={button('ghost', 'text-danger-text')}
                              onClick={() => void removeIssue(issue)}
                            >
                              Delete<span className="sr-only"> issue #{issue.number}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      </div>

      {editingPage && (
        <PageForm
          page={page}
          onClose={() => setEditingPage(false)}
          onSubmit={async (input) => {
            await updatePage(page.id, input)
            setEditingPage(false)
          }}
        />
      )}
      {issueForm && (
        <IssueForm
          issue={issueForm.issue}
          platform={project.platform}
          pageName={page.name}
          onClose={() => setIssueForm(null)}
          onSubmit={async (draft, pending) => {
            const saved = await saveIssue(page, draft, pending, issueForm.issue?.id)
            setIssueForm(null)
            setAnnouncement(
              issueForm.issue ? `Issue #${saved.number} saved.` : `Issue #${saved.number} added.`,
            )
          }}
        />
      )}
    </>
  )
}
