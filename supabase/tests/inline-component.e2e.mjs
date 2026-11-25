// End-to-end check of creating a component from the issue form's Component select ("+ New component…") in the
// add form, the issue view's edit form and a page card's edit form: the nested dialog, Cancel/Escape restoring
// the selection, the inline duplicate-name error, focus returning to the select and the rest of the form being
// kept. Also checks that the dashboard's Components section is always shown, with an empty state for owners
// and viewers.
// Needs a local stack (`supabase start`), the app built against it and served on HUB_URL (see
// sign-in-link-scanner.e2e.mjs) and Playwright + @supabase/supabase-js.
// Run: SUPABASE_SECRET_KEY=<secret key> SUPABASE_ANON_KEY=<publishable key> node supabase/tests/inline-component.e2e.mjs
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
const NEW = '+ New component…'
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
const home = await one(api.from('pages').insert({ project_id: project.id, name: 'Home' }).select().single())
const first = await one(
  api
    .from('issues')
    .insert({ project_id: project.id, page_id: home.id, number: 1, description: 'Cart count is not announced' })
    .select()
    .single(),
)
await one(api.from('project_viewers').insert({ project_id: project.id, email: VIEWER }))
const componentByName = async (name) =>
  (await one(api.from('components').select('id, name, description').eq('project_id', project.id))).find(
    (c) => c.name === name,
  )
const issueRow = async (number) =>
  one(api.from('issues').select('*').eq('project_id', project.id).eq('number', number).single())
const dashboardUrl = `${BASE}/audit-hub#/projects/${project.id}`
const pageUrl = `${dashboardUrl}/pages/${home.id}`

