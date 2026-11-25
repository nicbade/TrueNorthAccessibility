// End-to-end check of project-wide issue search (#/projects/:id/search?q=&severity=&status=), as the owner
// and as a view-only client (who must never see issues on hidden pages): the search landmark on the dashboard,
// debounced typing that keeps focus, matching by number / text / WCAG / notes, highlighting and context,
// severity and status chips, the live result count, empty states, bookmarks and owner actions.
// Needs a local stack (`supabase start`), the app built against it and served on HUB_URL (see
// sign-in-link-scanner.e2e.mjs) and Playwright + @supabase/supabase-js.
// Run: SUPABASE_SECRET_KEY=<secret key> SUPABASE_ANON_KEY=<publishable key> node supabase/tests/issue-search.e2e.mjs
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
const addIssue = (page, number, fields) =>
  one(
    api
      .from('issues')
      .insert({ project_id: project.id, page_id: page.id, number, status: 'Open', ...fields })
      .select()
      .single(),
  )
await addIssue(home, 1, {
  priority: 'Blocker',
  description: 'Keyboard trap in the cookie banner',
  location: 'Cookie banner',
  category: 'Keyboard',
  wcag: ['2.1.2'],
})
const i2 = await addIssue(home, 2, {
  priority: 'Critical',
  status: 'In progress',
  description: 'Hero carousel cannot be paused',
  fix: 'Add a Pause button before the slides and stop rotation on focus.',
  wcag: ['2.2.2'],
})
const i3 = await addIssue(checkout, 3, {
  priority: 'Blocker',
  description: 'Card number field has no label',
  expected_behavior: 'Every form field has a visible label that is announced with it.',
  comments: 'Also affects the CVV field on mobile.',
  wcag: ['1.3.1', '3.3.2'],
})
await addIssue(checkout, 12, {
  priority: 'Minor',
  description: 'Error text is light gray',
  location: 'Payment form',
  category: 'Color contrast',
  wcag: ['1.4.3'],
})
await addIssue(adminPage, 5, { priority: 'Blocker', description: 'Admin filters have no label' })
await one(api.from('project_viewers').insert({ project_id: project.id, email: VIEWER }))
const dashboardUrl = `${BASE}/audit-hub#/projects/${project.id}`
const searchHash = (qs = '') => `#/projects/${project.id}/search${qs}`

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

const summary = (page) => page.getByRole('main').getByRole('status').filter({ hasText: /match/ })
const searchBox = (page) => page.getByRole('search').getByRole('searchbox', { name: 'Search issues' })
async function typeQuery(page, text) {
  const box = searchBox(page)
  await click(box)
  await box.fill('')
  await box.pressSequentially(text, { delay: 60 })
}
const chip = (page, group, name) =>
  page.getByRole('group', { name: group }).getByRole('button', { name: new RegExp(`^${name} \\(`) })

