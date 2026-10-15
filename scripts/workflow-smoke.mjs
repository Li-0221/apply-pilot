import { _electron as electron } from 'playwright'
import electronExecutable from 'electron'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
const profile = await mkdtemp(join(tmpdir(), 'apply-pilot-workflow-'))
const fixture = await readFile('tests/fixtures/boss-workflow.html', 'utf8')
const env = { ...process.env, APPLY_PILOT_DATA_DIR: profile }
delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
const executablePath = process.env.APPLY_PILOT_TEST_EXECUTABLE || electronExecutable
let instance
const snapshot = page => page.evaluate(() => window.desktop.command({ type: 'snapshot' }))
async function waitFor(page, predicate, timeout = 45000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { const state = await snapshot(page); if (predicate(state)) return state; await new Promise(resolve => setTimeout(resolve, 100)) }
  throw new Error('Workflow timed out: ' + JSON.stringify((await snapshot(page)).task))
}
async function launch() {
  const app = await electron.launch({ executablePath, args: process.env.APPLY_PILOT_TEST_EXECUTABLE ? [] : ['.'], env })
  const page = await app.firstWindow()
  await page.getByRole('heading', { name: 'Boss 直聘工作台' }).waitFor()
  const urls = []
  let delayHome = false
  await app.context().route('https://www.zhipin.com/**', async route => { urls.push(route.request().url()); if (delayHome && route.request().url() === 'https://www.zhipin.com/web/geek/jobs') { delayHome = false; await new Promise(resolve => setTimeout(resolve, 1500)) }; return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixture }) })
  return { app, page, urls, delayNextHome: () => { delayHome = true } }
}
const command = (page, value) => page.evaluate(value => window.desktop.command(value), value)
async function open(page) { await command(page, { type: 'open', platform: 'boss' }); await waitFor(page, s => s.auth === 'signed-in') }
async function start(page, settings) { const state = await snapshot(page); return command(page, { type: 'start', settings: { ...state.settings, ...settings } }) }
try {
  instance = await launch()
  let { app, page } = instance
  const state = await snapshot(page)
  await command(page, { type: 'save-ai', settings: { ...state.ai, enabled: false } })
  await open(page)
  let remote = app.context().pages().find(p => p !== page)
  // Add company, recruiter and role blacklists through the authorized IPC boundary.
  for (const entry of [{ kind: 'company', match: 'contains', value: '公司 blocked', label: '屏蔽公司' }, { kind: 'recruiter', match: 'exact', value: 'id:recruiter', label: '屏蔽 HR' }, { kind: 'job', match: 'exact', value: 'id:role', label: '屏蔽岗位' }]) await command(page, { type: 'add-blacklist', entry: { platform: 'boss', ...entry } })
  await start(page, { keyword: '前端,React', city: '成都,上海', limit: 4, intervalSeconds: 3, hrMaxDays: 7, hrUnknown: 'skip', message: '定制测试消息', filters: { jobType: '1901', salary: '406', experience: '105', degree: '203', scale: '303', industry: '0', stage: '807' } })
  const batch = await waitFor(page, s => ['completed', 'failed'].includes(s.task.status), 90000)
  assert.equal(batch.task.status, 'completed', batch.task.message)
  assert.equal(batch.task.sent, 4, JSON.stringify(batch.history.map(r => ({ id: r.job.id, detail: r.detail }))))
  for (const id of ['active-a', 'active-b', 'active-c', 'active-d']) {
    assert.equal(await remote.evaluate(id => localStorage.getItem('contact-' + id), id), '1')
    assert.equal(await remote.evaluate(id => localStorage.getItem('message-' + id), id), '1', 'A historical identical message cannot count as this send')
    assert.equal(await remote.evaluate(id => localStorage.getItem('resume-' + id), id), null, 'The app must never send attachments')
    assert.equal(batch.applications.find(r => r.job.id === id).status, 'greeted')
  }
  for (const id of ['stale', 'unknown', 'blocked', 'recruiter', 'role']) assert.equal(await remote.evaluate(id => localStorage.getItem('contact-' + id), id), null)
  assert.ok(batch.history.some(r => r.job.id === 'stale' && r.detail.includes('活跃')))
  assert.ok(batch.history.some(r => r.job.id === 'unknown' && r.detail.includes('未知')))
  assert.ok(instance.urls.some(url => new URL(url).searchParams.get('query') === 'React'))
  assert.ok(instance.urls.some(url => new URL(url).searchParams.get('city') === '101020100'))
  assert.ok(instance.urls.filter(url => url.includes('/web/geek/jobs')).every(url => new URL(url).searchParams.get('salary') === '406' || !url.includes('?')))
  // The public UI exposes full JD and filters rather than replacing attempt history.
  await page.getByRole('button', { name: '投递记录', exact: true }).click()
  await page.getByRole('textbox', { name: '筛选投递记录' }).fill('active-c')
  await page.getByRole('button', { name: '详情', exact: true }).click()
  await page.getByText('完整岗位要求：React、TypeScript。active-c', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: '拉黑招聘者', exact: true }).click()
  assert.ok((await snapshot(page)).blacklist.some(e => e.value === 'id:active-c'))
  await page.getByRole('button', { name: '黑名单', exact: true }).click()
  await page.getByLabel('名称包含', { exact: true }).fill('临时屏蔽')
  await page.getByRole('button', { name: '添加', exact: true }).click()
  await page.getByRole('row').filter({ hasText: '临时屏蔽' }).getByRole('button', { name: '移除' }).click()
  assert.equal((await snapshot(page)).blacklist.some(e => e.value === '临时屏蔽'), false)
  // Stop ends the task. Restart stays idle, and a new start always visits home first.
  await remote.evaluate(() => localStorage.setItem('phase', 'recover'))
  await remote.goto('https://www.zhipin.com/web/geek/jobs')
  await page.getByRole('button', { name: '工作台', exact: true }).click()
  await start(page, { keyword: '', city: '', limit: 2, hrMaxDays: 0, message: '', intervalSeconds: 10 })
  await waitFor(page, s => s.task.sent === 1)
  await page.getByRole('button', { name: '停止投递', exact: true }).click()
  await waitFor(page, s => s.task.status === 'stopped')
  assert.equal(await remote.evaluate(() => localStorage.getItem('contact-recover-b')), null)
  const taskId = (await snapshot(page)).task.id
  await app.close()
  instance = await launch(); ({ app, page } = instance)
  let restored = await snapshot(page)
  assert.equal(restored.task.status, 'idle')
  assert.equal(restored.tasks.find(t => t.id === taskId).state.sent, 1)
  assert.equal(restored.blacklist.length, 4)
  await open(page)
  remote = app.context().pages().find(p => p !== page)
  assert.equal(await remote.evaluate(() => localStorage.getItem('contact-recover-b')), null, 'Restart must never resume automatically')
  instance.urls.length = 0
  await start(page, { limit: 1, intervalSeconds: 3 })
  restored = await waitFor(page, s => ['completed', 'failed'].includes(s.task.status))
  assert.equal(instance.urls[0], 'https://www.zhipin.com/web/geek/jobs', 'Every start visits home before searching')
  assert.equal(restored.task.status, 'completed', restored.task.message)
  assert.notEqual(restored.task.id, taskId)
  assert.equal(restored.task.sent, 1)
  for (const id of ['recover-a', 'recover-b']) assert.equal(await remote.evaluate(id => localStorage.getItem('contact-' + id), id), '1')
  // A pending message remains uncertain and blocks any automatic resend.
  await remote.evaluate(() => localStorage.setItem('phase', 'pending'))
  await remote.goto('https://www.zhipin.com/web/geek/jobs')
  await start(page, { limit: 1, message: '等待中的测试消息' })
  await remote.waitForFunction(() => localStorage.getItem('message-pending') === '1')
  await command(page, { type: 'stop' })
  const stopped = await waitFor(page, s => s.task.status === 'stopped')
  assert.equal(stopped.applications.find(r => r.job.id === 'pending').status, 'uncertain')
  await start(page, { message: '' })
  const dedup = await waitFor(page, s => s.task.status === 'completed')
  assert.equal(dedup.task.sent, 0)
  assert.equal(await remote.evaluate(() => localStorage.getItem('contact-pending')), '1')
  assert.ok(dedup.history.some(r => r.job.id === 'pending' && r.skipCategory === 'duplicate'))
  assert.equal(dedup.applications.find(r => r.job.id === 'pending').status, 'uncertain')
  instance.delayNextHome()
  const starting = start(page, { message: '' })
  await waitFor(page, s => s.task.message === '正在打开岗位首页')
  await page.getByRole('button', { name: '停止投递', exact: true }).click()
  await starting
  await waitFor(page, s => s.task.status === 'stopped')
  assert.equal(await remote.evaluate(() => localStorage.getItem('contact-pending')), '1')
  await page.getByRole('button', { name: '投递记录', exact: true }).click()
  await page.locator('#record-status').click()
  await page.getByRole('option', { name: '待核实', exact: true }).click()
  await page.getByText('前端 pending', { exact: true }).waitFor()
  await mkdir(resolve('.test-artifacts'), { recursive: true })
  await page.screenshot({ path: resolve('.test-artifacts/workflow-records.png') })
  console.log('Workflow smoke passed: keyword/city queue, lazy loading, URL filters, HR exclusions, three blacklist scopes, popup and inline chats, native contenteditable input, no-receipt message confirmation, no attachment sends, full JD, start from home, stop during home loading, process restart without auto-resume, pending-send cancellation, durable deduplication and attempt history. Fixture jobs only.')
} finally {
  if (instance) { const child = instance.app.process(); const timer = setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL') }, 5000); try { await instance.app.close().catch(() => {}) } finally { clearTimeout(timer) } }
  await rm(profile, { recursive: true, force: true })
}
