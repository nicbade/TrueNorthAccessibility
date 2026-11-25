import { useMemo, useState } from 'react'
import { PRIORITIES } from '../data/commonIssues'
import { wcagLabel } from '../data/wcag'
import ComponentForm, { deleteComponentConfirm } from './ComponentForm'
import { downloadProjectWorkbook } from './exportExcel'
import { computeMetrics, UNSET } from './metrics'
import PageForm from './PageForm'
import ProjectForm from './ProjectForm'
import IssueSearchForm from './IssueSearchForm'
import ViewerAccess from './ViewerAccess'
import { hrefFor, navigate } from './router'
import {
  createComponent,
  createPage,
  deleteComponent,
  deleteProject,
  updateComponent,
  updateProject,
  useAuditData,
} from './store'
import { RESOLVED_STATUSES, type Component, type Project } from './types'
import Badge from './ui/Badge'
import MetricTable from './ui/MetricTable'
import { button, card, link, PRIORITY_BAR } from './ui/styles'
import { useConfirm } from './ui/ConfirmDialog'

type Props = { project: Project }

export default function ProjectView({ project }: Props) {
  const [confirm, confirmDialog] = useConfirm()
  const data = useAuditData()
  const { isOwner } = data
  const [editing, setEditing] = useState(false)
  const [addingPage, setAddingPage] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [status, setStatus] = useState('')
  const [includeHidden, setIncludeHidden] = useState(false)
  const [search, setSearch] = useState('')
  const [componentForm, setComponentForm] = useState<{ component?: Component } | null>(null)

  const pages = useMemo(() => data.pages.filter((p) => p.projectId === project.id), [data.pages, project.id])
  const issues = useMemo(
    () => data.issues.filter((i) => i.projectId === project.id),
    [data.issues, project.id],
  )
  const components = useMemo(
    () => data.components.filter((c) => c.projectId === project.id),
    [data.components, project.id],
  )
  const m = useMemo(() => computeMetrics(pages, issues), [pages, issues])
  const hiddenPages = pages.filter((p) => p.hidden)

  const exportXlsx = async () => {
    setExporting(true)
    setStatus('Preparing Excel export…')
    try {
      const exportPages = includeHidden ? pages : pages.filter((p) => !p.hidden)
      const ids = new Set(exportPages.map((p) => p.id))
      await downloadProjectWorkbook(
        project,
        exportPages,
        issues.filter((i) => ids.has(i.pageId)),
        components,
      )
      setStatus('Excel workbook downloaded.')
    } catch {
      setStatus('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete project?',
      message: `"${project.name}" and all of its pages, issues, screenshots and comments will be deleted.`,
      confirmLabel: 'Delete project',
      detail: 'This cannot be undone.',
    })
    if (!ok) return
    try {
      await deleteProject(project.id)
      navigate(hrefFor.projects())
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not delete the project.')
    }
  }

  const removeComponent = async (component: Component) => {
    const attached = issues.filter((i) => i.componentId === component.id).length
    if (!(await confirm(deleteComponentConfirm(component, attached)))) return
    try {
      await deleteComponent(component.id)
      setStatus(
        `Component "${component.name}" deleted.${attached ? ` ${attached === 1 ? '1 issue was' : `${attached} issues were`} detached.` : ''}`,
      )
      document.getElementById('components-heading')?.focus()
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not delete the component.')
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
          {isOwner && hiddenPages.length > 0 && (
            <label className="inline-flex items-center gap-2 self-center text-[0.8125rem]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-forest-btn"
                checked={includeHidden}
                onChange={(e) => setIncludeHidden(e.target.checked)}
              />
              Include hidden pages in export
            </label>
          )}
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

      <IssueSearchForm
        className="mt-6"
        projectName={project.name}
        value={search}
        onChange={setSearch}
        onSubmit={() => navigate(hrefFor.search(project.id, { q: search.trim() }))}
      />

      <section aria-labelledby="metrics-heading" className="mt-8">
        <h2 id="metrics-heading" className="m-0 mb-3 font-serif text-xl">
          Metrics
        </h2>
        {isOwner && hiddenPages.length > 0 && (
          <p className="m-0 -mt-1 mb-3 text-[0.8125rem] text-slate">
            Includes {hiddenPages.length} hidden page{hiddenPages.length === 1 ? '' : 's'} that clients can't
            see. Clients' metrics leave them out.
          </p>
        )}
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
              href: hrefFor.issues(project.id, 'severity', c.key),
              linkId: `severity:${c.key}`,
            }))}
          />
          <MetricTable
            title="By status"
            labelHeader="Status"
            total={m.total}
            rows={m.byStatus.map((c) => ({
              key: c.key,
              label: c.key,
              count: c.count,
              href: hrefFor.issues(project.id, 'status', c.key),
              linkId: `status:${c.key}`,
            }))}
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
                  {PRIORITIES.map((p) => (
                    <th key={p} scope="col" className="px-3 py-2 text-right font-semibold">
                      {p}
                    </th>
                  ))}
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
                      {page.hidden && (
                        <span className="ml-2">
                          <Badge kind="neutral" value="Hidden" />
                          <span className="sr-only"> from clients</span>
                        </span>
                      )}
                      {page.url && (
                        <span className="block break-all text-[0.75rem] text-slate">{page.url}</span>
                      )}
                    </th>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{total}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{open}</td>
                    {PRIORITIES.map((p) => (
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

      <section aria-labelledby="components-heading" className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="components-heading" tabIndex={-1} className="m-0 font-serif text-xl">
            Components
          </h2>
          {isOwner && (
            <button type="button" className={button('primary')} onClick={() => setComponentForm({})}>
              <span aria-hidden="true">+</span> Add component
            </button>
          )}
        </div>
        {components.length === 0 ? (
          <div className={`${card} p-8 text-center`}>
            <p className="mx-auto my-0 text-[0.875rem] text-slate">
              {isOwner
                ? 'No components yet. Add the shared parts of the site (header, footer, cart drawer…) and attach issues to them to see every issue in one component together.'
                : 'No components have been added to this project yet.'}
            </p>
          </div>
        ) : (
          <div className={`${card} overflow-x-auto`}>
            <table className="w-full border-collapse text-[0.8125rem]">
              <caption className="sr-only">Components in this project with attached issue counts</caption>
              <thead className="bg-cream text-left text-[0.6875rem] uppercase tracking-wide text-slate">
                <tr>
                  <th scope="col" className="px-4 py-2 font-semibold">
                    Component
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Issues
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Open
                  </th>
                  {isOwner && (
                    <th scope="col" className="px-4 py-2 text-right font-semibold">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {components.map((c) => {
                  const attached = issues.filter((i) => i.componentId === c.id)
                  const open = attached.filter((i) => !RESOLVED_STATUSES.includes(i.status)).length
                  return (
                    <tr key={c.id} className="border-t border-divider hover:bg-cream">
                      <th scope="row" className="px-4 py-2.5 text-left font-normal">
                        <a
                          href={hrefFor.component(project.id, c.id)}
                          data-component-link={c.id}
                          className={`font-semibold ${link}`}
                        >
                          {c.name}
                        </a>
                        {c.description && (
                          <span className="block max-w-xl text-[0.75rem] text-slate">{c.description}</span>
                        )}
                      </th>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{attached.length}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{open}</td>
                      {isOwner && (
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            className={button('ghost', 'px-2 py-1')}
                            onClick={() => setComponentForm({ component: c })}
                          >
                            Edit<span className="sr-only"> component {c.name}</span>
                          </button>
                          <button
                            type="button"
                            className={button('ghost', 'px-2 py-1 text-danger-text')}
                            onClick={() => void removeComponent(c)}
                          >
                            Delete<span className="sr-only"> component {c.name}</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
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
      {componentForm && (
        <ComponentForm
          component={componentForm.component}
          onClose={() => setComponentForm(null)}
          onSubmit={async (input, images, pending) => {
            const existing = componentForm.component
            if (existing) await updateComponent(existing.id, input, images, pending)
            else await createComponent(project.id, input, images, pending)
            setComponentForm(null)
            setStatus(`Component "${input.name}" ${existing ? 'saved' : 'added'}.`)
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
      {confirmDialog}
    </>
  )
}