// ─── Owner ───
const { ctx: oc, page: o } = await session(OWNER)
await o.goto(dashboardUrl)
await h1(o).filter({ hasText: project.name }).waitFor()
const landmark = o.getByRole('search', { name: `Issues in ${project.name}` })
expect((await landmark.count()) === 1, 'dashboard has a labelled search landmark')
await click(landmark.getByRole('searchbox', { name: 'Search issues' }))
await o.keyboard.type('label')
await shot(o, 'dashboard-search-box')
await o.keyboard.press('Enter')
await h1(o).filter({ hasText: 'Search issues' }).waitFor()
expect(new URL(o.url()).hash === searchHash('?q=label'), 'search goes to a bookmarkable route')
expect((await focused(o)) === 'Search issues', 'focus moves to the heading')
expect((await o.title()).startsWith('Search: label · Acme Storefront'), 'document title includes the query')
const crumb = o.getByRole('navigation', { name: 'Breadcrumb' })
expect(
  (await crumb.getByRole('link', { name: 'Search issues' }).getAttribute('aria-current')) === 'page',
  'breadcrumb ends with Search issues',
)
expect(
  (await summary(o).textContent()) === '2 issues on 2 pages match “label”.',
  'result count is in a status region',
)
expect(
  JSON.stringify(await pageGroups(o)) === JSON.stringify(['Checkout', 'Admin']),
  'results are grouped by page',
)
expect((await o.getByText('Hidden from clients').count()) === 1, 'hidden page is labeled for the owner')
expect(
  (await o.getByText("Includes 1 issue on hidden pages that clients can't see.").count()) === 1,
  'owner is told about hidden-page results',
)
expect((await o.locator('article h3 mark').count()) === 2, 'matches are highlighted in titles')
expect(
  (await o.getByText('Matched in Expected behavior:').count()) === 1,
  'matches outside the card show context',
)
expect(
  (await o.getByRole('link', { name: 'Issue 3: Card number field has no label' }).getAttribute('href')) ===
    `/audit-hub#/projects/${project.id}/pages/${checkout.id}/issues/${i3.id}`,
  'results link to the issue detail view',
)
expect(
  (await o.getByRole('button', { name: 'Edit issue #3' }).count()) === 1,
  'owner gets the list view actions',
)
await both(o, 'owner search "label"')
await shot(o, 'owner-search-results', true)
await o.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
await sleep(400)
await shot(o, 'owner-search-results-dark', true)
await o.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))

// Debounced typing on the search page keeps focus in the box and updates the address
await typeQuery(o, 'pause')
await summary(o).filter({ hasText: '1 issue on 1 page match “pause”.' }).waitFor()
expect(new URL(o.url()).hash === searchHash('?q=pause'), 'typing updates the address (debounced)')
expect(
  (await o.evaluate(() => document.activeElement?.getAttribute('type'))) === 'search',
  'focus stays in the search box',
)
expect((await o.getByText('Matched in How to fix:').count()) === 1, 'fix text match shows context')

const expectOnly = async (query, title, label) => {
  await typeQuery(o, query)
  await summary(o)
    .filter({ hasText: `match “${query}”` })
    .waitFor()
  await sleep(100)
  const titles = await issueTitles(o)
  expect(JSON.stringify(titles) === JSON.stringify([title]), `${label} (${titles})`)
}
await expectOnly('#12', 'Error text is light gray', '"#12" finds issue 12 only')
await expectOnly('12', 'Error text is light gray', '"12" finds issue 12')
await expectOnly('1.4.3', 'Error text is light gray', 'WCAG criterion number matches')
await expectOnly('contrast', 'Error text is light gray', 'category matches')
expect((await o.getByText('Matched in Category:').count()) === 1, 'category match shows context')
await expectOnly('cvv', 'Card number field has no label', 'auditor notes match (case-insensitive)')
expect((await o.getByText('Matched in Auditor notes:').count()) === 1, 'notes match shows context')
await expectOnly('payment', 'Error text is light gray', 'location matches')
await expectOnly('card label', 'Card number field has no label', 'words are combined (AND)')
await expectOnly('Labels or Instructions', 'Card number field has no label', 'WCAG criterion name matches')

// Filter chips combine with the query
await typeQuery(o, 'label')
await summary(o).filter({ hasText: 'match “label”' }).waitFor()
await click(chip(o, 'Severity', 'Blocker'))
await summary(o).filter({ hasText: 'severity Blocker' }).waitFor()
expect(
  (await chip(o, 'Severity', 'Blocker').getAttribute('aria-pressed')) === 'true',
  'chip is a pressed toggle',
)
expect(new URL(o.url()).hash === searchHash('?q=label&severity=Blocker'), 'filters are in the address')
await click(chip(o, 'Status', 'Open'))
await summary(o)
  .filter({ hasText: '2 issues on 2 pages match “label”, severity Blocker, status Open.' })
  .waitFor()
expect(true, 'severity and status chips combine with the query')
await both(o, 'owner search with filters')
await shot(o, 'owner-search-filters', true)

