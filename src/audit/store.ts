import { useSyncExternalStore } from 'react'
import { deleteIssueImages, deleteScreenshot } from './screenshots'
import type { AuditData, AuditPage, Issue, IssueDraft, Project } from './types'

const STORAGE_KEY = 'truenorth-audit-hub:v1'

const EMPTY: AuditData = { version: 1, projects: [], pages: [], issues: [] }

function load(): AuditData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as AuditData
    return {
      version: 1,
      projects: parsed.projects ?? [],
      pages: parsed.pages ?? [],
      issues: (parsed.issues ?? []).map((i) => ({ ...i, images: i.images ?? [] })),
    }
  } catch {
    return EMPTY
  }
}

let state: AuditData = load()
const listeners = new Set<() => void>()

export class StorageError extends Error {}

function commit(next: AuditData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    throw new StorageError('Could not save to this browser. Storage may be full or disabled.')
  }
  state = next
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      state = load()
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function useAuditData(): AuditData {
  return useSyncExternalStore(subscribe, () => state)
}

function dropImagesOf(issues: Issue[]) {
  const ids = issues.flatMap((i) => i.images.map((img) => img.id))
  void deleteIssueImages(ids).catch(() => undefined)
}

const now = () => new Date().toISOString()
const uid = () => crypto.randomUUID()

export type ProjectInput = Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
export type PageInput = Pick<AuditPage, 'name' | 'url' | 'notes'>

export function createProject(input: ProjectInput): Project {
  const project: Project = { ...input, id: uid(), createdAt: now(), updatedAt: now() }
  commit({ ...state, projects: [...state.projects, project] })
  return project
}

export function updateProject(id: string, input: ProjectInput) {
  commit({
    ...state,
    projects: state.projects.map((p) => (p.id === id ? { ...p, ...input, updatedAt: now() } : p)),
  })
}

export function deleteProject(id: string) {
  const pageIds = state.pages.filter((p) => p.projectId === id).map((p) => p.id)
  const removed = state.issues.filter((i) => i.projectId === id)
  commit({
    ...state,
    projects: state.projects.filter((p) => p.id !== id),
    pages: state.pages.filter((p) => p.projectId !== id),
    issues: state.issues.filter((i) => i.projectId !== id),
  })
  pageIds.forEach((pid) => void deleteScreenshot(pid).catch(() => undefined))
  dropImagesOf(removed)
}

export function createPage(projectId: string, input: PageInput): AuditPage {
  const page: AuditPage = {
    ...input,
    id: uid(),
    projectId,
    screenshot: null,
    createdAt: now(),
    updatedAt: now(),
  }
  commit({ ...state, pages: [...state.pages, page] })
  return page
}

export function updatePage(id: string, input: Partial<Omit<AuditPage, 'id' | 'projectId'>>) {
  commit({
    ...state,
    pages: state.pages.map((p) => (p.id === id ? { ...p, ...input, updatedAt: now() } : p)),
  })
}

export function deletePage(id: string) {
  const removed = state.issues.filter((i) => i.pageId === id)
  commit({
    ...state,
    pages: state.pages.filter((p) => p.id !== id),
    issues: state.issues.filter((i) => i.pageId !== id),
  })
  void deleteScreenshot(id).catch(() => undefined)
  dropImagesOf(removed)
}

export function saveIssue(page: AuditPage, draft: IssueDraft, existingId?: string): Issue {
  if (existingId) {
    let saved!: Issue
    commit({
      ...state,
      issues: state.issues.map((i) => {
        if (i.id !== existingId) return i
        saved = { ...i, ...draft, updatedAt: now() }
        return saved
      }),
    })
    return saved
  }
  const number =
    state.issues.filter((i) => i.projectId === page.projectId).reduce((m, i) => Math.max(m, i.number), 0) + 1
  const issue: Issue = {
    ...draft,
    id: uid(),
    projectId: page.projectId,
    pageId: page.id,
    number,
    createdAt: now(),
    updatedAt: now(),
  }
  commit({ ...state, issues: [...state.issues, issue] })
  return issue
}

export function updateIssueStatus(id: string, status: Issue['status']) {
  commit({
    ...state,
    issues: state.issues.map((i) => (i.id === id ? { ...i, status, updatedAt: now() } : i)),
  })
}

export function deleteIssue(id: string) {
  const removed = state.issues.filter((i) => i.id === id)
  commit({ ...state, issues: state.issues.filter((i) => i.id !== id) })
  dropImagesOf(removed)
}
