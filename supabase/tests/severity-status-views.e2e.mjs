// End-to-end check of the project-wide severity and status lists linked from the dashboard's "By severity"
// and "By status" tables (#/projects/:id/severity/:value and #/projects/:id/status/:value), as the owner and
// as a view-only client (who must never see issues on hidden pages).
// Needs a local stack (`supabase start`), the app built against it and served on HUB_URL (see
// sign-in-link-scanner.e2e.mjs) and Playwright + @supabase/supabase-js.
// Run: SUPABASE_SECRET_KEY=<secret key> SUPABASE_ANON_KEY=<publishable key> node supabase/tests/severity-status-views.e2e.mjs
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const BASE = process.env.HUB_URL ?? 'http://127.0.0.1:4173'
const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SECRET = process.env.SUPABASE_SECRET_KEY
const PUBLISHABLE = process.env.SUPABASE_ANON_KEY
const DB = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_truenorth-audit-hub'
const SHOTS = process.env.SCREENSHOT_DIR
const VIDEO = process.env.VIDEO_DIR
if (!SECRET || !PUBLISHABLE) throw new Error('Set SUPABASE_SECRET_KEY and SUPABASE_ANON_KEY')
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })

const run = Date.now()
const OWNER = `owner-${run}@truenorth.test`
const VIEWER = `client-${run}@truenorth.test`
const PASSWORD = 'test-password-123!'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
let violations = 0
const expect = (cond, msg) => {
  console.log(cond ? 'PASS' : 'FAIL', msg)
  if (!cond) failures++
}

// ─── Seed ───
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(API, SECRET, opts)
for (const email of [OWNER, VIEWER]) {
  const { error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error) throw error
}
execFileSync('docker', ['exec', DB, 'psql', '-U', 'postgres', '-qc', `select public.make_owner('${OWNER}')`])
const api = createClient(API, PUBLISHABLE, opts)
await api.auth.signInWithPassword({ email: OWNER, password: PASSWORD })
const one = async (q) => {
  const { data, error } = await q
  if (error) throw error
  return data
}
const project = await one(
  api
    .from('projects')
    .insert({ name: `Acme Storefront ${run}` })
    .select()
    .single(),
)
const addPage = (name, hidden = false) =>
  one(api.from('pages').insert({ project_id: project.id, name, hidden }).select().single())
const home = await addPage('Home')
const checkout = await addPage('Checkout')
const adminPage = await addPage('Admin', true)
const addIssue = (page, number, priority, status, description) =>
  one(
    api
      .from('issues')
      .insert({ project_id: project.id, page_id: page.id, number, priority, status, description })
      .select()
      .single(),
  )
const i1 = await addIssue(home, 1, 'Blocker', 'Open', 'Keyboard trap in the cookie banner')
await addIssue(home, 2, 'Critical', 'In progress', 'Hero carousel cannot be paused')
await addIssue(home, 3, 'Blocker', 'Fixed', 'Skip link target is missing')
const i4 = await addIssue(checkout, 4, 'Blocker', 'Open', 'Card number field has no label')
await addIssue(checkout, 5, 'Minor', 'Open', 'Error text is light gray')
await addIssue(adminPage, 6, 'Blocker', 'Open', 'Internal admin table has no headers')
await addIssue(home, 7, '', 'Needs retest', 'Footer links are too small')
await one(api.from('project_viewers').insert({ project_id: project.id, email: VIEWER }))
const dashboardUrl = `${BASE}/audit-hub#/projects/${project.id}`

