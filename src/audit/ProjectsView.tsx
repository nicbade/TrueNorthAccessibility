import { useState } from 'react'
import ImportBanner from './ImportBanner'
import ProjectForm from './ProjectForm'
import { isOpen } from './metrics'
import { hrefFor, navigate } from './router'
import { createProject, useAuditData } from './store'
import { button, card } from './ui/styles'

export default function ProjectsView() {
  const data = useAuditData()
  const [creating, setCreating] = useState(false)
  const projects = [...data.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 tabIndex={-1} className="m-0 font-serif text-3xl">
            Audit projects
          </h1>
          <p className="m-0 mt-1 text-[0.875rem] text-slate">
            {projects.length} project{projects.length === 1 ? '' : 's'}
            {data.isOwner ? '' : ' shared with you · view only'}
          </p>
        </div>
        {data.isOwner && (
          <button type="button" className={button('primary')} onClick={() => setCreating(true)}>
            <span aria-hidden="true">+</span> New project
          </button>
        )}
      </div>

      <ImportBanner />

      {projects.length === 0 && !data.isOwner ? (
        <div className={`${card} mt-8 p-10 text-center`}>
          <h2 className="m-0 font-serif text-xl">No projects shared with you yet</h2>
          <p className="mx-auto mt-2 text-[0.875rem] text-slate">
            When the audit owner invites this email address to a project, it will appear here.
          </p>
        </div>
      ) : projects.length === 0 ? (
        <div className={`${card} mt-8 p-10 text-center`}>
          <h2 className="m-0 font-serif text-xl">No audit projects yet</h2>
          <p className="mx-auto mt-2 text-[0.875rem] text-slate">
            Create a project for each site or app you audit, then add pages, screenshots and issues.
          </p>
          <button type="button" className={button('primary', 'mt-2')} onClick={() => setCreating(true)}>
            Create your first project
          </button>
        </div>
      ) : (
        <ul className="m-0 mt-6 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const issues = data.issues.filter((i) => i.projectId === p.id)
            const pages = data.pages.filter((pg) => pg.projectId === p.id).length
            const open = issues.filter(isOpen)
            const high = open.filter((i) => i.priority === 'Blocker' || i.priority === 'Critical').length
            return (
              <li
                key={p.id}
                className={`${card} relative flex flex-col p-5 transition-colors hover:border-forest`}
              >
                <h2 className="m-0 font-serif text-lg">
                  <a
                    href={hrefFor.project(p.id)}
                    className="rounded text-ink underline-offset-4 after:absolute after:inset-0 after:rounded-lg hover:text-forest hover:underline"
                  >
                    {p.name}
                  </a>
                </h2>
                <p className="m-0 mt-0.5 text-[0.8125rem] text-slate">
                  {[p.client, p.platform, p.standard].filter(Boolean).join(' · ')}
                </p>
                <dl className="m-0 mt-4 grid grid-cols-3 gap-2 text-center">
                  {[
                    ['Pages', pages],
                    ['Open issues', open.length],
                    ['Blocker + Critical', high],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-cream px-2 py-2">
                      <dt className="text-[0.6875rem] leading-4 text-slate">{k}</dt>
                      <dd className="m-0 text-xl font-semibold tabular-nums text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            )
          })}
        </ul>
      )}

      {creating && (
        <ProjectForm
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            const p = await createProject(input)
            setCreating(false)
            navigate(hrefFor.project(p.id))
          }}
        />
      )}
    </>
  )
}
