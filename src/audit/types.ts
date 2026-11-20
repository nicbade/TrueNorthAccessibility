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
  name: string
  type: string
  size: number
  width: number
  height: number
  updatedAt: string
}

export type AuditPage = {
  id: string
  projectId: string
  name: string
  url: string
  notes: string
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
  commonIssueId: string | null
  createdAt: string
  updatedAt: string
}

export type IssueDraft = Omit<Issue, 'id' | 'projectId' | 'pageId' | 'number' | 'createdAt' | 'updatedAt'>

export type AuditData = {
  version: 1
  projects: Project[]
  pages: AuditPage[]
  issues: Issue[]
}
