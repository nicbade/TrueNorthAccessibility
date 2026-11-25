// End-to-end check of component screenshots: adding them in the add component dialog (alt text required), in
// the "+ New component…" dialog from an issue form and from the component view; the click-to-enlarge viewer;
// removing a screenshot or deleting the component removing the files; and view-only clients seeing the
// screenshots without being able to change them.
// Needs a local stack (`supabase start`), the app built against it and served on HUB_URL (see
// sign-in-link-scanner.e2e.mjs) and Playwright + @supabase/supabase-js.
// Run: SUPABASE_SECRET_KEY=<secret key> SUPABASE_ANON_KEY=<publishable key> [FIXTURE_IMAGE=<png>] \
//   node supabase/tests/component-screenshots.e2e.mjs
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
const BUCKET = 'audit-screenshots'
if (!SECRET || !PUBLISHABLE) throw new Error('Set SUPABASE_SECRET_KEY and SUPABASE_ANON_KEY')
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const png = fs.readFileSync(process.env.FIXTURE_IMAGE ?? new URL('../../public/og-image.png', import.meta.url))
const file = (name) => ({ name, mimeType: 'image/png', buffer: png })

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
const home = await one(api.from('pages').insert({ project_id: project.id, name: 'Home' }).select().single())
await one(api.from('project_viewers').insert({ project_id: project.id, email: VIEWER }))
const componentByName = async (name) =>
  (await one(api.from('components').select('id, name').eq('project_id', project.id))).find((c) => c.name === name)
const imagesOf = async (componentId) =>
  one(api.from('component_images').select('*').eq('component_id', componentId).order('position'))
const fileExists = async (path) => !(await admin.storage.from(BUCKET).download(path)).error
const dashboardUrl = `${BASE}/audit-hub#/projects/${project.id}`
const componentUrl = (id) => `${dashboardUrl}/components/${id}`

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
async function shot(page, name, full = false) {
  if (!SHOTS) return
  if (full) await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full })
}
const h1 = (page) => page.getByRole('heading', { level: 1 })
const isFocused = (loc) => loc.evaluate((el) => el === document.activeElement)
/** Chooses files the way the "Add screenshots" button does, through the dialog's hidden file input. */
async function addScreenshots(dialog, names) {
  await dialog.getByRole('button', { name: 'Add screenshots' }).hover()
  await dialog.locator('input[type="file"]').setInputFiles(names.map(file))
  await dialog.getByLabel(`Alt text for screenshot ${names.length}`, { exact: false }).last().waitFor()
}

// ─── Owner ───
const { ctx: oc, page: o } = await session(OWNER)
await o.goto(dashboardUrl)
await h1(o).filter({ hasText: project.name }).waitFor()

// 1. Add component dialog: alt text is required
await click(o.getByRole('button', { name: 'Add component' }))
let form = o.getByRole('dialog', { name: 'Add component' })
await form.getByLabel('Component name').fill('Site header')
await addScreenshots(form, ['header-desktop.png'])
const alt1 = form.getByRole('textbox', { name: 'Alt text for screenshot 1' })
expect((await alt1.getAttribute('aria-required')) === 'true', 'component screenshot alt text is marked required')
await click(form.getByRole('button', { name: 'Add component' }))
await form.getByText('Describe screenshot 1.').waitFor()
expect(
  (await alt1.getAttribute('aria-invalid')) === 'true' && (await isFocused(alt1)),
  'saving without alt text flags the field and focuses it',
)
expect(!(await componentByName('Site header')), 'nothing is saved until every screenshot is described')
await both(o, 'add component dialog, missing alt text')
await shot(o, 'component-screenshot-alt-required')
await alt1.fill('Desktop header: logo, search box, account and cart icons above the main navigation')
expect((await form.getByText('Describe screenshot 1.').count()) === 0, 'describing the screenshot clears the error')
await click(form.getByRole('button', { name: 'Add component' }))
await form.waitFor({ state: 'detached' })
const header = await componentByName('Site header')
let headerImages = await imagesOf(header.id)
expect(
  headerImages.length === 1 &&
    headerImages[0].alt.startsWith('Desktop header') &&
    headerImages[0].storage_path.startsWith(`${project.id}/components/${header.id}/`),
  'the screenshot is saved with its alt text under the component path',
)
expect(await fileExists(headerImages[0].storage_path), 'the screenshot file is uploaded')

// 2. Component view and the enlarge viewer
await click(o.getByRole('region', { name: 'Components' }).getByRole('link', { name: 'Site header' }))
await h1(o).filter({ hasText: 'Site header' }).waitFor()
const shots = o.getByRole('region', { name: /^Screenshots/ })
const enlarge = shots.getByRole('button', { name: /Enlarge screenshot 1/ })
await enlarge.locator('img').waitFor()
expect(
  (await enlarge.locator('img').getAttribute('alt')).startsWith('Desktop header'),
  'component view shows the screenshot with its alt text',
)
await o.waitForFunction(() => [...document.querySelectorAll('main img')].every((i) => i.complete && i.naturalWidth > 0))
await both(o, 'owner component view with screenshot')
await shot(o, 'owner-component-view-screenshots', true)
await click(enlarge)
const viewer = o.getByRole('dialog', { name: 'Site header screenshot 1 of 1' })
await viewer.waitFor()
expect((await viewer.innerText()).includes('Alt text: Desktop header'), 'the viewer shows the alt text')
await both(o, 'component screenshot viewer')
await shot(o, 'component-screenshot-viewer')
await click(viewer.getByRole('button', { name: 'Close', exact: true }))
await viewer.waitFor({ state: 'detached' })
expect(await isFocused(enlarge), 'closing the viewer returns focus to the screenshot')

