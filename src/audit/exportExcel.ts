import type { Workbook, Worksheet } from 'exceljs'
import { PRIORITIES, type ExampleKind } from '../data/commonIssues'
import { getWcag } from '../data/wcag'
import { computeMetrics, UNSET } from './metrics'
import { imageAlt } from './issueImages'
import { downloadObject } from './supabase'
import type { AuditPage, Issue, IssueImage, Project } from './types'

const ACCENT = 'FF2A5C1E'
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } }
const HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: ACCENT } }
const SECTION_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFEDEAE3' } }
const BORDER_COLOR = { argb: 'FFD9D5CD' }
const THIN_BORDER = {
  top: { style: 'thin' as const, color: BORDER_COLOR },
  left: { style: 'thin' as const, color: BORDER_COLOR },
  bottom: { style: 'thin' as const, color: BORDER_COLOR },
  right: { style: 'thin' as const, color: BORDER_COLOR },
}

// Thumbnails are rendered at 2x for sharpness and displayed at THUMB_MAX css px.
const THUMB_MAX = { width: 240, height: 180 }
const SCREENSHOT_COL_WIDTH = 36
const PX_TO_POINTS = 0.75

type EmbeddedImage = { imageId: number; width: number; height: number }

async function renderThumbnail(blob: Blob): Promise<{ buffer: ArrayBuffer; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, THUMB_MAX.width / bitmap.width, THUMB_MAX.height / bitmap.height)
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width * 2
  canvas.height = height * 2
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const png = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Thumbnail failed'))), 'image/png'),
  )
  return { buffer: await png.arrayBuffer(), width, height }
}

async function embedIssueImages(wb: Workbook, issues: Issue[]): Promise<Map<string, EmbeddedImage>> {
  const embedded = new Map<string, EmbeddedImage>()
  for (const img of issues.flatMap((i) => i.images)) {
    try {
      if (!img.path) continue
      const blob = await downloadObject(img.path)
      const thumb = await renderThumbnail(blob)
      // exceljs's typings expect a Node Buffer; an ArrayBuffer works in the browser build.
      const imageId = wb.addImage({ buffer: thumb.buffer as never, extension: 'png' })
      embedded.set(img.id, { imageId, width: thumb.width, height: thumb.height })
    } catch {
      // Unreadable images are listed by name in the sheet instead.
    }
  }
  return embedded
}

type Column = {
  header: string
  width: number
  wrap?: boolean
  value: (issue: Issue, page: AuditPage | undefined) => string | number
  link?: (issue: Issue, page: AuditPage | undefined) => string | undefined
}

function examplesOf(issue: Issue, kind: ExampleKind) {
  return issue.examples.filter((e) => e.kind === kind && (e.label || e.url))
}

function exampleColumn(kind: ExampleKind): Column {
  return {
    header: `Working Example - ${kind}`,
    width: 34,
    wrap: true,
    value: (issue) =>
      examplesOf(issue, kind)
        .map((e) => (e.label && e.url ? `${e.label} (${e.url})` : e.label || e.url))
        .join('\n'),
    link: (issue) => {
      const list = examplesOf(issue, kind)
      return list.length === 1 && /^https?:\/\//.test(list[0].url) ? list[0].url : undefined
    },
  }
}

