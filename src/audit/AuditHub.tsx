import { useEffect, useRef } from 'react'
import Logo from '../components/Logo'
import ThemeToggle, { type Theme } from '../components/ThemeToggle'
import PageView from './PageView'
import ProjectsView from './ProjectsView'
import ProjectView from './ProjectView'
import { HUB_PATH, hrefFor, parseRoute, useHash } from './router'
import { useAuditData } from './store'
import { link } from './ui/styles'

type Props = { theme: Theme; onToggleTheme: () => void }

function setHeadTag(selector: string, tag: 'meta' | 'link', attrs: Record<string, string>) {
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement(tag)
    document.head.appendChild(el)
  }
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value)
}

export default function AuditHub({ theme, onToggleTheme }: Props) {
  const hash = useHash()
  const route = parseRoute(hash)
  const data = useAuditData()
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)

  const project = route.view !== 'projects' ? data.projects.find((p) => p.id === route.projectId) : undefined
  const page =
    route.view === 'page'
      ? data.pages.find((p) => p.id === route.pageId && p.projectId === route.projectId)
      : undefined
  const missing = (route.view !== 'projects' && !project) || (route.view === 'page' && !page)

  const title = missing ? 'Not found' : (page?.name ?? project?.name ?? 'Audit projects')

  useEffect(() => {
    document.title = `${title} | Audit Hub | True North Accessibility`
  }, [title])

  useEffect(() => {
    setHeadTag('meta[name="robots"]', 'meta', { name: 'robots', content: 'noindex, nofollow' })
    setHeadTag('link[rel="canonical"]', 'link', {
      rel: 'canonical',
      href: `https://truenorth-accessibility.com${HUB_PATH}`,
    })
  }, [])

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    mainRef.current?.querySelector<HTMLElement>('h1')?.focus()
    window.scrollTo({ top: 0 })
  }, [hash])

  const crumbs: { label: string; href: string }[] = [{ label: 'Projects', href: hrefFor.projects() }]
  if (project) crumbs.push({ label: project.name, href: hrefFor.project(project.id) })
  if (project && page) crumbs.push({ label: page.name, href: hrefFor.page(project.id, page.id) })

  return (
    <div className="min-h-screen bg-cream font-sans text-ink">
      <a
        href="#hub-main"
        onClick={(e) => {
          e.preventDefault()
          mainRef.current?.focus()
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-forest-btn focus:text-white focus:rounded"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-30 border-b border-divider bg-cream">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-3">
          <div className="flex items-center gap-4">
            <a href="/" className="rounded">
              <Logo compact dark={theme === 'dark'} />
              <span className="sr-only">TrueNorth Accessibility, Home</span>
            </a>
            <p className="m-0 border-l border-divider pl-4 font-serif text-xl leading-tight">
              <a href={hrefFor.projects()} className="text-ink hover:text-forest rounded">
                Audit Hub
              </a>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <a href="/" className="text-sm font-medium text-slate hover:text-ink rounded">
              Back to site
            </a>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>
        </div>
        {crumbs.length > 1 && (
          <nav aria-label="Breadcrumb" className="mx-auto max-w-7xl px-6 pb-2">
            <ol className="m-0 flex list-none flex-wrap items-center gap-1 p-0 text-[0.8125rem]">
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1
                return (
                  <li key={i} className="flex items-center gap-1">
                    {i > 0 && (
                      <span aria-hidden="true" className="text-slate">
                        /
                      </span>
                    )}
                    {last ? (
                      <a href={c.href} aria-current="page" className="rounded font-semibold text-ink">
                        {c.label}
                      </a>
                    ) : (
                      <a href={c.href} className={`rounded ${link}`}>
                        {c.label}
                      </a>
                    )}
                  </li>
                )
              })}
            </ol>
          </nav>
        )}
      </header>

      <main id="hub-main" ref={mainRef} tabIndex={-1} className="mx-auto max-w-7xl px-6 py-8 outline-none">
        {missing ? (
          <div>
            <h1 tabIndex={-1} className="m-0 font-serif text-3xl">
              Not found
            </h1>
            <p className="mt-2">
              That project or page does not exist in this browser.{' '}
              <a href={hrefFor.projects()} className={link}>
                Return to all projects
              </a>
              .
            </p>
          </div>
        ) : route.view === 'page' && project && page ? (
          <PageView key={page.id} project={project} page={page} />
        ) : route.view === 'project' && project ? (
          <ProjectView key={project.id} project={project} />
        ) : (
          <ProjectsView />
        )}
      </main>
    </div>
  )
}