// 3. From the component view: add a second screenshot, then remove the first
await click(shots.getByRole('button', { name: 'Add or edit screenshots' }))
form = o.getByRole('dialog', { name: 'Screenshots of Site header' })
expect(!(await form.getByLabel('Component name').isVisible()), 'the screenshots dialog shows only the screenshots')
await addScreenshots(form, ['header-mobile.png'])
await form.getByRole('textbox', { name: 'Alt text for screenshot 2' }).fill('Mobile header with the menu button')
await both(o, 'component screenshots dialog')
await click(form.getByRole('button', { name: 'Save screenshots' }))
await form.waitFor({ state: 'detached' })
await shots.getByRole('button', { name: /Enlarge screenshot 2/ }).waitFor()
headerImages = await imagesOf(header.id)
expect(headerImages.length === 2 && headerImages[1].alt.startsWith('Mobile header'), 'a screenshot added from the component view is saved')
const firstPath = headerImages[0].storage_path
await click(shots.getByRole('button', { name: 'Add or edit screenshots' }))
form = o.getByRole('dialog', { name: 'Screenshots of Site header' })
await click(form.getByRole('button', { name: 'Remove screenshot 1' }))
await click(form.getByRole('button', { name: 'Save screenshots' }))
await form.waitFor({ state: 'detached' })
await o.getByRole('heading', { name: 'Screenshots (1)' }).waitFor()
headerImages = await imagesOf(header.id)
expect(headerImages.length === 1 && headerImages[0].alt.startsWith('Mobile header'), 'removing a screenshot deletes its row')
expect(!(await fileExists(firstPath)), 'removing a screenshot deletes its file')

// 4. "+ New component…" from an issue form, with a screenshot
await o.goto(`${dashboardUrl}/pages/${home.id}`)
await h1(o).filter({ hasText: 'Home' }).waitFor()
await click(o.getByRole('button', { name: 'Add issue' }))
const issueForm = o.getByRole('dialog', { name: 'Add issue' })
await issueForm.getByLabel('Description').fill('Cart count is not announced')
const select = issueForm.getByRole('combobox', { name: 'Component' })
await select.focus()
await select.selectOption({ label: '+ New component…' })
form = o.getByRole('dialog', { name: 'Add component' })
await form.getByLabel('Component name').fill('Cart drawer')
await addScreenshots(form, ['cart-drawer.png'])
await form.getByRole('textbox', { name: 'Alt text for screenshot 1' }).fill('Open cart drawer listing two items')
await both(o, 'new component dialog with screenshot')
await shot(o, 'new-component-dialog-with-screenshot')
await click(form.getByRole('button', { name: 'Add component' }))
await form.waitFor({ state: 'detached' })
const drawer = await componentByName('Cart drawer')
expect((await select.inputValue()) === drawer.id, 'the new component is selected on the issue')
expect(
  (await issueForm.getByRole('textbox', { name: /Alt text for screenshot/ }).count()) === 0,
  "the component's screenshot is not added to the issue",
)
const drawerImages = await imagesOf(drawer.id)
expect(drawerImages.length === 1 && (await fileExists(drawerImages[0].storage_path)), 'the inline dialog saves the screenshot')
await click(issueForm.getByRole('button', { name: 'Add issue' }))
await issueForm.waitFor({ state: 'detached' })

// 5. Deleting a component deletes its screenshot files
await o.goto(componentUrl(drawer.id))
await h1(o).filter({ hasText: 'Cart drawer' }).waitFor()
await click(o.getByRole('button', { name: 'Delete component' }))
const confirm = o.getByRole('dialog', { name: 'Delete component "Cart drawer"?' })
await click(confirm.getByRole('button', { name: 'Delete component' }))
await h1(o).filter({ hasText: project.name }).waitFor()
await sleep(500)
expect((await imagesOf(drawer.id)).length === 0, "deleting a component deletes its screenshots' rows")
expect(!(await fileExists(drawerImages[0].storage_path)), "deleting a component deletes its screenshots' files")
await sleep(400)
await oc.close()

// ─── Viewer ───
const { ctx: vc, page: v } = await session(VIEWER)
await v.goto(componentUrl(header.id))
await h1(v).filter({ hasText: 'Site header' }).waitFor()
const vShots = v.getByRole('region', { name: /^Screenshots/ })
const vEnlarge = vShots.getByRole('button', { name: /Enlarge screenshot 1/ })
await vEnlarge.locator('img').waitFor()
await v.waitForFunction(() => [...document.querySelectorAll('main img')].every((i) => i.complete && i.naturalWidth > 0))
expect(
  await v.evaluate(() => [...document.querySelectorAll('main img')].some((i) => i.naturalWidth > 0)),
  'viewer can load the component screenshot',
)
expect((await vShots.getByRole('button', { name: /Add or edit screenshots|Add screenshots/ }).count()) === 0, 'viewer cannot add or edit screenshots')
await both(v, 'viewer component view with screenshot')
await shot(v, 'viewer-component-view-screenshots', true)
await click(vEnlarge)
await v.getByRole('dialog', { name: 'Site header screenshot 1 of 1' }).waitFor()
expect(true, 'viewer can enlarge the screenshot')
await v.keyboard.press('Escape')
const viewerApi = createClient(API, PUBLISHABLE, opts)
await viewerApi.auth.signInWithPassword({ email: VIEWER, password: PASSWORD })
await viewerApi.from('component_images').delete().eq('id', headerImages[0].id)
expect((await imagesOf(header.id)).length === 1, "viewer's direct delete is refused")
await sleep(400)
await vc.close()

await browser.close()
await api.from('projects').delete().eq('id', project.id)
console.log(`\naxe total violations: ${violations}; failures: ${failures}`)
process.exit(failures || violations ? 1 : 0)
