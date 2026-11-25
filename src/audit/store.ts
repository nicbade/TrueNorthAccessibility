import { useSyncExternalStore } from 'react'
import {
  authRedirectUrl,
  copyObject,
  db,
  extensionFor,
  removeObjects,
  supabase,
  uploadObject,
} from './supabase'
import type {
  AuditData,
  AuditPage,
  Comment,
  Issue,
  IssueDraft,
  IssueImage,
  Project,
  ProjectViewer,
} from './types'

export type HubState = AuditData & {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string
  isOwner: boolean
  userId: string | null
}

const EMPTY: HubState = {
  status: 'idle',
  error: '',
  isOwner: false,
  userId: null,
  projects: [],
  pages: [],
  issues: [],
  viewers: [],
  comments: [],
}

let state: HubState = EMPTY
const listeners = new Set<() => void>()

function commit(patch: Partial<HubState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function useAuditData(): HubState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}

export class SaveError extends Error {}

function check<T>(result: { data: T; error: { message: string } | null }, action: string): T {
  if (result.error) throw new SaveError(`Could not ${action}: ${result.error.message}`)
  return result.data
}

// ─── Row mapping ───────────────────────────────────────────────────────────

type Row = Record<string, any>

const toProject = (r: Row): Project => ({
  id: r.id,
  name: r.name,
  client: r.client,
  url: r.url,
  platform: r.platform,
  standard: r.standard,
  auditor: r.auditor,
  startDate: r.start_date,
  notes: r.notes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

const fromProject = (p: ProjectInput) => ({
  name: p.name,
  client: p.client,
  url: p.url,
  platform: p.platform,
  standard: p.standard,
  auditor: p.auditor,
  start_date: p.startDate,
  notes: p.notes,
})

const toPage = (r: Row): AuditPage => ({
  id: r.id,
  projectId: r.project_id,
  name: r.name,
  url: r.url,
  notes: r.notes,
  hidden: Boolean(r.hidden),
  screenshot: r.screenshot ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

const toImage = (r: Row): IssueImage => ({
  id: r.id,
  path: r.storage_path,
  name: r.name,
  type: r.type,
  size: Number(r.size),
  width: r.width,
  height: r.height,
  alt: r.alt,
  createdAt: r.created_at,
})

const toIssue = (r: Row, images: IssueImage[]): Issue => ({
  id: r.id,
  projectId: r.project_id,
  pageId: r.page_id,
  number: r.number,
  description: r.description,
  expectedBehavior: r.expected_behavior,
  fix: r.fix,
  priority: r.priority,
  examples: r.examples ?? [],
  wcag: r.wcag ?? [],
  category: r.category,
  comments: r.comments,
  status: r.status,
  location: r.location,
  commonIssueId: r.common_issue_id,
  images,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const fromIssueDraft = (d: Omit<IssueDraft, 'images'>) => ({
  description: d.description,
  expected_behavior: d.expectedBehavior,
  fix: d.fix,
  priority: d.priority,
  examples: d.examples,
  wcag: d.wcag,
  category: d.category,
  comments: d.comments,
  status: d.status,
  location: d.location,
  common_issue_id: d.commonIssueId,
})

const toComment = (r: Row): Comment => ({
  id: r.id,
  projectId: r.project_id,
  pageId: r.page_id,
  issueId: r.issue_id,
  authorId: r.author_id,
  authorEmail: r.author_email,
  body: r.body,
  createdAt: r.created_at,
})

const toViewer = (r: Row): ProjectViewer => ({
  projectId: r.project_id,
  email: r.email,
  createdAt: r.created_at,
})

// ─── Loading ───────────────────────────────────────────────────────────────

export async function loadHubData(userId: string) {
  // A reload for the same user keeps the current data on screen so views don't remount mid-task.
  if (state.userId !== userId || state.status !== 'ready') commit({ ...EMPTY, status: 'loading', userId })
  try {
    const client = db()
    const [owners, projects, pages, issues, images, viewers, comments] = await Promise.all([
      client.from('app_owners').select('user_id').eq('user_id', userId),
      client.from('projects').select('*').order('updated_at', { ascending: false }),
      client.from('pages').select('*').order('created_at'),
      client.from('issues').select('*').order('number'),
      client.from('issue_images').select('*').order('position'),
      client.from('project_viewers').select('*').order('created_at'),
      client.from('comments').select('*').order('created_at'),
    ])
    const imageRows = check(images, 'load issue images') ?? []
    const byIssue = new Map<string, IssueImage[]>()
    imageRows.forEach((r: Row) => byIssue.set(r.issue_id, [...(byIssue.get(r.issue_id) ?? []), toImage(r)]))
    commit({
      status: 'ready',
      isOwner: (check(owners, 'check your access') ?? []).length > 0,
      projects: (check(projects, 'load projects') ?? []).map(toProject),
      pages: (check(pages, 'load pages') ?? []).map(toPage),
      issues: (check(issues, 'load issues') ?? []).map((r: Row) => toIssue(r, byIssue.get(r.id) ?? [])),
      viewers: (check(viewers, 'load viewers') ?? []).map(toViewer),
      comments: (check(comments, 'load comments') ?? []).map(toComment),
    })
  } catch (e) {
    commit({ status: 'error', error: e instanceof Error ? e.message : 'Could not load audit data.' })
  }
}

export function resetHubData() {
  commit(EMPTY)
}

// ─── Projects ──────────────────────────────────────────────────────────────

export type ProjectInput = Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
export type PageInput = Pick<AuditPage, 'name' | 'url' | 'notes'>

export async function createProject(input: ProjectInput): Promise<Project> {
  const row = check(
    await db().from('projects').insert(fromProject(input)).select().single(),
    'create the project',
  )
  const project = toProject(row)
  commit({ projects: [project, ...state.projects] })
  return project
}

export async function updateProject(id: string, input: ProjectInput) {
  const row = check(
    await db().from('projects').update(fromProject(input)).eq('id', id).select().single(),
    'save the project',
  )
  commit({ projects: state.projects.map((p) => (p.id === id ? toProject(row) : p)) })
}

export async function deleteProject(id: string) {
  const paths = [
    ...state.pages.filter((p) => p.projectId === id).map((p) => p.screenshot?.path ?? ''),
    ...state.issues.filter((i) => i.projectId === id).flatMap((i) => i.images.map((img) => img.path)),
  ]
  check(await db().from('projects').delete().eq('id', id), 'delete the project')
  commit({
    projects: state.projects.filter((p) => p.id !== id),
    pages: state.pages.filter((p) => p.projectId !== id),
    issues: state.issues.filter((i) => i.projectId !== id),
    viewers: state.viewers.filter((v) => v.projectId !== id),
    comments: state.comments.filter((c) => c.projectId !== id),
  })
  await removeObjects(paths).catch(() => undefined)
}

// ─── Viewers ───────────────────────────────────────────────────────────────

async function manageViewer<T>(body: Record<string, unknown>, action: string): Promise<T> {
  const { data, error } = await supabase!.functions.invoke('manage-viewer', { body })
  if (error) {
    const detail = await (error.context as Response | undefined)?.json?.().catch(() => null)
    throw new SaveError(`Could not ${action}: ${detail?.error ?? error.message}`)
  }
  return data as T
}

/** Grants access through the manage-viewer function, which also creates the viewer's account. */
export async function addViewer(projectId: string, email: string, sendLink: boolean) {
  const result = await manageViewer<{ viewer: Row; created: boolean; emailed: boolean }>(
    { action: 'invite', projectId, email: email.trim(), sendLink, redirectTo: authRedirectUrl() },
    'add the viewer',
  )
  const viewer: ProjectViewer = toViewer(result.viewer)
  commit({
    viewers: [
      ...state.viewers.filter((v) => !(v.projectId === projectId && v.email === viewer.email)),
      viewer,
    ],
  })
  return { viewer, created: result.created, emailed: result.emailed }
}

/** Deletes the person's account. Only allowed once they view no projects. */
export async function revokeAccount(email: string) {
  return manageViewer<{ deleted: boolean }>({ action: 'revoke', email }, 'revoke their sign-in')
}

export async function removeViewer(projectId: string, email: string) {
  check(
    await db().from('project_viewers').delete().eq('project_id', projectId).eq('email', email),
    'remove the viewer',
  )
  commit({ viewers: state.viewers.filter((v) => !(v.projectId === projectId && v.email === email)) })
}

// ─── Pages ─────────────────────────────────────────────────────────────────

export async function createPage(projectId: string, input: PageInput): Promise<AuditPage> {
  const row = check(
    await db()
      .from('pages')
      .insert({ project_id: projectId, ...input })
      .select()
      .single(),
    'add the page',
  )
  const page = toPage(row)
  commit({ pages: [...state.pages, page] })
  return page
}

export async function updatePage(
  id: string,
  input: Partial<PageInput & Pick<AuditPage, 'screenshot' | 'hidden'>>,
) {
  const row = check(await db().from('pages').update(input).eq('id', id).select().single(), 'save the page')
  commit({ pages: state.pages.map((p) => (p.id === id ? toPage(row) : p)) })
}

export async function setPageScreenshot(
  page: AuditPage,
  file: File,
  size: { width: number; height: number },
) {
  const path = `${page.projectId}/pages/${page.id}/${crypto.randomUUID()}.${extensionFor(file.type)}`
  await uploadObject(path, file, file.type)
  const previous = page.screenshot?.path
  await updatePage(page.id, {
    screenshot: {
      path,
      name: file.name,
      type: file.type,
      size: file.size,
      ...size,
      updatedAt: new Date().toISOString(),
    },
  })
  if (previous) await removeObjects([previous]).catch(() => undefined)
}

export async function removePageScreenshot(page: AuditPage) {
  const previous = page.screenshot?.path
  await updatePage(page.id, { screenshot: null })
  if (previous) await removeObjects([previous]).catch(() => undefined)
}

export async function deletePage(id: string) {
  const page = state.pages.find((p) => p.id === id)
  const paths = [
    page?.screenshot?.path ?? '',
    ...state.issues.filter((i) => i.pageId === id).flatMap((i) => i.images.map((img) => img.path)),
  ]
  check(await db().from('pages').delete().eq('id', id), 'delete the page')
  commit({
    pages: state.pages.filter((p) => p.id !== id),
    issues: state.issues.filter((i) => i.pageId !== id),
    comments: state.comments.filter((c) => c.pageId !== id),
  })
  await removeObjects(paths).catch(() => undefined)
}

// ─── Issues ────────────────────────────────────────────────────────────────

const nextIssueNumber = (projectId: string) =>
  state.issues.filter((i) => i.projectId === projectId).reduce((m, i) => Math.max(m, i.number), 0) + 1

/** Saves the issue, uploads new images (blobs keyed by image id) and removes dropped ones. */
export async function saveIssue(
  page: AuditPage,
  draft: IssueDraft,
  pending: Map<string, Blob>,
  existingId?: string,
): Promise<Issue> {
  const client = db()
  const { images, ...fields } = draft
  const existing = existingId ? state.issues.find((i) => i.id === existingId) : undefined
  const issueId = existing?.id ?? crypto.randomUUID()

  let row: Row | null
  if (existing) {
    row = check<Row | null>(
      await client.from('issues').update(fromIssueDraft(fields)).eq('id', issueId).select().single(),
      'save the issue',
    )
  } else {
    const number = nextIssueNumber(page.projectId)
    row = check<Row | null>(
      await client
        .from('issues')
        .insert({
          id: issueId,
          project_id: page.projectId,
          page_id: page.id,
          number,
          ...fromIssueDraft(fields),
        })
        .select()
        .single(),
      'add the issue',
    )
  }

  const saved: IssueImage[] = []
  for (const img of images) {
    const blob = pending.get(img.id)
    const path = img.path || `${page.projectId}/issues/${issueId}/${img.id}.${extensionFor(img.type)}`
    if (blob) await uploadObject(path, blob, img.type)
    saved.push({ ...img, path })
  }
  const keep = new Set(saved.map((img) => img.id))
  const dropped = (existing?.images ?? []).filter((img) => !keep.has(img.id))
  if (dropped.length) {
    check(
      await client
        .from('issue_images')
        .delete()
        .in(
          'id',
          dropped.map((img) => img.id),
        ),
      'remove screenshots',
    )
  }
  if (saved.length) {
    check(
      await client.from('issue_images').upsert(
        saved.map((img, position) => ({
          id: img.id,
          issue_id: issueId,
          project_id: page.projectId,
          position,
          storage_path: img.path,
          name: img.name,
          type: img.type,
          size: img.size,
          width: img.width,
          height: img.height,
          alt: img.alt,
        })),
      ),
      'save screenshots',
    )
  }
  await removeObjects(dropped.map((img) => img.path)).catch(() => undefined)

  const issue = toIssue(row!, saved)
  commit({
    issues: existing ? state.issues.map((i) => (i.id === issueId ? issue : i)) : [...state.issues, issue],
  })
  return issue
}

export async function updateIssueStatus(id: string, status: Issue['status']) {
  const row = check(
    await db().from('issues').update({ status }).eq('id', id).select().single(),
    'update the status',
  )
  commit({
    issues: state.issues.map((i) =>
      i.id === id ? { ...i, status: row.status, updatedAt: row.updated_at } : i,
    ),
  })
}

/** `beforeRemove` runs after the delete succeeds, before the issue leaves the store (e.g. to leave its view). */
export async function deleteIssue(id: string, beforeRemove?: () => void) {
  const issue = state.issues.find((i) => i.id === id)
  check(await db().from('issues').delete().eq('id', id), 'delete the issue')
  beforeRemove?.()
  commit({
    issues: state.issues.filter((i) => i.id !== id),
    comments: state.comments.filter((c) => c.issueId !== id),
  })
  await removeObjects(issue?.images.map((img) => img.path) ?? []).catch(() => undefined)
}

/**
 * Moves an issue to another page of the same project. It keeps its number, screenshots and comments.
 * `beforeMove` runs once the database has moved it, before the store changes (e.g. to follow it to its new page).
 */
export async function moveIssueToPage(
  issue: Issue,
  page: AuditPage,
  beforeMove?: (moved: Issue) => void,
): Promise<Issue> {
  const row = check<Row | null>(
    await db().from('issues').update({ page_id: page.id }).eq('id', issue.id).select().single(),
    'move the issue',
  )
  const moved = toIssue(row!, issue.images)
  beforeMove?.(moved)
  commit({
    issues: state.issues.map((i) => (i.id === issue.id ? moved : i)),
    comments: state.comments.map((c) => (c.issueId === issue.id ? { ...c, pageId: page.id } : c)),
  })
  return moved
}

/**
 * Copies an issue (from any page of the project) onto `page` as a new, open issue with the next number.
 * Screenshots are copied in storage so the two issues stay independent.
 */
export async function copyIssueToPage(source: Issue, page: AuditPage): Promise<Issue> {
  const id = crypto.randomUUID()
  const { images, ...fields } = source
  const row = check<Row | null>(
    await db()
      .from('issues')
      .insert({
        id,
        project_id: page.projectId,
        page_id: page.id,
        number: nextIssueNumber(page.projectId),
        ...fromIssueDraft({ ...fields, status: 'Open' }),
      })
      .select()
      .single(),
    'copy the issue',
  )
  const copied: IssueImage[] = []
  for (const img of images) {
    const imageId = crypto.randomUUID()
    const path = `${page.projectId}/issues/${id}/${imageId}.${extensionFor(img.type)}`
    try {
      await copyObject(img.path, path)
      copied.push({ ...img, id: imageId, path, createdAt: new Date().toISOString() })
    } catch {
      // A screenshot that can't be copied is left out rather than failing the whole copy.
    }
  }
  if (copied.length) {
    check(
      await db()
        .from('issue_images')
        .insert(
          copied.map((img, position) => ({
            id: img.id,
            issue_id: id,
            project_id: page.projectId,
            position,
            storage_path: img.path,
            name: img.name,
            type: img.type,
            size: img.size,
            width: img.width,
            height: img.height,
            alt: img.alt,
          })),
        ),
      'copy screenshots',
    )
  }
  const issue = toIssue(row!, copied)
  commit({ issues: [...state.issues, issue] })
  return issue
}

// ─── Comments ──────────────────────────────────────────────────────────────

export async function addComment(page: AuditPage, issueId: string | null, body: string, author: string) {
  const row = check(
    await db()
      .from('comments')
      .insert({
        project_id: page.projectId,
        page_id: page.id,
        issue_id: issueId,
        author_id: state.userId,
        author_email: author,
        body: body.trim(),
      })
      .select()
      .single(),
    'post the comment',
  )
  commit({ comments: [...state.comments, toComment(row)] })
}

export async function deleteComment(id: string) {
  check(await db().from('comments').delete().eq('id', id).select('id').single(), 'delete the comment')
  commit({ comments: state.comments.filter((c) => c.id !== id) })
}
