// End-to-end check of components: creating, renaming and deleting them from the project dashboard, the
// Component field in the add and edit forms (including edit from the issue view), the component view listing
// attached issues across pages, copy/move keeping the component, search by component name, the Excel column,
// and view-only clients seeing components without hidden-page issues or any way to change them.
// Needs a local stack (`supabase start`), the app built against it and served on HUB_URL (see
// sign-in-link-scanner.e2e.mjs) and Playwright + exceljs + @supabase/supabase-js.
// Run: SUPABASE_SECRET_KEY=<secret key> SUPABASE_ANON_KEY=<publishable key> node supabase/tests/components.e2e.mjs
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import ExcelJS from 'exceljs'
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
const project = await one(api.from('projects').insert({ name: `Acme Storefront ${run}` }).select().single())
const addPage = (name, hidden = false) =>
  one(api.from('pages').insert({ project_id: project.id, name, hidden }).select().single())
const home = await addPage('Home')
const checkout = await addPage('Checkout')
const drafts = await addPage('Drafts', true)
const addIssue = (page, number, description) =>
  one(
    api
      .from('issues')
      .insert({ project_id: project.id, page_id: page.id, number, description, priority: 'Major' })
      .select()
      .single(),
  )
const i1 = await addIssue(home, 1, 'Hero carousel does not pause')
const i2 = await addIssue(checkout, 2, 'Cart count is not announced')
const i3 = await addIssue(drafts, 3, 'Logo alt text repeats the site name')
const i4 = await addIssue(home, 4, 'Footer links have low contrast')
await one(api.from('project_viewers').insert({ project_id: project.id, email: VIEWER }))
const componentOf = async (id) =>
  (await one(api.from('issues').select('component_id').eq('id', id).single())).component_id
const issueId = async (number) =>
  (await one(api.from('issues').select('id').eq('project_id', project.id).eq('number', number).single())).id
const dashboardUrl = `${BASE}/audit-hub#/projects/${project.id}`
const pageUrl = (page) => `${dashboardUrl}/pages/${page.id}`
const issueUrl = (page, id) => `${pageUrl(page)}/issues/${id}`
const componentUrl = (id) => `${dashboardUrl}/components/${id}`

