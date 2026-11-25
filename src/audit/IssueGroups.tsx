import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import IssueCard from './IssueCard'
import IssueForm from './IssueForm'
import MoveIssueDialog from './MoveIssueDialog'
import { hrefFor, navigate } from './router'
import { deleteIssue, saveIssue, updateIssueStatus, useAuditData } from './store'
import type { AuditPage, Issue, IssueStatus, Project } from './types'
import Badge from './ui/Badge'
import { useConfirm } from './ui/ConfirmDialog'
import { link } from './ui/styles'

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Issues grouped by page, in project page order, each group sorted by issue number. */
export function groupByPage(pages: AuditPage[], issues: Issue[]) {
  return pages
    .map((page) => ({
      page,
      issues: issues.filter((i) => i.pageId === page.id).sort((a, b) => a.number - b.number),
    }))
    .filter((g) => g.issues.length > 0)
}

type Props = {
  project: Project
  /** The issues to show, already filtered. */
  issues: Issue[]
  /** Focused when an owner action takes an issue out of `issues`. */
  headingRef: RefObject<HTMLHeadingElement | null>
  /** How announcements refer to the list, e.g. "this list" or "the results". */
  listName: string
  decorate?: (issue: Issue) => { terms?: string[]; context?: ReactNode }
}

/** Project-wide issue results grouped by page, with the same owner actions as a page's issue list. */
export default function IssueGroups({ project, issues, headingRef, listName, decorate }: Props) {
  const id = useId()
  const data = useAuditData()
  const [confirm, confirmDialog] = useConfirm()
  const [editing, setEditing] = useState<Issue | null>(null)
  const [moving, setMoving] = useState<Issue | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const pages = useMemo(() => data.pages.filter((p) => p.projectId === project.id), [data.pages, project.id])
  const groups = useMemo(() => groupByPage(pages, issues), [pages, issues])
  const pageOf = (issue: Issue) => pages.find((p) => p.id === issue.pageId)!

  // When an action takes an issue out of the list, its card (and focused control) disappears.
  const listedRef = useRef(issues)
  useEffect(() => {
    listedRef.current = issues
  }, [issues])
  const afterAction = (issue: Issue, done: string) => {
    requestAnimationFrame(() => {
      if (listedRef.current.some((i) => i.id === issue.id)) {
        setAnnouncement(done)
        return
      }
      setAnnouncement(`${done} It is no longer in ${listName}.`)
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
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {groups.map(({ page, issues }) => (
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
                  {...decorate?.(issue)}
                />
              </li>
            ))}
          </ol>
        </PageGroup>
      ))}

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
