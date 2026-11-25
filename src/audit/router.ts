import { useSyncExternalStore } from 'react'

// One static entry path keeps GitHub Pages returning HTTP 200; views live in the hash.
export const HUB_PATH = '/audit-hub'

export type HubRoute =
  | { view: 'projects' }
  | { view: 'project'; projectId: string }
  | { view: 'page'; projectId: string; pageId: string }
  | { view: 'issue'; projectId: string; pageId: string; issueId: string }
  | { view: 'issues'; projectId: string; filter: IssueFilter; value: string }
  | ({ view: 'search'; projectId: string } & SearchParams)

/** Project-wide issue lists linked from the dashboard's "By severity" and "By status" tables. */
export type IssueFilter = 'severity' | 'status'

export type SearchParams = { q: string; severity: string; status: string }

// Fired by replaceRoute: history.replaceState doesn't fire hashchange.
const REPLACE_EVENT = 'hub:replace-route'

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  window.addEventListener(REPLACE_EVENT, cb)
  return () => {
    window.removeEventListener('hashchange', cb)
    window.removeEventListener(REPLACE_EVENT, cb)
  }
}

export function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash)
}

export function isHubPath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '')
  return normalized === HUB_PATH
}

export function parseRoute(hash: string): HubRoute {
  const raw = hash.replace(/^#\/?/, '')
  const queryAt = raw.indexOf('?')
  const path = queryAt === -1 ? raw : raw.slice(0, queryAt)
  const query = new URLSearchParams(queryAt === -1 ? '' : raw.slice(queryAt + 1))
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
  if (parts[0] === 'projects' && parts[1]) {
    if (parts[2] === 'pages' && parts[3]) {
      if (parts[4] === 'issues' && parts[5]) {
        return { view: 'issue', projectId: parts[1], pageId: parts[3], issueId: parts[5] }
      }
      return { view: 'page', projectId: parts[1], pageId: parts[3] }
    }
    if ((parts[2] === 'severity' || parts[2] === 'status') && parts[3]) {
      return { view: 'issues', projectId: parts[1], filter: parts[2], value: parts[3] }
    }
    if (parts[2] === 'search') {
      return {
        view: 'search',
        projectId: parts[1],
        q: query.get('q') ?? '',
        severity: query.get('severity') ?? '',
        status: query.get('status') ?? '',
      }
    }
    return { view: 'project', projectId: parts[1] }
  }
  return { view: 'projects' }
}

export const hrefFor = {
  projects: () => `${HUB_PATH}#/`,
  project: (projectId: string) => `${HUB_PATH}#/projects/${encodeURIComponent(projectId)}`,
  page: (projectId: string, pageId: string) =>
    `${HUB_PATH}#/projects/${encodeURIComponent(projectId)}/pages/${encodeURIComponent(pageId)}`,
  issues: (projectId: string, filter: IssueFilter, value: string) =>
    `${hrefFor.project(projectId)}/${filter}/${encodeURIComponent(value)}`,
  search: (projectId: string, params: Partial<SearchParams> = {}) => {
    const query = new URLSearchParams()
    for (const key of ['q', 'severity', 'status'] as const) if (params[key]) query.set(key, params[key])
    const qs = query.toString()
    return `${hrefFor.project(projectId)}/search${qs ? `?${qs}` : ''}`
  },
  issue: (projectId: string, pageId: string, issueId: string) =>
    `${hrefFor.page(projectId, pageId)}/issues/${encodeURIComponent(issueId)}`,
}

export function navigate(href: string) {
  window.location.hash = href.slice(href.indexOf('#'))
}

/** Updates the address without a new history entry (e.g. while typing a search). */
export function replaceRoute(href: string) {
  history.replaceState(history.state, '', href.slice(href.indexOf('#')))
  window.dispatchEvent(new Event(REPLACE_EVENT))
}