// ─── Browser helpers ───
const browser = await chromium.launch()
const size = { width: 1280, height: 900 }
async function session(email) {
  const ctx = await browser.newContext({
    viewport: size,
    ...(VIDEO ? { recordVideo: { dir: VIDEO, size } } : {}),
  })
  await ctx.addInitScript(() => {
    localStorage.setItem('tn-theme', 'light')
    window.addEventListener('DOMContentLoaded', () => {
      const c = document.createElement('div')
      c.style.cssText =
        'position:fixed;z-index:2147483647;pointer-events:none;width:18px;height:18px;border-radius:50%;background:rgba(220,38,38,.55);border:2px solid #fff;box-shadow:0 0 0 1px #000;transform:translate(-50%,-50%);left:-50px;top:-50px'
      document.documentElement.appendChild(c)
      addEventListener('mousemove', (e) => {
        c.style.left = e.clientX + 'px'
        c.style.top = e.clientY + 'px'
      })
    })
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => {
    console.log('PAGE ERROR', e.message)
    failures++
  })
  await page.goto(BASE + '/audit-hub')
  await click(page.getByRole('button', { name: 'Sign in with a password instead' }))
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await click(page.getByRole('button', { name: 'Sign in', exact: true }))
  await page.getByRole('button', { name: 'Sign out' }).waitFor()
  return { ctx, page }
}
async function click(loc) {
  await loc.scrollIntoViewIfNeeded()
  await loc.hover()
  await sleep(150)
  await loc.click()
}
async function axe(page, label) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  console.log(`axe [${label}]: ${r.violations.length} violations`)
  for (const v of r.violations) console.log('  -', v.id, v.nodes.map((n) => n.target.join(' ')).join(' | '))
  violations += r.violations.length
}
async function both(page, label) {
  await axe(page, label)
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await sleep(600)
  await axe(page, `${label} dark`)
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await sleep(300)
}
async function shot(page, name, full = false) {
  if (!SHOTS) return
  if (full) await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full })
}
const h1 = (page) => page.getByRole('heading', { level: 1 })
const focused = (page) => page.evaluate(() => document.activeElement?.textContent?.trim() ?? '')
const pageGroups = (page) => page.getByRole('main').getByRole('heading', { level: 2 }).allTextContents()
const issueTitles = async (page) =>
  (await page.getByRole('main').locator('article h3').allTextContents()).map((t) =>
    t.replace(/^Issue \d+: /, ''),
  )

// ─── Owner ───
const { ctx: oc, page: o } = await session(OWNER)
await o.goto(dashboardUrl)
await h1(o).filter({ hasText: project.name }).waitFor()
const severityTable = o.getByRole('region', { name: 'By severity' })
await severityTable.scrollIntoViewIfNeeded()
await both(o, 'dashboard with linked severities and statuses')
await shot(o, 'dashboard-linked-severity-status')

await click(severityTable.getByRole('link', { name: 'Blocker issues (4)' }))
await h1(o).filter({ hasText: 'Blocker issues' }).waitFor()
expect(
  new URL(o.url()).hash === `#/projects/${project.id}/severity/Blocker`,
  'severity link goes to a bookmarkable route',
)
expect((await focused(o)) === 'Blocker issues', 'focus moves to the heading')
expect((await o.title()).startsWith('Blocker issues · Acme Storefront'), 'document title names the list')
const crumb = o.getByRole('navigation', { name: 'Breadcrumb' })
expect(
  (await crumb.getByRole('link', { name: 'Blocker issues' }).getAttribute('aria-current')) === 'page',
  'breadcrumb ends with the list',
)
expect((await o.getByText('4 issues on 3 pages.').count()) === 1, 'owner sees the count across pages')
expect(
  (await o.getByText("Includes 1 issue on hidden pages that clients can't see.").count()) === 1,
  'owner is told about hidden-page issues',
)
const groups = await pageGroups(o)
expect(
  JSON.stringify(groups) === JSON.stringify(['Home', 'Checkout', 'Admin']),
  `issues are grouped by page (${groups})`,
)
expect((await o.getByText('Hidden from clients').count()) === 1, 'hidden page group is labeled')
const titles = await issueTitles(o)
expect(
  JSON.stringify(titles) ===
    JSON.stringify([
      'Keyboard trap in the cookie banner',
      'Skip link target is missing',
      'Card number field has no label',
      'Internal admin table has no headers',
    ]),
  'only Blocker issues are listed, in page then number order',
)
expect(
  (await o.getByRole('link', { name: 'Issue 4: Card number field has no label' }).getAttribute('href')) ===
    `/audit-hub#/projects/${project.id}/pages/${checkout.id}/issues/${i4.id}`,
  'each issue links to its detail view',
)
expect(
  (await o.getByRole('button', { name: 'Edit issue #1' }).count()) === 1,
  'owner has the same issue actions as on the page',
)
await both(o, 'owner Blocker issues')
await shot(o, 'owner-blocker-issues', true)

// Switch severity from the list, then an empty one
await click(
  o.getByRole('navigation', { name: 'Severities' }).getByRole('link', { name: /^Critical \(1 issue ?\)$/ }),
)
await h1(o).filter({ hasText: 'Critical issues' }).waitFor()
expect((await o.getByText('1 issue on 1 page.').count()) === 1, 'severity switcher opens Critical')
await click(
  o
    .getByRole('navigation', { name: 'Severities' })
    .getByRole('link', { name: /^UX \/ Content \(0 issues ?\)$/ }),
)
await h1(o).filter({ hasText: 'UX / Content issues' }).waitFor()
expect(
  new URL(o.url()).hash === `#/projects/${project.id}/severity/UX%20%2F%20Content`,
  'values with a slash are encoded in the route',
)
expect((await o.getByText('There are no UX / Content issues in this project.').count()) === 1, 'empty state')
await both(o, 'empty severity list')
await shot(o, 'empty-severity-list')

