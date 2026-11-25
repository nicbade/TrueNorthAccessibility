import { useMemo, useRef, useState } from 'react'
import ComponentForm, { deleteComponentConfirm } from './ComponentForm'
import { ImageGallery } from './IssueImageGallery'
import IssueGroups, { groupByPage, plural } from './IssueGroups'
import { hrefFor, navigate } from './router'
import { deleteComponent, updateComponent, updateComponentImages, useAuditData } from './store'
import { RESOLVED_STATUSES, type Component, type Project } from './types'
import { useConfirm } from './ui/ConfirmDialog'
import { button, card, link } from './ui/styles'

type Props = { project: Project; component: Component }

/** Every issue attached to a component, across all pages. Viewers never load issues on hidden pages. */
export default function ComponentView({ project, component }: Props) {
  const data = useAuditData()
  const { isOwner } = data
  const [confirm, confirmDialog] = useConfirm()
  const [editing, setEditing] = useState<'all' | 'screenshots' | null>(null)
  const [status, setStatus] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)

  const pages = useMemo(() => data.pages.filter((p) => p.projectId === project.id), [data.pages, project.id])
  const attached = useMemo(
    () => data.issues.filter((i) => i.projectId === project.id && i.componentId === component.id),
    [data.issues, project.id, component.id],
  )
  const groups = useMemo(() => groupByPage(pages, attached), [pages, attached])
  const open = attached.filter((i) => !RESOLVED_STATUSES.includes(i.status)).length
  const hiddenCount = groups.filter((g) => g.page.hidden).reduce((n, g) => n + g.issues.length, 0)
  const dashboard = hrefFor.project(project.id)

  const remove = async () => {
    if (!(await confirm(deleteComponentConfirm(component, attached.length)))) return
    try {
      await deleteComponent(component.id, () => navigate(dashboard))
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not delete the component.')
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="m-0 text-[0.875rem] font-semibold text-slate">Component · {project.name}</p>
          <h1 ref={headingRef} tabIndex={-1} className="m-0 mt-1 font-serif text-3xl">
            {component.name}
          </h1>
          {component.description && (
            <p className="m-0 mt-2 max-w-3xl whitespace-pre-line text-[0.9375rem]">{component.description}</p>
          )}
        </div>
        {isOwner && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button('secondary')} onClick={() => setEditing('all')}>
              Edit component
            </button>
            <button type="button" className={button('danger')} onClick={() => void remove()}>
              Delete component
            </button>
          </div>
        )}
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {status}
      </div>

      <p className="m-0 mt-3 text-[0.9375rem]">
        {attached.length === 0
          ? 'No attached issues.'
          : `${plural(attached.length, 'attached issue')} on ${plural(groups.length, 'page')}, ${open} open.`}{' '}
        <a href={dashboard} className={link}>
          Back to the project dashboard
        </a>
      </p>
      {isOwner && hiddenCount > 0 && (
        <p className="m-0 mt-2 text-[0.8125rem] text-slate">
          Includes {plural(hiddenCount, 'issue')} on hidden pages that clients can't see.
        </p>
      )}

      <section aria-labelledby="component-shots-heading" className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-divider pb-2">
          <h2 id="component-shots-heading" className="m-0 font-serif text-xl">
            Screenshots{' '}
            <span className="font-sans text-[0.875rem] text-slate">({component.images.length})</span>
          </h2>
          {isOwner && (
            <button type="button" className={button('secondary')} onClick={() => setEditing('screenshots')}>
              {component.images.length ? (
                'Add or edit screenshots'
              ) : (
                <>
                  <span aria-hidden="true">+</span> Add screenshots
                </>
              )}
            </button>
          )}
        </div>
        {component.images.length ? (
          <ImageGallery
            images={component.images}
            label={component.name}
            missingAlt="None yet."
            large
            className="md:grid-cols-2"
          />
        ) : (
          <p className="m-0 text-[0.875rem] text-slate">
            {isOwner
              ? 'No screenshots yet. Add screenshots so clients can see which part of the site this is.'
              : 'No screenshots of this component yet.'}
          </p>
        )}
      </section>

      {attached.length === 0 && (
        <div className={`${card} mt-6 p-8 text-center`}>
          <p className="m-0 text-[0.9375rem]">No issues are attached to this component yet.</p>
          {isOwner && (
            <p className="m-0 mt-2 text-[0.875rem] text-slate">
              To attach an issue, choose "{component.name}" in the Component field when you add or edit it.
            </p>
          )}
        </div>
      )}
      <IssueGroups project={project} issues={attached} headingRef={headingRef} listName="this component" />

      {editing && (
        <ComponentForm
          component={component}
          mode={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (input, images, pending) => {
            if (editing === 'screenshots') await updateComponentImages(component.id, images, pending)
            else await updateComponent(component.id, input, images, pending)
            setEditing(null)
            setStatus(editing === 'screenshots' ? 'Screenshots saved.' : 'Component saved.')
          }}
        />
      )}
      {confirmDialog}
    </>
  )
}
