import { _electron as electron } from 'playwright'
import executablePath from 'electron'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const profile = await mkdtemp(join(tmpdir(), 'apply-pilot-light-chat-'))
const env = { ...process.env, APPLY_PILOT_DATA_DIR: profile }
delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
const fixture = await readFile('tests/fixtures/boss-light-chat.html', 'utf8')
let app
const snapshot = page => page.evaluate(() => window.desktop.command({ type: 'snapshot' }))
async function waitFor(page, predicate) {
  const end = Date.now() + 25_000
  while (Date.now() < end) {
    const state = await snapshot(page)
    if (predicate(state)) return state
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('Light chat regression timed out')
}
try {
  app = await electron.launch({ executablePath, args: ['.'], env })
  const page = await app.firstWindow()
  await page.getByRole('heading', { name: 'Boss 直聘工作台' }).waitFor()
  await app.context().route('https://www.zhipin.com/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixture }))
  const state = await snapshot(page)
  await page.evaluate(settings => window.desktop.command({ type: 'save-ai', settings }), { ...state.ai, enabled: false })
  await page.getByLabel('补充消息（选填）').fill('回归定制消息')
  await page.evaluate(() => window.desktop.command({ type: 'open', platform: 'boss' }))
  await waitFor(page, s => s.auth === 'signed-in')
  const remote = app.context().pages().find(p => p !== page)
  const listPageId = await remote.evaluate(() => { const id=crypto.randomUUID(); window.listPageId=id; localStorage.setItem('historical','yes'); localStorage.setItem('move-input','yes'); return id })
  await page.getByRole('button', { name: '开始投递', exact: true }).click()
  const result = await waitFor(page, s => ['completed', 'failed'].includes(s.task.status))
  assert.equal(result.task.status, 'completed', `The native BOSS lightweight chat is already open: ${result.task.message}`)
  assert.equal(result.task.sent, 1)
  assert.equal(await remote.evaluate(() => localStorage.getItem('contact')), '1', 'Never click the background continue button under an open dialog')
  assert.equal(await remote.evaluate(() => localStorage.getItem('custom')), '1')
  assert.equal(result.history.at(-1).status, 'greeted')
  assert.equal(result.history.at(-1).job.title, '前端开发', 'The job-title container includes salary; read its job-name child first')
  assert.equal(result.history.at(-1).job.company, '回归公司')
  assert.equal(result.history.at(-1).job.recruiterName, '测试 HR', 'A company-only card is not a recruiter; read the recruiter from job-boss-info without its activity label')
  assert.deepEqual(await remote.evaluate(() => JSON.parse(localStorage.getItem('trace'))), ['select','detail-open','contact','input','send'])
  assert.equal(app.context().pages().length, 2, 'The independent detail page closes after delivery')
  assert.ok(remote.url().includes('/web/geek/jobs'))
  assert.notEqual(await remote.evaluate(() => window.listPageId), listPageId, 'Start resets home before searching')
  assert.equal(await remote.evaluate(() => window.listPageId === localStorage.getItem('selectedDocument')), true, 'Opening and closing details must preserve the list document')
  console.log('BOSS delivery sequence passed: select list card, read more-info link, independent detail page, one contact click, lightweight chat input, fill, send, confirm a new message and close detail back to the original list. Also covers moving input, historical identical messages and no background re-click. Fixture only.')
} finally {
  await app?.close().catch(() => {})
  await rm(profile, { recursive: true, force: true })
}
