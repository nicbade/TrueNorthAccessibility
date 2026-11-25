import { useEffect, useMemo, useRef, useState } from 'react'
import IssueGroups, { groupByPage, plural } from './IssueGroups'
import { filterValues, isFilterValue, matches } from './IssueListView'
import IssueSearchForm from './IssueSearchForm'
import { hrefFor, replaceRoute, type IssueFilter, type SearchParams } from './router'
import { Highlight, matchIssue, parseQuery, type Match } from './search'
import { useAuditData } from './store'
import type { Project } from './types'
import { button, card, link } from './ui/styles'

const DEBOUNCE_MS = 300

type Props = { project: Project } & SearchParams

/** Searches every issue in the project the signed-in user can see (viewers never load hidden pages). */
export default function SearchView({ project, q, severity: rawSeverity, status: rawStatus }: Props) {
  const data = useAuditData()
  const { isOwner } = data
  const headingRef = useRef<HTMLHeadingElement>(null)
  const severity = isFilterValue('severity', rawSeverity) ? rawSeverity : ''
  const status = isFilterValue('status', rawStatus) ? rawStatus : ''

  // The address holds the committed query; the box updates it after a pause in typing.
  const [text, setText] = useState(q)
  useEffect(() => {
    setText((current) => (current.trim() === q ? current : q))
  }, [q])
  const commit = (params: Partial<SearchParams>) =>
    replaceRoute(hrefFor.search(project.id, { q: text.trim(), severity, status, ...params }))
  useEffect(() => {
    if (text.trim() === q) return
    const t = setTimeout(
      () => replaceRoute(hrefFor.search(project.id, { q: text.trim(), severity, status })),
      DEBOUNCE_MS,
    )
    return () => clearTimeout(t)
  }, [text, q, severity, status, project.id])

  const pages = useMemo(() => data.pages.filter((p) => p.projectId === project.id), [data.pages, project.id])
  const projectIssues = useMemo(
    () => data.issues.filter((i) => i.projectId === project.id),
    [data.issues, project.id],
  )
  const componentNames = useMemo(() => new Map(data.components.map((c) => [c.id, c.name])), [data.components])
  const query = useMemo(() => parseQuery(q), [q])
  const textMatches = useMemo(() => {
    const found = new Map<string, Match>()
    for (const issue of projectIssues) {
      const m = matchIssue(issue, query, issue.componentId ? componentNames.get(issue.componentId) : '')
      if (m) found.set(issue.id, m)
    }
    return found
  }, [projectIssues, query, componentNames])
  const byText = useMemo(
    () => projectIssues.filter((i) => textMatches.has(i.id)),
    [projectIssues, textMatches],
  )
  const results = useMemo(
    () =>
      byText.filter(
        (i) => (!severity || matches('severity', severity)(i)) && (!status || matches('status', status)(i)),
      ),
    [byText, severity, status],
  )
  const groups = useMemo(() => groupByPage(pages, results), [pages, results])
  const active = q !== '' || severity !== '' || status !== ''
  const hiddenCount = groups.filter((g) => g.page.hidden).reduce((n, g) => n + g.issues.length, 0)

  const describe = [q && `“${q}”`, severity && `severity ${severity}`, status && `status ${status}`]
    .filter(Boolean)
    .join(', ')
  const summary = !active
    ? ''
    : results.length === 0
      ? `No issues match ${describe}.`
      : `${plural(results.length, 'issue')} on ${plural(groups.length, 'page')} match ${describe}.`

  const chips = (filter: IssueFilter, current: string) => (
    <div role="group" aria-labelledby={`chips-${filter}`} className="flex flex-wrap items-center gap-2">
      <span id={`chips-${filter}`} className="mr-1 w-16 text-[0.8125rem] font-semibold">
        {filter === 'severity' ? 'Severity' : 'Status'}
      </span>
      {filterValues(filter).map((v) => {
        const count = (
          filter === 'severity' && status
            ? byText.filter(matches('status', status))
            : filter === 'status' && severity
              ? byText.filter(matches('severity', severity))
              : byText
        ).filter(matches(filter, v)).length
        const pressed = v === current
        return (
          <button
            key={v}
            type="button"
            aria-pressed={pressed}
            onClick={() => commit({ [filter]: pressed ? '' : v })}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.8125rem] font-semibold ${
              pressed
                ? 'border-forest-btn bg-forest-btn text-white'
                : 'border-slate bg-surface text-ink hover:border-forest'
            }`}
          >
            {v}{' '}
            <span className={pressed ? '' : 'text-slate'}>
              ({count}
              <span className="sr-only"> {count === 1 ? 'issue' : 'issues'}</span>)
            </span>
          </button>
        )
      })}
    </div>
  )

  return (
    <>
      <p className="m-0 text-[0.875rem] font-semibold text-slate">Search · {project.name}</p>
      <h1 ref={headingRef} tabIndex={-1} className="m-0 mt-1 font-serif text-3xl">
        Search issues
      </h1>
      <p className="m-0 mt-2 text-[0.9375rem]">
        <a href={hrefFor.project(project.id)} className={link}>
          Back to the project dashboard
        </a>
      </p>

      <IssueSearchForm
        className="mt-5"
        projectName={project.name}
        value={text}
        onChange={setText}
        onSubmit={() => commit({})}
      />
      <div className="mt-4 grid gap-2">
        {chips('severity', severity)}
        {chips('status', status)}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <p role="status" className="m-0 text-[0.9375rem] font-semibold">
          {summary}
        </p>
        {(severity || status) && (
          <button
            type="button"
            className={button('ghost', 'px-2 py-1')}
            onClick={() => commit({ severity: '', status: '' })}
          >
            Clear filters
          </button>
        )}
      </div>
      {isOwner && hiddenCount > 0 && (
        <p className="m-0 mt-1 text-[0.8125rem] text-slate">
          Includes {plural(hiddenCount, 'issue')} on hidden pages that clients can't see.
        </p>
      )}

      {!active ? (
        <div className={`${card} mt-4 p-8 text-center`}>
          <p className="m-0 text-[0.9375rem]">
            Type a word or an issue number, or pick a severity or status, to find issues across all{' '}
            {plural(pages.length, 'page')} of this project.
          </p>
        </div>
      ) : results.length === 0 ? (
        <div className={`${card} mt-4 p-8 text-center`}>
          <p className="m-0 text-[0.9375rem]">No issues found.</p>
          <p className="m-0 mt-2 text-[0.875rem] text-slate">
            Check the spelling, try fewer or different words
            {severity || status ? ', or clear the filters' : ''}.
          </p>
        </div>
      ) : null}
      <IssueGroups
        project={project}
        issues={active ? results : []}
        headingRef={headingRef}
        listName="the results"
        decorate={(issue) => {
          const context = textMatches.get(issue.id)?.context ?? []
          return {
            terms: query.terms,
            context: context.length > 0 && (
              <dl className="m-0 mt-1 grid gap-0.5 text-[0.8125rem]">
                {context.map((c) => (
                  <div key={c.label}>
                    <dt className="inline font-semibold">Matched in {c.label}: </dt>
                    <dd className="m-0 inline">
                      <Highlight text={c.text} terms={query.terms} />
                    </dd>
                  </div>
                ))}
              </dl>
            ),
          }
        }}
      />
    </>
  )
}