/** Column order follows the common issues workbook, with audit fields slotted in beside related columns. */
function issueColumns(issues: Issue[], includePage: boolean): Column[] {
  const kinds: ExampleKind[] = ['Internal', 'External']
  if (issues.some((i) => examplesOf(i, 'iOS').length)) kinds.push('iOS')
  if (issues.some((i) => examplesOf(i, 'Android').length)) kinds.push('Android')

  const pageCols: Column[] = includePage
    ? [
        { header: 'Page', width: 24, wrap: true, value: (_i, p) => p?.name ?? '' },
        {
          header: 'Page URL',
          width: 34,
          wrap: true,
          value: (_i, p) => p?.url ?? '',
          link: (_i, p) => (p && /^https?:\/\//.test(p.url) ? p.url : undefined),
        },
      ]
    : []

  return [
    { header: 'Issue #', width: 10, value: (i) => i.number },
    ...pageCols,
    { header: 'Location / Element', width: 24, wrap: true, value: (i) => i.location },
    { header: 'Site-wide', width: 11, value: (i) => (i.siteWide ? 'Yes' : 'No') },
    { header: 'Description', width: 50, wrap: true, value: (i) => i.description },
    { header: 'Expected Behaviors', width: 44, wrap: true, value: (i) => i.expectedBehavior },
    { header: 'Fixes', width: 56, wrap: true, value: (i) => i.fix },
    { header: 'Priority', width: 11, value: (i) => i.priority || UNSET },
    { header: 'Status', width: 14, value: (i) => i.status },
    ...kinds.map(exampleColumn),
    { header: 'WCAG Guideline', width: 16, wrap: true, value: (i) => i.wcag.join(', ') },
    {
      header: 'WCAG Criteria',
      width: 34,
      wrap: true,
      value: (i) =>
        i.wcag
          .map((id) => {
            const c = getWcag(id)
            return c ? `${id} ${c.name} (${c.level})` : id
          })
          .join('\n'),
    },
    { header: 'Category', width: 16, value: (i) => i.category },
    { header: 'Comments', width: 40, wrap: true, value: (i) => i.comments },
    {
      header: 'Screenshot Alt Text',
      width: 40,
      wrap: true,
      value: (i) => i.images.map((img, n) => `${n + 1}. ${imageAlt(img, n)}`).join('\n'),
    },
    { header: 'Common Issue Ref', width: 16, value: (i) => i.commonIssueId ?? '' },
    { header: 'Created', width: 18, value: (i) => formatDate(i.createdAt) },
    { header: 'Updated', width: 18, value: (i) => formatDate(i.updatedAt) },
  ]
}

function formatDate(iso: string) {
  return iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : ''
}

function styleHeaderRow(sheet: Worksheet, rowNumber: number, columnCount: number) {
  const row = sheet.getRow(rowNumber)
  for (let c = 1; c <= columnCount; c++) {
    const cell = row.getCell(c)
    cell.font = HEADER_FONT
    cell.fill = HEADER_FILL
    cell.border = THIN_BORDER
    cell.alignment = { vertical: 'middle', wrapText: true }
  }
  row.height = 22
}

function addIssueSheet(
  wb: Workbook,
  name: string,
  issues: Issue[],
  pagesById: Map<string, AuditPage>,
  includePage: boolean,
  embedded: Map<string, EmbeddedImage>,
) {
  const sheet = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] })
  const shotCount = Math.max(0, ...issues.map((i) => i.images.length))
  const shotCols: Column[] = Array.from({ length: shotCount }, (_, n) => ({
    header: `Screenshot ${n + 1}`,
    width: SCREENSHOT_COL_WIDTH,
    wrap: true,
    value: (i: Issue) => {
      const img: IssueImage | undefined = i.images[n]
      return img && !embedded.has(img.id) ? `${img.name} (image unavailable)` : ''
    },
  }))
  const cols = [...issueColumns(issues, includePage), ...shotCols]
  const firstShotCol = cols.length - shotCount + 1
  sheet.columns = cols.map((c) => ({ header: c.header, width: c.width }))
  styleHeaderRow(sheet, 1, cols.length)

  issues.forEach((issue) => {
    const page = pagesById.get(issue.pageId)
    const row = sheet.addRow(cols.map((c) => c.value(issue, page)))
    cols.forEach((col, idx) => {
      const cell = row.getCell(idx + 1)
      cell.alignment = { vertical: 'top', wrapText: !!col.wrap }
      cell.border = THIN_BORDER
      const href = col.link?.(issue, page)
      if (href) {
        cell.value = { text: String(cell.value ?? ''), hyperlink: href }
        cell.font = { color: { argb: 'FF1A4FA0' }, underline: true }
      }
    })
    const placed = issue.images.map((img) => embedded.get(img.id))
    const tallest = Math.max(0, ...placed.map((e) => e?.height ?? 0))
    if (tallest) row.height = (tallest + 12) * PX_TO_POINTS
    placed.forEach((e, n) => {
      if (!e) return
      sheet.addImage(e.imageId, {
        tl: { col: firstShotCol - 1 + n, row: row.number - 1 },
        ext: { width: e.width, height: e.height },
        editAs: 'oneCell',
      })
    })
  })

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, issues.length + 1), column: cols.length },
  }
  return sheet
}

function addTable(
  sheet: Worksheet,
  startRow: number,
  title: string,
  headers: string[],
  rows: (string | number)[][],
) {
  const titleCell = sheet.getCell(startRow, 1)
  titleCell.value = title
  titleCell.font = { bold: true, size: 13, color: { argb: ACCENT } }
  sheet.getRow(startRow + 1).values = headers
  styleHeaderRow(sheet, startRow + 1, headers.length)
  rows.forEach((values, i) => {
    const row = sheet.getRow(startRow + 2 + i)
    row.values = values
    for (let c = 1; c <= headers.length; c++) {
      row.getCell(c).border = THIN_BORDER
      row.getCell(c).alignment = { vertical: 'top', wrapText: true }
    }
  })
  if (!rows.length) {
    sheet.getCell(startRow + 2, 1).value = 'No issues logged yet'
    sheet.getCell(startRow + 2, 1).font = { italic: true, color: { argb: 'FF5C5C5C' } }
    return startRow + 4
  }
  return startRow + rows.length + 3
}

function pct(count: number, total: number) {
  return total ? Math.round((count / total) * 1000) / 10 : 0
}

