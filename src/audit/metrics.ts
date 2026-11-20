import { CATEGORIES, PRIORITIES } from '../data/commonIssues'
import { compareWcag } from '../data/wcag'
import { RESOLVED_STATUSES, STATUSES, type AuditPage, type Issue } from './types'

export type Count = { key: string; count: number }

export type PageMetrics = {
  page: AuditPage
  total: number
  open: number
  byPriority: Record<string, number>
}

export type ProjectMetrics = {
  total: number
  open: number
  resolved: number
  highImpact: number
  byPriority: Count[]
  byStatus: Count[]
  byWcag: Count[]
  byCategory: Count[]
  byPage: PageMetrics[]
}

export const UNSET = 'Not set'

function tally(values: string[], order: string[] = []): Count[] {
  const map = new Map<string, number>(order.map((k) => [k, 0]))
  values.forEach((v) => map.set(v, (map.get(v) ?? 0) + 1))
  return Array.from(map, ([key, count]) => ({ key, count }))
}

export function isOpen(issue: Issue) {
  return !RESOLVED_STATUSES.includes(issue.status)
}

export function computeMetrics(pages: AuditPage[], issues: Issue[]): ProjectMetrics {
  const byPriority = tally(
    issues.map((i) => i.priority || UNSET),
    PRIORITIES,
  ).filter((c) => c.key !== UNSET || c.count > 0)
  const byStatus = tally(
    issues.map((i) => i.status),
    STATUSES,
  )
  const byWcag = tally(issues.flatMap((i) => (i.wcag.length ? i.wcag : [UNSET]))).sort((a, b) =>
    a.key === UNSET ? 1 : b.key === UNSET ? -1 : compareWcag(a.key, b.key),
  )
  const byCategory = tally(issues.map((i) => i.category || UNSET)).sort(
    (a, b) => b.count - a.count || CATEGORIES.indexOf(a.key) - CATEGORIES.indexOf(b.key),
  )
  const byPage = pages.map((page) => {
    const pageIssues = issues.filter((i) => i.pageId === page.id)
    const counts: Record<string, number> = {}
    PRIORITIES.forEach((p) => (counts[p] = 0))
    pageIssues.forEach((i) => (counts[i.priority || UNSET] = (counts[i.priority || UNSET] ?? 0) + 1))
    return { page, total: pageIssues.length, open: pageIssues.filter(isOpen).length, byPriority: counts }
  })
  const open = issues.filter(isOpen).length
  return {
    total: issues.length,
    open,
    resolved: issues.length - open,
    highImpact: issues.filter((i) => isOpen(i) && (i.priority === 'Blocker' || i.priority === 'Critical'))
      .length,
    byPriority,
    byStatus,
    byWcag,
    byCategory,
    byPage,
  }
}