// Owner changes a status so the issue leaves the results: focus goes to the heading
await o.getByLabel('Status for issue #3').selectOption('Fixed')
await o.getByText('Issue #3 marked Fixed. It is no longer in the results.').waitFor({ state: 'attached' })
expect((await focused(o)) === 'Search issues', 'focus moves to the heading when an issue leaves the results')
expect(
  (await summary(o).textContent()) === '1 issue on 1 page match “label”, severity Blocker, status Open.',
  'count updates',
)

await click(o.getByRole('button', { name: 'Clear filters' }))
await summary(o).filter({ hasText: '2 issues on 2 pages match “label”.' }).waitFor()
expect(true, 'Clear filters keeps the query')

// Filters alone, no query
await typeQuery(o, '')
await sleep(500)
expect((await o.getByText(/Type a word or an issue number/).count()) === 1, 'empty query shows guidance')
await shot(o, 'search-start')
await click(chip(o, 'Severity', 'Blocker'))
await summary(o).filter({ hasText: '3 issues on 3 pages match severity Blocker.' }).waitFor()
expect(true, 'a chip alone lists every issue with that severity')
await click(chip(o, 'Severity', 'Blocker'))

// No results
await typeQuery(o, 'zzzz')
await summary(o).filter({ hasText: 'No issues match “zzzz”.' }).waitFor()
expect((await o.getByText('No issues found.').count()) === 1, 'empty state')
await both(o, 'owner no results')
await shot(o, 'search-no-results')

// Bookmark with query + filter; back from an issue restores the search and focus
await o.goto(`${BASE}/audit-hub${searchHash('?q=carousel&severity=Critical')}`)
await h1(o).filter({ hasText: 'Search issues' }).waitFor()
await summary(o).waitFor()
expect((await searchBox(o).inputValue()) === 'carousel', 'bookmarked query fills the box')
expect(
  (await chip(o, 'Severity', 'Critical').getAttribute('aria-pressed')) === 'true',
  'bookmarked filter is pressed',
)
const carousel = o.getByRole('link', { name: 'Issue 2: Hero carousel cannot be paused' })
await carousel.scrollIntoViewIfNeeded()
await carousel.click({ position: { x: 12, y: 8 } })
await h1(o).filter({ hasText: 'Hero carousel cannot be paused' }).waitFor()
await o.goBack()
await h1(o).filter({ hasText: 'Search issues' }).waitFor()
await sleep(300)
expect(
  (await o.evaluate(() => document.activeElement?.getAttribute('data-issue-link'))) === i2.id,
  'back from the issue focuses it in the results',
)
await oc.close()

// ─── Viewer ───
const { ctx: vc, page: v } = await session(VIEWER)
await v.goto(dashboardUrl)
await h1(v).filter({ hasText: project.name }).waitFor()
await v
  .getByRole('search', { name: `Issues in ${project.name}` })
  .getByRole('searchbox')
  .fill('label')
await v.keyboard.press('Enter')
await h1(v).filter({ hasText: 'Search issues' }).waitFor()
expect(
  (await summary(v).textContent()) === '1 issue on 1 page match “label”.',
  'viewer results leave out hidden pages',
)
expect((await v.getByText('Admin filters').count()) === 0, 'viewer never sees the hidden-page issue')
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
await both(v, 'viewer search "label"')
await shot(v, 'viewer-search-results', true)
await typeQuery(v, '#5')
await summary(v).filter({ hasText: 'No issues match “#5”.' }).waitFor()
expect(true, 'viewer cannot find a hidden-page issue by number')
await typeQuery(v, '')
await click(chip(v, 'Severity', 'Blocker'))
await summary(v).filter({ hasText: '2 issues on 2 pages match severity Blocker.' }).waitFor()
expect(true, 'viewer Blocker chip counts only visible pages')
await both(v, 'viewer severity filter')
await vc.close()

await browser.close()
await api.from('projects').delete().eq('id', project.id)
console.log(`\naxe total violations: ${violations}; failures: ${failures}`)
process.exit(failures || violations ? 1 : 0)
