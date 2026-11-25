import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { PRIORITIES } from '../data/commonIssues'
import IssueCard from './IssueCard'
import IssueForm from './IssueForm'
import { UNSET } from './metrics'
import MoveIssueDialog from './MoveIssueDialog'
import { hrefFor, navigate, type IssueFilter } from './router'
import { deleteIssue, saveIssue, updateIssueStatus, useAuditData } from './store'
import { STATUSES, type AuditPage, type Issue, type IssueStatus, type Project } from './types'
import Badge from './ui/Badge'
import { useConfirm } from './ui/ConfirmDialog'
import { card, link } from './ui/styles'

export function filterValues(filter: IssueFilter): string[] {
  return filter === 'severity' ? [...PRIORITIES, UNSET] : STATUSES
}

export function isFilterValue(filter: IssueFilter, value: string) {
  return filterValues(filter).includes(value)
}

export function filterTitle(filter: IssueFilter, value: string) {
  return filter === 'severity' && value === UNSET ? 'Issues with no severity' : `${value} issues`
}

const matches = (filter: IssueFilter, value: string) => (i: Issue) =>
  filter === 'severity' ? (i.priority || UNSET) === value : i.status === value

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

type Props = { project: Project; filter: IssueFilter; value: string }

/** Every issue in the project with one severity or status, grouped by page. Viewers never load hidden pages. */
export default function IssueListView({ project, filter, value }: Props) {
  const id = useId()
  const data = useAuditData()
  const { isOwner } = data
  const [confirm, confirmDialog] = useConfirm()
  const [editing, setEditing] = useState<Issue | null>(null)
  const [moving, setMoving] = useState<Issue | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)

  const pages = useMemo(() => data.pages.filter((p) => p.projectId === project.id), [data.pages, project.id])
  const projectIssues = useMemo(
    () => data.issues.filter((i) => i.projectId === project.id),
    [data.issues, project.id],
  )
  const listed = useMemo(() => projectIssues.filter(matches(filter, value)), [projectIssues, filter, value])
  const groups = useMemo(
    () =>
      pages
        .map((page) => ({
          page,
          issues: listed.filter((i) => i.pageId === page.id).sort((a, b) => a.number - b.number),
        }))
        .filter((g) => g.issues.length > 0),
    [pages, listed],
  )
  const hiddenCount = groups.filter((g) => g.page.hidden).reduce((n, g) => n + g.issues.length, 0)
  const pageOf = (issue: Issue) => pages.find((p) => p.id === issue.pageId)!
  const title = filterTitle(filter, value)
  const dashboard = hrefFor.project(project.id)

  // When an action takes an issue out of this list, its card (and focused control) disappears.
  const listedRef = useRef(listed)
  useEffect(() => {
    listedRef.current = listed
  }, [listed])
  const afterAction = (issue: Issue, done: string) => {
    requestAnimationFrame(() => {
      if (listedRef.current.some((i) => i.id === issue.id)) {
        setAnnouncement(done)
        return
      }
      setAnnouncement(`${done} It is no longer in this list.`)
      headingRef.current?.focus()
    })
  }

  const changeStatus = (issue: Issue, next: IssueStatus) => {
    updateIssueStatus(issue.id, next).then(
      () => afterAction(issue, `Issue #${issue.number} marked ${next}.`),
      (err) => setAnnouncement(err instanceof Error ? err.message : 'Could not update the status.'),
    )
  }

  const remove = async (issue: Issue) => {
    const shots = issue.images.length
    const ok = await confirm({
      title: `Delete issue #${issue.number}?`,
      message: `Issue #${issue.number}${shots ? `, its ${plural(shots, 'screenshot')}` : ''} and its comments will be deleted.`,
      confirmLabel: 'Delete issue',
      detail: 'This cannot be undone.',
    })
    if (!ok) return
    try {
      await deleteIssue(issue.id)
      afterAction(issue, `Issue #${issue.number} deleted.`)
    } catch (e) {
      setAnnouncement(e instanceof Error ? e.message : 'Could not delete the issue.')
    }
  }

  return (
    <>
      <p className="m-0 text-[0.875rem] font-semibold text-slate">
        {filter === 'severity' ? 'Severity' : 'Status'} · {project.name}
      </p>
      <h1 ref={headingRef} tabIndex={-1} className="m-0 mt-1 font-serif text-3xl">
        {title}
      </h1>
      <p className="m-0 mt-2 text-[0.9375rem]">
        {listed.length === 0
          ? 'No issues.'
          : `${plural(listed.length, 'issue')} on ${plural(groups.length, 'page')}.`}{' '}
        <a href={dashboard} className={link}>
          Back to the project dashboard
        </a>
      </p>
      {isOwner && hiddenCount > 0 && (
        <p className="m-0 mt-2 text-[0.8125rem] text-slate">
          Includes {plural(hiddenCount, 'issue')} on hidden pages that clients can't see.
        </p>
      )}

      <nav aria-label={filter === 'severity' ? 'Severities' : 'Statuses'} className="mt-5">
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {filterValues(filter).map((v) => {
            const count = projectIssues.filter(matches(filter, v)).length
            if (filter === 'severity' && v === UNSET && count === 0 && v !== value) return null
            const current = v === value
            return (
              <li key={v}>
                <a
                  href={hrefFor.issues(project.id, filter, v)}
                  aria-current={current ? 'page' : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.8125rem] font-semibold ${
                    current
                      ? 'border-forest-btn bg-forest-btn text-white'
                      : 'border-slate bg-surface text-ink hover:border-forest'
                  }`}
                >
                  {v}{' '}
                  <span className={current ? '' : 'text-slate'}>
                    ({count}
                    <span className="sr-only"> {count === 1 ? 'issue' : 'issues'}</span>)
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      </nav>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {groups.length === 0 ? (
        <div className={`${card} mt-6 p-8 text-center`}>
          <p className="m-0 text-[0.9375rem]">
            {filter === 'severity' && value === UNSET
              ? 'Every issue in this project has a severity.'
              : `There are no ${value} issues in this project.`}
          </p>
          <p className="m-0 mt-2 text-[0.875rem]">
            <a href={dashboard} className={link}>
              Back to the project dashboard
            </a>
          </p>
        </div>
      ) : (
        groups.map(({ page, issues }) => (
          <PageGroup key={page.id} id={id} project={project} page={page} count={issues.length}>
            <ol className="m-0 mt-3 grid list-none gap-3 p-0">
              {issues.map((issue) => (
                <li key={issue.id}>
                  <IssueCard
                    project={project}
                    page={page}
                    issue={issue}
                    onStatus={changeStatus}
                    onEdit={setEditing}
                    onMove={setMoving}
                    onDelete={(i) => void remove(i)}
                  />
                </li>
              ))}
            </ol>
          </PageGroup>
        ))
      )}

      {editing && (
        <IssueForm
          issue={editing}
          platform={project.platform}
          pageName={pageOf(editing).name}
          onClose={() => setEditing(null)}
          onSubmit={async (draft, pending) => {
            const saved = await saveIssue(pageOf(editing), draft, pending, editing.id)
            setEditing(null)
            afterAction(saved, `Issue #${saved.number} saved.`)
          }}
        />
      )}
      {moving && (
        <MoveIssueDialog
          page={pageOf(moving)}
          issue={moving}
          onClose={() => setMoving(null)}
          onMoved={(moved, to) => {
            setMoving(null)
            navigate(hrefFor.issue(project.id, to.id, moved.id))
          }}
        />
      )}
      {confirmDialog}
    </>
  )
}

function PageGroup({
  id,
  project,
  page,
  count,
  children,
}: {
  id: string
  project: Project
  page: AuditPage
  count: number
  children: ReactNode
}) {
  const { isOwner } = useAuditData()
  const headingId = `${id}-page-${page.id}`
  return (
    <section aria-labelledby={headingId} className="mt-8">
      <div className="flex flex-wrap items-center gap-2 border-b border-divider pb-2">
        <h2 id={headingId} className="m-0 font-serif text-xl">
          <a href={hrefFor.page(project.id, page.id)} className={link}>
            {page.name}
          </a>
        </h2>
        <span className="text-[0.875rem] text-slate">({plural(count, 'issue')})</span>
        {isOwner && page.hidden && <Badge kind="neutral" value="Hidden from clients" />}
      </div>
      {children}
    </section>
  )
}