// Back to the dashboard: focus returns to the link that opened the list
await click(crumb.getByRole('link', { name: project.name }))
await h1(o).filter({ hasText: project.name }).waitFor()
await sleep(300)
expect(
  (await o.evaluate(() => document.activeElement?.getAttribute('data-filter-link'))) ===
    'severity:UX / Content',
  'back on the dashboard, focus is on the severity you came from',
)

// Status list; changing status removes the issue from the list and moves focus to the heading
const statusTable = o.getByRole('region', { name: 'By status' })
await click(statusTable.getByRole('link', { name: 'Open issues (4)' }))
await h1(o).filter({ hasText: 'Open issues' }).waitFor()
expect(
  new URL(o.url()).hash === `#/projects/${project.id}/status/Open`,
  'status link goes to a bookmarkable route',
)
expect((await o.getByText('4 issues on 3 pages.').count()) === 1, 'status list counts across pages')
await shot(o, 'owner-open-status-issues', true)
await o.getByLabel('Status for issue #1').selectOption('Fixed')
await o.getByText('Issue #1 marked Fixed. It is no longer in this list.').waitFor({ state: 'attached' })
expect((await focused(o)) === 'Open issues', 'after the issue leaves the list, focus is on the heading')
expect((await o.getByText('3 issues on 2 pages.').count()) === 1, 'count updates')
expect(
  (await one(api.from('issues').select('status').eq('id', i1.id).single())).status === 'Fixed',
  'status saved',
)
await both(o, 'owner Open issues')

// Unknown values are Not found
await o.goto(`${dashboardUrl}/severity/Cosmetic`)
await h1(o).filter({ hasText: 'Not found' }).waitFor()
expect(true, 'an unknown severity shows Not found')
await oc.close()

// ─── Viewer ───
const { ctx: vc, page: v } = await session(VIEWER)
await v.goto(dashboardUrl)
await h1(v).filter({ hasText: project.name }).waitFor()
const vLink = v.getByRole('region', { name: 'By severity' }).getByRole('link', { name: 'Blocker issues (3)' })
await vLink.focus()
await v.keyboard.press('Enter')
await h1(v).filter({ hasText: 'Blocker issues' }).waitFor()
expect(true, 'viewer opens the Blocker list with the keyboard (hidden-page issue not counted)')
expect((await v.getByText('3 issues on 2 pages.').count()) === 1, 'viewer count leaves out hidden pages')
expect(
  JSON.stringify(await pageGroups(v)) === JSON.stringify(['Home', 'Checkout']),
  'viewer sees no hidden page group',
)
expect((await v.getByText('Internal admin table').count()) === 0, 'viewer never sees the hidden-page issue')
expect((await v.getByText(/hidden pages/).count()) === 0, 'viewer gets no hidden-page note')
for (const name of [/^Edit issue/, /^Move issue/, /^Delete issue/]) {
  expect(
    (await v.getByRole('button', { name }).count()) === 0,
    `viewer has no ${name.source.slice(1)} actions`,
  )
}
expect(
  (await v.getByRole('combobox', { name: /Status for issue/ }).count()) === 0,
  'viewer cannot change status',
)
await both(v, 'viewer Blocker issues')
await shot(v, 'viewer-blocker-issues', true)
await v.goto(`${dashboardUrl}/status/Open`)
await h1(v).filter({ hasText: 'Open issues' }).waitFor()
expect((await v.getByText('2 issues on 1 page.').count()) === 1, 'viewer status list leaves out hidden pages')
await both(v, 'viewer Open issues')
const issueLink = v.getByRole('link', { name: 'Issue 4: Card number field has no label' })
await issueLink.scrollIntoViewIfNeeded()
await issueLink.click({ position: { x: 12, y: 8 } })
await h1(v).filter({ hasText: 'Card number field has no label' }).waitFor()
expect(true, 'viewer can open an issue from the list')
await v.goBack()
await h1(v).filter({ hasText: 'Open issues' }).waitFor()
await sleep(300)
expect(
  (await v.evaluate(() => document.activeElement?.getAttribute('data-issue-link'))) === i4.id,
  'going back to the list puts focus on that issue',
)
await vc.close()

await browser.close()
await api.from('projects').delete().eq('id', project.id)
console.log(`\naxe total violations: ${violations}; failures: ${failures}`)
process.exit(failures || violations ? 1 : 0)
