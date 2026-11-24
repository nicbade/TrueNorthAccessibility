import {
  markArchiveImported,
  readArchivedIssueImage,
  readArchivedPageScreenshot,
  readBrowserArchive,
} from './browserArchive'
import { fromIssueDraft, loadHubData } from './store'
import { db, extensionFor, uploadObject } from './supabase'

export type ImportSummary = {
  projects: number
  pages: number
  issues: number
  screenshots: number
  missing: number
}

/**
 * Uploads projects, pages, issues and screenshots saved in this browser. Rows keep their
 * original ids and are upserted, so running it again does not create duplicates.
 */
export async function importBrowserData(
  userId: string,
  onProgress: (message: string) => void,
): Promise<ImportSummary> {
  const archive = readBrowserArchive()
  if (!archive) throw new Error('No Audit Hub data was found in this browser.')
  const client = db()
  const summary: ImportSummary = { projects: 0, pages: 0, issues: 0, screenshots: 0, missing: 0 }
  const fail = (action: string, error: { message: string } | null) => {
    if (error) throw new Error(`Could not import ${action}: ${error.message}`)
  }

  for (const project of archive.projects) {
    onProgress(`Importing project ${project.name}…`)
    const { error } = await client.from('projects').upsert({
      id: project.id,
      name: project.name,
      client: project.client,
      url: project.url,
      platform: project.platform,
      standard: project.standard,
      auditor: project.auditor,
      start_date: project.startDate,
      notes: project.notes,
      created_at: project.createdAt,
    })
    fail(`project ${project.name}`, error)
    summary.projects++

    for (const page of archive.pages.filter((p) => p.projectId === project.id)) {
      let screenshot = null
      if (page.screenshot) {
        const blob = await readArchivedPageScreenshot(page.id)
        if (blob) {
          const path = `${project.id}/pages/${page.id}/imported.${extensionFor(page.screenshot.type)}`
          await uploadObject(path, blob, page.screenshot.type || blob.type)
          screenshot = { ...page.screenshot, path }
          summary.screenshots++
        } else summary.missing++
      }
      const { error: pageError } = await client.from('pages').upsert({
        id: page.id,
        project_id: project.id,
        name: page.name,
        url: page.url,
        notes: page.notes,
        screenshot,
        created_at: page.createdAt,
      })
      fail(`page ${page.name}`, pageError)
      summary.pages++
    }

    const issues = archive.issues.filter((i) => i.projectId === project.id)
    for (const issue of issues) {
      onProgress(`Importing ${project.name} issue #${issue.number}…`)
      const { error: issueError } = await client.from('issues').upsert({
        id: issue.id,
        project_id: project.id,
        page_id: issue.pageId,
        number: issue.number,
        created_at: issue.createdAt,
        ...fromIssueDraft(issue),
      })
      fail(`issue #${issue.number}`, issueError)
      summary.issues++

      const rows = []
      for (const [position, img] of (issue.images ?? []).entries()) {
        const blob = await readArchivedIssueImage(img.id)
        if (!blob) {
          summary.missing++
          continue
        }
        const path = `${project.id}/issues/${issue.id}/${img.id}.${extensionFor(img.type)}`
        await uploadObject(path, blob, img.type || blob.type)
        summary.screenshots++
        rows.push({
          id: img.id,
          issue_id: issue.id,
          project_id: project.id,
          position,
          storage_path: path,
          name: img.name,
          type: img.type,
          size: img.size,
          width: img.width,
          height: img.height,
          alt: img.alt,
        })
      }
      if (rows.length)
        fail(`screenshots for issue #${issue.number}`, (await client.from('issue_images').upsert(rows)).error)
    }
  }

  markArchiveImported()
  await loadHubData(userId)
  return summary
}
