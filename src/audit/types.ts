import type { Platform, Priority, WorkingExample } from '../data/commonIssues'

export type IssueStatus = 'Open' | 'In progress' | 'Needs retest' | 'Fixed' | "Won't fix"

export const STATUSES: IssueStatus[] = ['Open', 'In progress', 'Needs retest', 'Fixed', "Won't fix"]

export const RESOLVED_STATUSES: IssueStatus[] = ['Fixed', "Won't fix"]

export type Project = {
  id: string
  name: string
  client: string
  url: string
  platform: Platform
  standard: string
  auditor: string
  startDate: string
  notes: string
  createdAt: string
  updatedAt: string
}

export type ScreenshotMeta = {
  path: string
  name: string
  type: string
  size: number
  width: number
  height: number
  updatedAt: string
}

export type IssueImage = {
  id: string
  /** Storage object path; empty until the image has been uploaded. */
  path: string
  name: string
  type: string
  size: number
  width: number
  height: number
  alt: string
  createdAt: string
}

export type AuditPage = {
  id: string
  projectId: string
  name: string
  url: string
  notes: string
  /** Hidden pages (and their issues) are visible to the owner only. */
  hidden: boolean
  screenshot: ScreenshotMeta | null
  createdAt: string
  updatedAt: string
}

/** Field set mirrors the common issues workbook, plus audit tracking fields. */
export type Issue = {
  id: string
  projectId: string
  pageId: string
  number: number
  description: string
  expectedBehavior: string
  fix: string
  priority: Priority | ''
  examples: WorkingExample[]
  wcag: string[]
  category: string
  comments: string
  status: IssueStatus
  location: string
  siteWide: boolean
  /** A component in the same project, or null. */
  componentId: string | null
  commonIssueId: string | null
  images: IssueImage[]
  createdAt: string
  updatedAt: string
}

export type IssueDraft = Omit<Issue, 'id' | 'projectId' | 'pageId' | 'number' | 'createdAt' | 'updatedAt'>

export type ProjectViewer = {
  projectId: string
  email: string
  createdAt: string
}

export type Comment = {
  id: string
  projectId: string
  pageId: string
  /** null for a comment on the page itself */
  issueId: string | null
  authorId: string | null
  authorEmail: string
  body: string
  createdAt: string
}

/** A reusable part of the site (header, cart drawer, date picker…) that issues can be attached to. */
export type Component = {
  id: string
  projectId: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
}

export type AuditData = {
  projects: Project[]
  pages: AuditPage[]
  components: Component[]
  issues: Issue[]
  viewers: ProjectViewer[]
  comments: Comment[]
}
