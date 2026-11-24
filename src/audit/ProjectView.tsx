import { useMemo, useState } from 'react'
import { wcagLabel } from '../data/wcag'
import { downloadProjectWorkbook } from './exportExcel'
import { computeMetrics, UNSET } from './metrics'
import PageForm from './PageForm'
import ProjectForm from './ProjectForm'
import ViewerAccess from './ViewerAccess'
import { hrefFor, navigate } from './router'
import { createPage, deleteProject, updateProject, useAuditData } from './store'
import type { Project } from './types'
import MetricTable from './ui/MetricTable'
import { button, card, link, PRIORITY_BAR } from './ui/styles'

type Props = { project: Project }

export default function ProjectView({ project }: Props) {
  const data = useAuditData()
  const { isOwner } = data
  const [editing, setEditing] = useState(false)
  const [addingPage, setAddingPage] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [status, setStatus] = useState('')

  const pages = useMemo(() => data.pages.filter((p) => p.projectId === project.id), [data.pages, project.id])
  const issues = useMemo(
    () => data.issues.filter((i) => i.projectId === project.id),
    [data.issues, project.id],
  )
  const m = useMemo(() => computeMetrics(pages, issues), [pages, issues])

  const exportXlsx = async () => {
    setExporting(true)
    setStatus('Preparing Excel export…')
    try {
      await downloadProjectWorkbook(project, pages, issues)
      setStatus('Excel workbook downloaded.')
    } catch {
      setStatus('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const remove = async () => {
    if (
      !window.confirm(
        `Delete "${project.name}" and all of its pages, issues and screenshots? This cannot be undone.`,
      )
    )
      return
    try {
      await deleteProject(project.id)
      navigate(hrefFor.projects())
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not delete the project.')
    }
  }

  const stats: [string, number, string][] = [
    ['Total issues', m.total, 'text-ink'],
    ['Open', m.open, 'text-ink'],
    ['Open Blocker + Critical', m.highImpact, m.highImpact ? 'text-danger-text' : 'text-ink'],
    ['Resolved', m.resolved, 'text-forest'],
    ['Pages', pages.length, 'text-ink'],
  ]

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 tabIndex={-1} className="m-0 font-serif text-3xl">
            {project.name}
          </h1>
          <p className="m-0 mt-1 text-[0.875rem] text-slate">
            {[
              project.client,
              project.platform,
              project.standard,
              project.auditor && `Auditor: ${project.auditor}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {project.url && (
            <p className="m-0 mt-0.5 text-[0.8125rem]">
              <a href={project.url} target="_blank" rel="noopener noreferrer" className={`break-all ${link}`}>
                {project.url}
                <span className="sr-only"> (opens in new tab)</span>
              </a>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={button('primary')}
            onClick={() => void exportXlsx()}
            disabled={exporting}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path
                d="M10 3v10m0 0l-4-4m4 4l4-4M4 16h12"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {exporting ? 'Exporting…' : 'Export to Excel'}
          </button>
          {isOwner && (
            <>
              <button type="button" className={button('secondary')} onClick={() => setEditing(true)}>
                Edit project
              </button>
              <button type="button" className={button('danger')} onClick={() => void remove()}>
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {status}
      </div>

      <section aria-labelledby="metrics-heading" className="mt-8">
        <h2 id="metrics-heading" className="m-0 mb-3 font-serif text-xl">
          Metrics
        </h2>
        <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map(([label, value, tone]) => (
            <div key={label} className={`${card} px-4 py-3`}>
              <dt className="text-[0.75rem] font-semibold text-slate">{label}</dt>
              <dd className={`m-0 text-3xl font-semibold tabular-nums ${tone}`}>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <MetricTable
            title="By severity"
            labelHeader="Priority"
            total={m.total}
            rows={m.byPriority.map((c) => ({
              key: c.key,
              label: c.key,
              count: c.count,
              barClass: PRIORITY_BAR[c.key] ?? 'bg-slate-400',
            }))}
          />
          <MetricTable
            title="By status"
            labelHeader="Status"
            total={m.total}
            rows={m.byStatus.map((c) => ({ key: c.key, label: c.key, count: c.count }))}
          />
          <MetricTable
            title="By WCAG criterion"
            labelHeader="Criterion"
            total={m.total}
            rows={m.byWcag.map((c) => ({
              key: c.key,
              label: c.key === UNSET ? UNSET : wcagLabel(c.key),
              count: c.count,
            }))}
          />
          <MetricTable
            title="By category"
            labelHeader="Category"
            total={m.total}
            rows={m.byCategory.map((c) => ({
              key: c.key,
              label: c.key,
              count: c.count,
              barClass: 'bg-slate',
            }))}
          />
        </div>
      </section>

      <section aria-labelledby="pages-heading" className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="pages-heading" className="m-0 font-serif text-xl">
            Pages
          </h2>
          {isOwner && (
            <button type="button" className={button('primary')} onClick={() => setAddingPage(true)}>
              <span aria-hidden="true">+</span> Add page
            </button>
          )}
        </div>
        {pages.length === 0 ? (
          <div className={`${card} p-8 text-center`}>
            <p className="mx-auto my-0 text-[0.875rem] text-slate">
              {isOwner
                ? 'No pages yet. Add each page or screen you audit to attach a screenshot and log issues against it.'
                : 'No pages have been added to this project yet.'}
            </p>
          </div>
        ) : (
          <div className={`${card} overflow-x-auto`}>
            <table className="w-full border-collapse text-[0.8125rem]">
              <caption className="sr-only">Pages in this project with issue counts</caption>
              <thead className="bg-cream text-left text-[0.6875rem] uppercase tracking-wide text-slate">
                <tr>
                  <th scope="col" className="px-4 py-2 font-semibold">
                    Page
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Issues
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Open
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Blocker
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Critical
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Major
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Minor
                  </th>
                  <th scope="col" className="px-4 py-2 font-semibold">
                    Screenshot
                  </th>
                </tr>
              </thead>
              <tbody>
                {m.byPage.map(({ page, total, open, byPriority }) => (
                  <tr key={page.id} className="border-t border-divider hover:bg-cream">
                    <th scope="row" className="px-4 py-2.5 text-left font-normal">
                      <a href={hrefFor.page(project.id, page.id)} className={`font-semibold ${link}`}>
                        {page.name}
                      </a>
                      {page.url && (
                        <span className="block break-all text-[0.75rem] text-slate">{page.url}</span>
                      )}
                    </th>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{total}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{open}</td>
                    {(['Blocker', 'Critical', 'Major', 'Minor'] as const).map((p) => (
                      <td key={p} className="px-3 py-2.5 text-right tabular-nums">
                        {byPriority[p] ?? 0}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-slate">{page.screenshot ? 'Uploaded' : 'None'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isOwner && <ViewerAccess project={project} />}

      {editing && (
        <ProjectForm
          project={project}
          onClose={() => setEditing(false)}
          onSubmit={async (input) => {
            await updateProject(project.id, input)
            setEditing(false)
          }}
        />
      )}
      {addingPage && (
        <PageForm
          onClose={() => setAddingPage(false)}
          onSubmit={async (input) => {
            const page = await createPage(project.id, input)
            setAddingPage(false)
            navigate(hrefFor.page(project.id, page.id))
          }}
        />
      )}
    </>
  )
}
