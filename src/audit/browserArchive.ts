// Read-only access to Audit Hub data saved in this browser before the move to Supabase
// (localStorage + IndexedDB), used by the one-time import.
import type { AuditPage, Issue, IssueImage, Project } from './types'

const STORAGE_KEY = 'truenorth-audit-hub:v1'
const IMPORTED_KEY = 'truenorth-audit-hub:imported-at'
const DB_NAME = 'truenorth-audit-hub'

type LegacyImage = Omit<IssueImage, 'path'>
type LegacyPage = Omit<AuditPage, 'screenshot'> & {
  screenshot: Omit<NonNullable<AuditPage['screenshot']>, 'path'> | null
}
type LegacyIssue = Omit<Issue, 'images'> & { images?: LegacyImage[] }

export type BrowserArchive = { projects: Project[]; pages: LegacyPage[]; issues: LegacyIssue[] }

export function readBrowserArchive(): BrowserArchive | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BrowserArchive>
    const archive = {
      projects: parsed.projects ?? [],
      pages: parsed.pages ?? [],
      issues: parsed.issues ?? [],
    }
    return archive.projects.length ? archive : null
  } catch {
    return null
  }
}

export function archiveImportedAt(): string | null {
  try {
    return localStorage.getItem(IMPORTED_KEY)
  } catch {
    return null
  }
}

export function markArchiveImported() {
  try {
    localStorage.setItem(IMPORTED_KEY, new Date().toISOString())
  } catch {
    /* ignore */
  }
}

function openArchiveDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })
}

async function readBlob(store: string, key: string): Promise<Blob | null> {
  const db = await openArchiveDb()
  if (!db || !db.objectStoreNames.contains(store)) return null
  return new Promise((resolve) => {
    const req = db.transaction(store).objectStore(store).get(key)
    req.onsuccess = () => resolve((req.result as { blob?: Blob } | undefined)?.blob ?? null)
    req.onerror = () => resolve(null)
  })
}

export const readArchivedPageScreenshot = (pageId: string) => readBlob('screenshots', pageId)
export const readArchivedIssueImage = (imageId: string) => readBlob('issueImages', imageId)

export function readImageSize(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file could not be read as an image.'))
    }
    img.src = url
  })
}
