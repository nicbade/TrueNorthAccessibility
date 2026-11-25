import { useId } from 'react'
import { getWcag } from '../data/wcag'
import Comments from './Comments'
import IssueImageGallery from './IssueImageGallery'
import { hrefFor } from './router'
import { useAuditData } from './store'
import { STATUSES, type AuditPage, type Issue, type IssueStatus, type Project } from './types'
import Badge from './ui/Badge'
import { button, card, input } from './ui/styles'

type Props = {
  project: Project
  page: AuditPage
  issue: Issue
  onStatus: (issue: Issue, status: IssueStatus) => void
  onEdit: (issue: Issue) => void
  onMove: (issue: Issue) => void
  onDelete: (issue: Issue) => void
}

/** An issue in a list (page view, severity/status views). Owner actions show only for owners. */
export default function IssueCard({ project, page, issue, onStatus, onEdit, onMove, onDelete }: Props) {
  const id = useId()
  const { isOwner } = useAuditData()
  return (
    <article className={`${card} p-4`} aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[0.75rem] font-bold text-slate">#{issue.number}</span>
        {issue.priority && <Badge kind="priority" value={issue.priority} srPrefix="Priority" />}
        <Badge kind="status" value={issue.status} srPrefix="Status" />
        {issue.category && <Badge kind="neutral" value={issue.category} srPrefix="Category" />}
        {issue.siteWide && <Badge kind="siteWide" value="Site-wide" />}
        <a
          href={hrefFor.issue(project.id, page.id, issue.id)}
          className={button('secondary', 'ml-auto px-2.5 py-1 text-[0.75rem]')}
        >
          <span aria-hidden="true">⤢ </span>Open full view
          <span className="sr-only"> of issue #{issue.number}</span>
        </a>
      </div>
      <h3 id={`${id}-title`} className="m-0 mt-2 font-sans text-[0.9375rem] font-semibold leading-6">
        <a
          href={hrefFor.issue(project.id, page.id, issue.id)}
          data-issue-link={issue.id}
          className="rounded text-ink underline decoration-slate underline-offset-4 hover:text-forest hover:decoration-forest"
        >
          <span className="sr-only">Issue {issue.number}: </span>
          {issue.description}
        </a>
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
          <summary className="cursor-pointer font-semibold text-forest">Expected behavior and fix</summary>
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
      <Comments page={page} issue={issue} />
      {isOwner && (
        <div className="mt-3 flex flex-wrap items-end justify-between gap-2 border-t border-divider pt-3">
          <div className="flex items-center gap-2">
            <label htmlFor={`${id}-status`} className="text-[0.75rem] font-semibold text-slate">
              Status<span className="sr-only"> for issue #{issue.number}</span>
            </label>
            <select
              id={`${id}-status`}
              className={`${input} w-auto py-1`}
              value={issue.status}
              onChange={(e) => onStatus(issue, e.target.value as IssueStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-1">
            <button type="button" className={button('ghost')} onClick={() => onEdit(issue)}>
              Edit<span className="sr-only"> issue #{issue.number}</span>
            </button>
            <button type="button" className={button('ghost')} onClick={() => onMove(issue)}>
              Move<span className="sr-only"> issue #{issue.number} to another page</span>
            </button>
            <button
              type="button"
              className={button('ghost', 'text-danger-text')}
              onClick={() => onDelete(issue)}
            >
              Delete<span className="sr-only"> issue #{issue.number}</span>
            </button>
          </div>
        </div>
      )}
    </article>
  )
}
