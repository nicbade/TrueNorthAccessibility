import { useMemo, useRef } from 'react'
import { PRIORITIES } from '../data/commonIssues'
import IssueGroups, { groupByPage, plural } from './IssueGroups'
import { UNSET } from './metrics'
import { hrefFor, type IssueFilter } from './router'
import { useAuditData } from './store'
import { STATUSES, type Issue, type Project } from './types'
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

export const matches = (filter: IssueFilter, value: string) => (i: Issue) =>
  filter === 'severity' ? (i.priority || UNSET) === value : i.status === value

type Props = { project: Project; filter: IssueFilter; value: string }

/** Every issue in the project with one severity or status, grouped by page. Viewers never load hidden pages. */
export default function IssueListView({ project, filter, value }: Props) {
  const data = useAuditData()
  const { isOwner } = data
  const headingRef = useRef<HTMLHeadingElement>(null)

  const pages = useMemo(() => data.pages.filter((p) => p.projectId === project.id), [data.pages, project.id])
  const projectIssues = useMemo(
    () => data.issues.filter((i) => i.projectId === project.id),
    [data.issues, project.id],
  )
  const listed = useMemo(() => projectIssues.filter(matches(filter, value)), [projectIssues, filter, value])
  const groups = useMemo(() => groupByPage(pages, listed), [pages, listed])
  const hiddenCount = groups.filter((g) => g.page.hidden).reduce((n, g) => n + g.issues.length, 0)
  const title = filterTitle(filter, value)
  const dashboard = hrefFor.project(project.id)

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
      ) : null}
      <IssueGroups project={project} issues={listed} headingRef={headingRef} listName="this list" />
    </>
  )
}