function addSummarySheet(wb: Workbook, project: Project, pages: AuditPage[], issues: Issue[]) {
  const sheet = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] })
  sheet.columns = [
    { width: 34 },
    { width: 44 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
  ]

  const title = sheet.getCell('A1')
  title.value = `${project.name} — Accessibility Audit`
  title.font = { bold: true, size: 18, color: { argb: ACCENT } }
  sheet.getRow(1).height = 28

  const info: [string, string][] = [
    ['Client', project.client],
    ['Site / app URL', project.url],
    ['Platform', project.platform],
    ['Standard', project.standard],
    ['Auditor', project.auditor],
    ['Audit start date', project.startDate],
    ['Notes', project.notes],
    ['Exported', formatDate(new Date().toISOString())],
  ]
  info.forEach(([label, value], i) => {
    const row = sheet.getRow(3 + i)
    row.getCell(1).value = label
    row.getCell(1).font = { bold: true }
    row.getCell(1).fill = SECTION_FILL
    row.getCell(2).value = value || '—'
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' }
    if (label === 'Site / app URL' && /^https?:\/\//.test(value)) {
      row.getCell(2).value = { text: value, hyperlink: value }
      row.getCell(2).font = { color: { argb: 'FF1A4FA0' }, underline: true }
    }
  })

  const m = computeMetrics(pages, issues)
  let r = 3 + info.length + 1
  r = addTable(
    sheet,
    r,
    'Totals',
    ['Metric', 'Value'],
    [
      ['Pages audited', pages.length],
      ['Issue screenshots', issues.reduce((n, i) => n + i.images.length, 0)],
      ['Total issues', m.total],
      ['Open issues', m.open],
      ['Resolved issues', m.resolved],
      ['Open Blocker + Critical', m.highImpact],
    ],
  )
  r = addTable(
    sheet,
    r,
    'Issues by severity (priority)',
    ['Priority', 'Count', '% of total'],
    m.total ? m.byPriority.map((c) => [c.key, c.count, pct(c.count, m.total)]) : [],
  )
  r = addTable(
    sheet,
    r,
    'Issues by status',
    ['Status', 'Count', '% of total'],
    m.total ? m.byStatus.map((c) => [c.key, c.count, pct(c.count, m.total)]) : [],
  )
  r = addTable(
    sheet,
    r,
    'Issues by WCAG criterion',
    ['Criterion', 'Name', 'Level', 'Count'],
    m.byWcag.map((c) => {
      const w = getWcag(c.key)
      return [c.key, w?.name ?? '', w?.level ?? '', c.count]
    }),
  )
  r = addTable(
    sheet,
    r,
    'Issues by category',
    ['Category', 'Count'],
    m.byCategory.map((c) => [c.key, c.count]),
  )
  addTable(
    sheet,
    r,
    'Issues by page',
    ['Page', 'URL', 'Total', 'Open', ...PRIORITIES],
    m.byPage.map((p) => [
      p.page.name,
      p.page.url,
      p.total,
      p.open,
      ...PRIORITIES.map((priority) => p.byPriority[priority] ?? 0),
    ]),
  )
}

function sheetName(name: string, used: Set<string>) {
  const base = (
    name
      .replace(/[[\]:*?/\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Page'
  ).slice(0, 28)
  let candidate = base
  for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${base.slice(0, 26)} ${n}`
  used.add(candidate.toLowerCase())
  return candidate
}

export function exportFileName(project: Project) {
  const slug =
    project.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'project'
  return `${slug}-accessibility-audit-${new Date().toISOString().slice(0, 10)}.xlsx`
}

export async function buildProjectWorkbook(
  project: Project,
  pages: AuditPage[],
  issues: Issue[],
): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = project.auditor || 'Nicholas Bade'
  wb.created = new Date()
  wb.title = `${project.name} accessibility audit`

  const pageOrder = new Map(pages.map((p, i) => [p.id, i]))
  const sorted = [...issues].sort(
    (a, b) => (pageOrder.get(a.pageId) ?? 0) - (pageOrder.get(b.pageId) ?? 0) || a.number - b.number,
  )
  const pagesById = new Map(pages.map((p) => [p.id, p]))

  const embedded = await embedIssueImages(wb, sorted)

  addSummarySheet(wb, project, pages, sorted)
  addIssueSheet(wb, 'All Issues', sorted, pagesById, true, embedded)
  const used = new Set(['summary', 'all issues'])
  pages.forEach((page) => {
    addIssueSheet(
      wb,
      sheetName(page.name, used),
      sorted.filter((i) => i.pageId === page.id),
      pagesById,
      false,
      embedded,
    )
  })

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export async function downloadProjectWorkbook(project: Project, pages: AuditPage[], issues: Issue[]) {
  const blob = await buildProjectWorkbook(project, pages, issues)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = exportFileName(project)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