// ─── Browser helpers ───
const browser = await chromium.launch()
const size = { width: 1280, height: 900 }
async function session(email) {
  const ctx = await browser.newContext({ viewport: size, ...(VIDEO ? { recordVideo: { dir: VIDEO, size } } : {}) })
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
async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` })
}
const h1 = (page) => page.getByRole('heading', { level: 1 })
const componentsSection = (page) => page.getByRole('region', { name: 'Components' })
const selectedLabel = (select) => select.evaluate((el) => el.options[el.selectedIndex]?.text ?? '')
const isFocused = (loc) => loc.evaluate((el) => el === document.activeElement)
/** Picks "+ New component…" the way a user would: focus the select, then choose the option. */
async function chooseNew(page, select) {
  await select.scrollIntoViewIfNeeded()
  await select.hover()
  await select.focus()
  await select.selectOption({ label: NEW })
  const dialog = page.getByRole('dialog', { name: 'Add component' })
  await dialog.waitFor()
  return dialog
}

// ─── Owner ───
const { ctx: oc, page: o } = await session(OWNER)

// 1. Empty Components section on the dashboard
await o.goto(dashboardUrl)
await h1(o).filter({ hasText: project.name }).waitFor()
const ownerSection = componentsSection(o)
await ownerSection.scrollIntoViewIfNeeded()
expect(await ownerSection.getByRole('heading', { name: 'Components' }).isVisible(), 'owner sees the Components section with no components')
expect((await ownerSection.getByText('No components yet.').count()) === 1, 'owner sees the "No components yet" empty state')
expect(await ownerSection.getByRole('button', { name: 'Add component' }).isVisible(), 'owner empty state offers Add component')
await both(o, 'owner dashboard, no components')
await ownerSection.evaluate((el) => el.scrollIntoView({ block: 'center' }))
await shot(o, 'owner-empty-components-section')

// 2. Add form: create a component from the select
await o.goto(pageUrl)
await h1(o).filter({ hasText: 'Home' }).waitFor()
await click(o.getByRole('button', { name: 'Add issue' }))
const addForm = o.getByRole('dialog', { name: 'Add issue' })
await addForm.getByLabel('Description').fill('Search button has no accessible name')
await addForm.getByLabel('Location or element').fill('Header search')
await addForm.getByRole('checkbox', { name: 'Site-wide issue' }).check()
const addSelect = addForm.getByRole('combobox', { name: 'Component' })
const opts1 = (await addSelect.locator('option').allInnerTexts()).map((t) => t.trim())
expect(opts1.join('|') === `None|${NEW}`, 'owner sees "+ New component…" after the components')
expect(
  (await addSelect.evaluate((el) => document.getElementById(el.getAttribute('aria-describedby')).textContent)).includes(
    'Choose "+ New component…"',
  ),
  'hint points owners to "+ New component…" when there are none',
)

let nested = await chooseNew(o, addSelect)
expect(await isFocused(nested.getByLabel('Component name')), 'the new component dialog focuses the name field')
expect((await nested.innerText()).includes('selected for this issue'), 'dialog explains the component will be selected')
await click(nested.getByRole('button', { name: 'Cancel' }))
await nested.waitFor({ state: 'detached' })
await sleep(100)
expect((await addSelect.inputValue()) === '' && (await selectedLabel(addSelect)) === 'None', 'Cancel restores the previous selection')
expect(await isFocused(addSelect), 'Cancel returns focus to the Component select')
expect(await addForm.isVisible(), 'Cancel keeps the issue form open')

nested = await chooseNew(o, addSelect)
await o.keyboard.press('Escape')
await nested.waitFor({ state: 'detached' })
await sleep(100)
expect(await addForm.isVisible(), 'Escape closes only the new component dialog')
expect((await addSelect.inputValue()) === '' && (await isFocused(addSelect)), 'Escape restores the selection and focus')

nested = await chooseNew(o, addSelect)
await nested.getByLabel('Component name').fill('Site header')
await nested.getByLabel('Description').fill('Logo, search and main navigation.')
await both(o, 'new component dialog over the issue form')
await shot(o, 'new-component-dialog-from-select')
await click(nested.getByRole('button', { name: 'Add component' }))
await nested.waitFor({ state: 'detached' })
await sleep(100)
const header = await componentByName('Site header')
expect(!!header && header.description === 'Logo, search and main navigation.', 'saving creates the component')
expect((await addSelect.inputValue()) === header.id, 'the new component is selected on the issue')
expect(await isFocused(addSelect), 'saving returns focus to the Component select')
expect(
  (await addForm.getByLabel('Description').inputValue()) === 'Search button has no accessible name' &&
    (await addForm.getByLabel('Location or element').inputValue()) === 'Header search' &&
    (await addForm.getByRole('checkbox', { name: 'Site-wide issue' }).isChecked()),
  'the rest of the unsaved issue form is kept',
)
expect(
  (await addForm.locator('[role="status"]').allInnerTexts()).some((t) => t.includes('"Site header" added and selected')),
  'the new selection is announced',
)
await shot(o, 'new-component-selected-in-issue-form')

// 3. Duplicate name: inline error, Cancel keeps the selection
nested = await chooseNew(o, addSelect)
const nameField = nested.getByLabel('Component name')
await nameField.fill('site HEADER')
await click(nested.getByRole('button', { name: 'Add component' }))
await nested.getByText('already has a component named "site HEADER"').waitFor()
expect((await nameField.getAttribute('aria-invalid')) === 'true', 'duplicate name marks the field invalid')
expect(
  (await nameField.evaluate((el) => document.getElementById(el.getAttribute('aria-describedby'))?.textContent ?? '')).includes(
    'Choose another name',
  ),
  'the duplicate-name error is attached to the name field',
)
expect(await isFocused(nameField), 'focus stays on the name field after the error')
await both(o, 'duplicate component name error')
await shot(o, 'duplicate-component-name-inline-error')
await click(nested.getByRole('button', { name: 'Cancel' }))
await nested.waitFor({ state: 'detached' })
expect((await addSelect.inputValue()) === header.id, 'cancelling after an error keeps the earlier selection')
await click(addForm.getByRole('button', { name: 'Add issue' }))
await addForm.waitFor({ state: 'detached' })
const second = await issueRow(2)
expect(
  second.component_id === header.id && second.location === 'Header search' && second.site_wide === true,
  'the issue saves with the new component and the rest of the form',
)

// 4. Edit from the issue view
await o.goto(`${pageUrl}/issues/${first.id}`)
await h1(o).filter({ hasText: 'Cart count' }).waitFor()
await click(o.getByRole('button', { name: 'Edit issue' }))
let editForm = o.getByRole('dialog', { name: 'Edit issue #1' })
await editForm.getByLabel('Fix').fill('Announce the new count in a polite live region.')
let editSelect = editForm.getByRole('combobox', { name: 'Component' })
nested = await chooseNew(o, editSelect)
await nested.getByLabel('Component name').fill('Cart drawer')
await click(nested.getByRole('button', { name: 'Add component' }))
await nested.waitFor({ state: 'detached' })
const drawer = await componentByName('Cart drawer')
expect((await editSelect.inputValue()) === drawer.id && (await isFocused(editSelect)), 'issue view edit: new component is selected and focused')
expect((await editForm.getByLabel('Fix').inputValue()).startsWith('Announce'), 'issue view edit: unsaved fix text is kept')
await click(editForm.getByRole('button', { name: 'Save issue' }))
await editForm.waitFor({ state: 'detached' })
await o.locator('dl div').filter({ hasText: /^Component/ }).getByRole('link', { name: 'Cart drawer' }).waitFor()
const firstRow = await issueRow(1)
expect(firstRow.component_id === drawer.id && firstRow.fix.startsWith('Announce'), 'issue view edit saves the new component')

// 5. Edit from a card on the page
await o.goto(pageUrl)
await h1(o).filter({ hasText: 'Home' }).waitFor()
await click(o.getByRole('button', { name: 'Edit issue #2' }))
editForm = o.getByRole('dialog', { name: 'Edit issue #2' })
editSelect = editForm.getByRole('combobox', { name: 'Component' })
expect((await selectedLabel(editSelect)) === 'Site header', 'card edit form shows the current component')
nested = await chooseNew(o, editSelect)
await click(nested.getByRole('button', { name: 'Cancel' }))
await nested.waitFor({ state: 'detached' })
expect((await selectedLabel(editSelect)) === 'Site header', 'card edit: Cancel restores the current component')
nested = await chooseNew(o, editSelect)
await nested.getByLabel('Component name').fill('Search overlay')
await click(nested.getByRole('button', { name: 'Add component' }))
await nested.waitFor({ state: 'detached' })
expect((await selectedLabel(editSelect)) === 'Search overlay', 'card edit: the new component is selected')
await click(editForm.getByRole('button', { name: 'Save issue' }))
await editForm.waitFor({ state: 'detached' })
expect((await issueRow(2)).component_id === (await componentByName('Search overlay')).id, 'card edit saves the new component')
await sleep(400)
await oc.close()

// ─── Viewer: the Components section is present when empty ───
const empty = await one(api.from('projects').insert({ name: `Empty project ${run}` }).select().single())
await one(api.from('project_viewers').insert({ project_id: empty.id, email: VIEWER }))
const { ctx: vc, page: v } = await session(VIEWER)
await v.goto(`${BASE}/audit-hub#/projects/${empty.id}`)
await h1(v).filter({ hasText: empty.name }).waitFor()
const viewerSection = componentsSection(v)
await viewerSection.scrollIntoViewIfNeeded()
expect(await viewerSection.getByRole('heading', { name: 'Components' }).isVisible(), 'viewer sees the Components section with no components')
expect(
  (await viewerSection.getByText('No components have been added to this project yet.').count()) === 1,
  'viewer sees a short empty-state line',
)
expect((await viewerSection.getByRole('button').count()) === 0, 'viewer has no Add component button')
await both(v, 'viewer dashboard, no components')
await viewerSection.evaluate((el) => el.scrollIntoView({ block: 'center' }))
await shot(v, 'viewer-empty-components-section')
await v.goto(dashboardUrl)
await h1(v).filter({ hasText: project.name }).waitFor()
expect((await componentsSection(v).getByRole('link', { name: 'Site header' }).count()) === 1, 'viewer sees components once they exist')
expect((await v.getByRole('option', { name: NEW }).count()) === 0, 'viewer never sees "+ New component…"')
await sleep(400)
await vc.close()

await browser.close()
await api.from('projects').delete().in('id', [project.id, empty.id])
console.log(`\naxe total violations: ${violations}; failures: ${failures}`)
process.exit(failures || violations ? 1 : 0)