// ─── Browser helpers ───
const browser = await chromium.launch()
const size = { width: 1280, height: 900 }
async function session(email) {
  const ctx = await browser.newContext({
    viewport: size,
    acceptDownloads: true,
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
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
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
const main = (page) => page.getByRole('main')
const card = (page, n) => main(page).locator('article').filter({ hasText: `Issue ${n}:` })
const componentsSection = (page) => page.getByRole('region', { name: 'Components' })
const row = (page, name) => componentsSection(page).locator('tbody tr').filter({ hasText: name })
const cells = async (page, name) => (await row(page, name).locator('td').allInnerTexts()).map((t) => t.trim())
const describedBy = (loc) =>
  loc.evaluate((el) =>
    (el.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' '),
  )
const groupHeadings = async (page) =>
  (await main(page).getByRole('heading', { level: 2 }).allInnerTexts())
    .map((t) => t.trim())
    .filter((t) => !t.startsWith('Screenshots'))

// ─── Owner ───
const { ctx: oc, page: o } = await session(OWNER)
await o.goto(dashboardUrl)
await h1(o).filter({ hasText: project.name }).waitFor()

// 1. Create components from the dashboard
await componentsSection(o).getByText('No components yet.').waitFor()
expect(true, 'dashboard shows the Components empty state')
await click(o.getByRole('button', { name: 'Add component' }))
let form = o.getByRole('dialog', { name: 'Add component' })
await click(form.getByRole('button', { name: 'Add component' }))
await form.getByText('Enter a component name.').waitFor()
expect(
  (await form.getByLabel('Component name').getAttribute('aria-invalid')) === 'true',
  'a blank name is rejected with an inline error',
)
await form.getByLabel('Component name').fill('Site header')
await form.getByLabel('Description').fill('Logo, search, account menu and main navigation on every page.')
await both(o, 'add component dialog')
await shot(o, 'add-component-dialog')
await click(form.getByRole('button', { name: 'Add component' }))
await form.waitFor({ state: 'detached' })
await row(o, 'Site header').waitFor()
for (const name of ['Footer', 'Date picker']) {
  await click(o.getByRole('button', { name: 'Add component' }))
  form = o.getByRole('dialog', { name: 'Add component' })
  await form.getByLabel('Component name').fill(name)
  await click(form.getByRole('button', { name: 'Add component' }))
  await form.waitFor({ state: 'detached' })
}
await click(o.getByRole('button', { name: 'Add component' }))
form = o.getByRole('dialog', { name: 'Add component' })
await form.getByLabel('Component name').fill('site HEADER')
await click(form.getByRole('button', { name: 'Add component' }))
await form.getByText('already has a component named').waitFor()
expect(
  (await form.getByLabel('Component name').getAttribute('aria-invalid')) === 'true',
  'duplicate names (ignoring case) are refused with a clear inline message',
)
await click(form.getByRole('button', { name: 'Cancel' }))
const comps = await one(api.from('components').select('id, name, description').eq('project_id', project.id))
const header = comps.find((c) => c.name === 'Site header')
const footer = comps.find((c) => c.name === 'Footer')
const picker = comps.find((c) => c.name === 'Date picker')
expect(comps.length === 3 && header.description.startsWith('Logo, search'), 'components are saved')

// 2. Rename and describe a component
await click(row(o, 'Footer').getByRole('button', { name: 'Edit component Footer' }))
form = o.getByRole('dialog', { name: 'Edit component' })
expect((await form.getByLabel('Component name').inputValue()) === 'Footer', 'edit form shows the current name')
await form.getByLabel('Component name').fill('Site footer')
await form.getByLabel('Description').fill('Newsletter sign-up, legal links and social icons.')
await click(form.getByRole('button', { name: 'Save changes' }))
await form.waitFor({ state: 'detached' })
await row(o, 'Site footer').waitFor()
const renamed = await one(api.from('components').select('name, description').eq('id', footer.id).single())
expect(renamed.name === 'Site footer' && renamed.description.startsWith('Newsletter'), 'owner can rename and describe a component')

// 3. Attach from the add form
await o.goto(pageUrl(home))
await h1(o).filter({ hasText: 'Home' }).waitFor()
await click(o.getByRole('button', { name: 'Add issue' }))
const addForm = o.getByRole('dialog', { name: 'Add issue' })
await addForm.getByLabel('Description').fill('Search button has no accessible name')
const addSelect = addForm.getByRole('combobox', { name: 'Component' })
const options = (await addSelect.locator('option').allInnerTexts()).map((t) => t.trim())
expect(
  options.join('|') === 'None|Date picker|Site footer|Site header|+ New component…',
  'Component select lists None, the components and + New component…',
)
expect((await addSelect.inputValue()) === '', 'Component defaults to None')
expect((await describedBy(addSelect)).includes('component page lists every attached issue'), 'Component select has a hint')
await addSelect.selectOption({ label: 'Site header' })
await addSelect.scrollIntoViewIfNeeded()
await both(o, 'add issue form with component select')
await shot(o, 'add-issue-component-select')
await click(addForm.getByRole('button', { name: 'Add issue' }))
await addForm.waitFor({ state: 'detached' })
await card(o, 5).waitFor()
const i5 = await issueId(5)
expect((await componentOf(i5)) === header.id, 'add form saves the component')
const cardLink = card(o, 5).getByRole('link', { name: 'Site header' })
expect(
  (await cardLink.count()) === 1 && (await cardLink.getAttribute('href')).endsWith(`/components/${header.id}`),
  'issue card links to its component',
)
expect((await card(o, 1).getByText('Component:').count()) === 0, 'cards without a component show no component line')

// 4. Attach from the issue view's edit form
await o.goto(issueUrl(checkout, i2.id))
await h1(o).filter({ hasText: 'Cart count' }).waitFor()
const field = o.locator('dl div').filter({ hasText: /^Component/ })
expect((await field.innerText()).includes('None'), 'issue view shows Component: None')
await click(o.getByRole('button', { name: 'Edit issue' }))
let editForm = o.getByRole('dialog', { name: 'Edit issue #2' })
await editForm.getByRole('combobox', { name: 'Component' }).selectOption({ label: 'Site header' })
await click(editForm.getByRole('button', { name: 'Save issue' }))
await editForm.waitFor({ state: 'detached' })
await field.getByRole('link', { name: 'Site header' }).waitFor()
expect((await componentOf(i2.id)) === header.id, 'edit from the issue view saves the component')
await both(o, 'issue view with component link')
await shot(o, 'owner-issue-detail-component', true)
await one(api.from('issues').update({ component_id: header.id }).eq('id', i3.id))
await one(api.from('issues').update({ component_id: footer.id }).eq('id', i4.id))
await o.reload()
await h1(o).filter({ hasText: 'Cart count' }).waitFor()

// 5. Copy and move keep the component
await click(o.getByRole('button', { name: 'Copy to a page' }))
const copyDialog = o.getByRole('dialog', { name: 'Copy issue #2' })
await copyDialog.getByLabel('Copy to page').selectOption(home.id)
await click(copyDialog.getByRole('button', { name: 'Copy issue' }))
await o.waitForURL(new RegExp(`/pages/${home.id}/issues/`))
await o.getByText('Issue #6 · Home').waitFor()
expect((await componentOf(await issueId(6))) === header.id, 'copied issue keeps the component')
await o.goto(issueUrl(home, i5))
await h1(o).filter({ hasText: 'Search button' }).waitFor()
await click(o.getByRole('button', { name: 'Move to page…' }))
const moveDialog = o.getByRole('dialog', { name: 'Move issue #5' })
await moveDialog.getByLabel('Move to page').selectOption(checkout.id)
await click(moveDialog.getByRole('button', { name: 'Move to Checkout' }))
await o.waitForURL(new RegExp(`/pages/${checkout.id}/issues/${i5}$`))
expect((await componentOf(i5)) === header.id, 'moved issue keeps the component')

// 6. Component view (owner sees hidden-page issues too)
await o.goto(dashboardUrl)
await h1(o).filter({ hasText: project.name }).waitFor()
expect(
  (await cells(o, 'Site header')).slice(0, 2).join(',') === '4,4',
  'dashboard counts attached and open issues per component',
)
await both(o, 'dashboard with components')
await componentsSection(o).scrollIntoViewIfNeeded()
await shot(o, 'dashboard-components-section')
await click(componentsSection(o).getByRole('link', { name: 'Site header' }))
await h1(o).filter({ hasText: 'Site header' }).waitFor()
expect(o.url().endsWith(`/components/${header.id}`), 'component link opens the bookmarkable component route')
expect((await o.title()).startsWith('Component: Site header'), 'document title names the component')
const crumbs = (await o.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('listitem').allInnerTexts()).map((t) =>
  t.replace('/', '').trim(),
)
expect(crumbs.join(' > ') === `Projects > ${project.name} > Component: Site header`, 'breadcrumb shows the component')
expect(
  (await main(o).innerText()).includes('4 attached issues on 3 pages, 4 open.'),
  'component view shows attached, page and open counts',
)
expect((await groupHeadings(o)).join('|') === 'Home|Checkout|Drafts', 'issues are grouped by page in page order')
expect((await main(o).getByText('Includes 1 issue on hidden pages').count()) === 1, 'owner sees the hidden-page note')
expect((await card(o, 3).count()) === 1, 'owner sees the hidden-page issue')
await both(o, 'owner component view')
await shot(o, 'owner-component-view', true)
await o.goBack()
await h1(o).filter({ hasText: project.name }).waitFor()
await sleep(300)
expect(
  (await o.evaluate(() => document.activeElement?.getAttribute('data-component-link'))) === header.id,
  'returning to the dashboard focuses the component link',
)

// 7. Empty state
await o.goto(componentUrl(picker.id))
await h1(o).filter({ hasText: 'Date picker' }).waitFor()
expect(
  (await main(o).getByText('No issues are attached to this component yet.').count()) === 1,
  'component without issues shows an empty state',
)
await both(o, 'empty component view')

// 8. Search matches the component name
await o.goto(`${dashboardUrl}/search?q=${encodeURIComponent('site header')}`)
await h1(o).filter({ hasText: 'Search issues' }).waitFor()
await card(o, 2).waitFor()
expect(
  (await card(o, 2).count()) === 1 && (await card(o, 1).count()) === 0,
  'search matches issues by component name',
)
expect((await card(o, 2).locator('mark').filter({ hasText: /header/i }).count()) > 0, 'the component name is highlighted')

// 9. Excel export
await o.goto(dashboardUrl)
await h1(o).filter({ hasText: project.name }).waitFor()
const [download] = await Promise.all([o.waitForEvent('download'), click(o.getByRole('button', { name: 'Export to Excel' }))])
const file = `/tmp/components-${run}.xlsx`
await download.saveAs(file)
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(file)
function componentFor(description) {
  const sheet = wb.getWorksheet('All Issues')
  let col = 0
  let value
  sheet.eachRow((r) => {
    const values = r.values.map((v) => (v && typeof v === 'object' ? (v.text ?? v.richText?.map((t) => t.text).join('')) : v))
    if (!col) col = values.indexOf('Component')
    else if (values.some((v) => typeof v === 'string' && v.startsWith(description))) value = values[col] ?? ''
  })
  return { col, value }
}
expect(componentFor('Cart count').col > 0, 'export has a Component column')
expect(componentFor('Cart count').value === 'Site header', 'attached issue exports its component name')
expect(componentFor('Hero carousel').value === '', 'unattached issue exports an empty component')

// 10. Delete a component: confirmation explains the issues are detached
await click(row(o, 'Site footer').getByRole('button', { name: 'Delete component Site footer' }))
const confirmDialog = o.getByRole('dialog', { name: 'Delete component "Site footer"?' })
const confirmText = await confirmDialog.innerText()
expect(
  confirmText.includes('1 attached issue will be detached from "Site footer"') && confirmText.includes('issues themselves are kept'),
  'delete confirmation says attached issues will be detached',
)
await both(o, 'delete component confirmation')
await shot(o, 'delete-component-confirmation')
await click(confirmDialog.getByRole('button', { name: 'Delete component' }))
await confirmDialog.waitFor({ state: 'detached' })
await row(o, 'Site footer').waitFor({ state: 'detached' })
const kept = await one(api.from('issues').select('id, component_id').eq('id', i4.id))
expect(kept.length === 1 && kept[0].component_id === null, 'deleting a component keeps its issues and detaches them')
await sleep(400)
await oc.close()

// ─── Viewer (client) ───
const { ctx: vc, page: v } = await session(VIEWER)
await v.goto(dashboardUrl)
await h1(v).filter({ hasText: project.name }).waitFor()
await row(v, 'Site header').waitFor()
expect((await cells(v, 'Site header')).join(',') === '3,3', 'viewer counts leave out hidden-page issues')
expect(
  (await componentsSection(v).getByRole('button').count()) === 0,
  'viewer has no Add, Edit or Delete component buttons',
)
await click(componentsSection(v).getByRole('link', { name: 'Site header' }))
await h1(v).filter({ hasText: 'Site header' }).waitFor()
expect(
  (await main(v).innerText()).includes('3 attached issues on 2 pages, 3 open.'),
  'viewer component view counts only visible issues',
)
expect((await groupHeadings(v)).join('|') === 'Home|Checkout', 'viewer component view has no hidden page')
expect((await card(v, 3).count()) === 0, 'viewer does not see the hidden-page issue')
expect(
  (await main(v).getByRole('button', { name: /Edit component|Delete component|^Edit|^Delete|^Move/ }).count()) === 0,
  'viewer has no component or issue actions',
)
await both(v, 'viewer component view')
await shot(v, 'viewer-component-view', true)
await v.goto(issueUrl(checkout, i2.id))
await h1(v).filter({ hasText: 'Cart count' }).waitFor()
expect(
  (await v.locator('dl div').filter({ hasText: /^Component/ }).getByRole('link', { name: 'Site header' }).count()) === 1,
  'viewer sees the component link in the issue view',
)
expect((await v.getByRole('button', { name: 'Edit issue' }).count()) === 0, 'viewer has no Edit issue button')
await v.goto(componentUrl(crypto.randomUUID()))
await h1(v).filter({ hasText: 'Not found' }).waitFor()
expect(true, 'an unknown component shows Not found')
const viewerApi = createClient(API, PUBLISHABLE, opts)
await viewerApi.auth.signInWithPassword({ email: VIEWER, password: PASSWORD })
expect(
  !!(await viewerApi.from('components').insert({ project_id: project.id, name: 'Nope' })).error,
  "viewer's direct insert is refused",
)
await viewerApi.from('issues').update({ component_id: null }).eq('id', i2.id)
expect((await componentOf(i2.id)) === header.id, "viewer's direct update cannot detach an issue")
await sleep(400)
await vc.close()

await browser.close()
await api.from('projects').delete().eq('id', project.id)
console.log(`\naxe total violations: ${violations}; failures: ${failures}`)
process.exit(failures || violations ? 1 : 0)
