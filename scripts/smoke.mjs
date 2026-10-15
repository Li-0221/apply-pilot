import { _electron as electron } from 'playwright'
import electronExecutable from 'electron'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { resumeDocx, resumePdf } from '../tests/fixtures/resume.mjs'

const profile = await mkdtemp(join(tmpdir(), 'apply-pilot-electron-'))
const artifacts = resolve('.test-artifacts')
await mkdir(artifacts, { recursive: true })
const env = { ...process.env, APPLY_PILOT_DATA_DIR: profile }
const executablePath = process.env.APPLY_PILOT_TEST_EXECUTABLE || electronExecutable
delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_RENDERER_URL
const fixture = await readFile('tests/fixtures/boss.html', 'utf8')
const aiRequests = []
let failAi = true
let resumeMode = 'normal'
let resumeRequests = 0
const importedMarkdown = '# 测试候选人\n\n## 技能\n- React 和 TypeScript 项目经验'
const aiServer = createServer(async (request, response) => {
  let body = ''
  for await (const chunk of request) body += chunk
  const input = JSON.parse(body)
  aiRequests.push({ input, authorization: request.headers.authorization })
  if (input.messages.length === 1) {
    response.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }))
    return
  }
  const data = JSON.parse(input.messages[1].content)
  if (data.resumeText) {
    resumeRequests++
    if (resumeMode === 'hold') return
    if (resumeMode === 'fail') { response.writeHead(503); response.end('fixture failure'); return }
    response.end(JSON.stringify({ choices: [{ message: { content: importedMarkdown } }] }))
    return
  }
  if (failAi && data.job.title === 'AI 重试岗位') { response.writeHead(503); response.end('fixture failure'); return }
  const matched = data.job.title !== 'AI 不匹配岗位'
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ matched, score: matched ? 92 : 20,
    reason: matched ? '简历与 React 岗位匹配' : '简历与岗位要求不匹配', greeting: matched ? `您好，我有 React 项目经验，希望应聘${data.job.title}。` : '' }) } }] }))
})
aiServer.listen(0, '127.0.0.1')
await once(aiServer, 'listening')
const aiUrl = `http://127.0.0.1:${aiServer.address().port}/v1`
let instance
async function launch() {
  const app = await electron.launch({ executablePath, args: process.env.APPLY_PILOT_TEST_EXECUTABLE ? [] : ['.'], cwd: process.cwd(), env, timeout: 30_000 })
  const page = await app.firstWindow()
  await page.getByRole('heading', { name: 'Boss 直聘工作台' }).waitFor()
  await app.context().route('https://www.zhipin.com/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixture }))
  return { app, page }
}
const snapshot = page => page.evaluate(() => window.desktop.command({ type: 'snapshot' }))
async function waitFor(page, predicate) {
  for (let i = 0; i < 200; i++) { const state = await snapshot(page); if (predicate(state)) return state; await new Promise(resolve => setTimeout(resolve, 100)) }
  throw new Error('Timed out waiting for desktop state: ' + JSON.stringify((await snapshot(page)).task))
}
async function start(page, overrides = {}) {
  await page.evaluate(async overrides => { const state = await window.desktop.command({ type: 'snapshot' }); await window.desktop.command({ type: 'start', settings: { ...state.settings, ...overrides } }) }, overrides)
}
try {
  instance = await launch()
  const { app, page } = instance
  await page.evaluate(async () => { const state = await window.desktop.command({ type: 'snapshot' }); await window.desktop.command({ type: 'save-ai', settings: { ...state.ai, enabled: false } }) })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.screenshot({ path: join(artifacts, 'workspace.png') })
  await page.getByRole('button', { name: '打开 Boss 直聘', exact: true }).click()
  await waitFor(page, state => state.browser.opened && !state.browser.loading)
  let remote = app.context().pages().find(value => value !== page && value.url().startsWith('https://www.zhipin.com'))
  assert.ok(remote)
  assert.equal(await remote.evaluate(() => typeof window.desktop), 'undefined')
  assert.equal(await remote.evaluate(() => typeof require), 'undefined')
  assert.equal((await snapshot(page)).auth, 'signed-out')
  await remote.waitForFunction(() => innerWidth >= 1140)
  await page.getByRole('button', { name: '收起浏览器', exact: true }).click()
  await remote.getByRole('button', { name: '测试夹具：登录' }).click()
  await page.getByRole('button', { name: '检查登录', exact: true }).click()
  await waitFor(page, state => state.auth === 'signed-in')
  await page.getByRole('button', { name: '保存会话', exact: true }).click()
  await waitFor(page, state => Boolean(state.savedAt))
  assert.ok((await readFile(join(profile, 'boss-session.enc'))).length > 0)
  assert.equal((await readFile(join(profile, 'boss-session.enc'))).includes(Buffer.from('persist-check')), false)
  // Exercise the actual Start button, not a developer-only route.
  await page.getByRole('button', { name: '开始投递', exact: true }).click()
  let completed = await waitFor(page, state => ['completed', 'failed'].includes(state.task.status))
  assert.equal(completed.task.status, 'completed', completed.task.message)
  assert.equal(completed.task.sent, 1)
  assert.equal(completed.applications.find(r => r.job.id === 'existing').status, 'skipped')
  assert.equal(completed.applications.find(r => r.job.id === 'one').status, 'greeted')
  assert.equal(await remote.evaluate(() => localStorage.getItem('fixture-resume-click-one')), null, 'Disabled resume button must never be clicked')
  assert.equal(await remote.evaluate(() => localStorage.getItem('fixture-contact-one')), '1')
  await start(page, { message: '测试补充消息' })
  completed = await waitFor(page, state => ['completed', 'failed'].includes(state.task.status))
  assert.equal(completed.task.status, 'completed', completed.task.message)
  assert.equal(completed.applications.find(r => r.job.id === 'two').status, 'greeted')
  assert.equal(await remote.evaluate(() => localStorage.getItem('fixture-contact-two')), '1')
  assert.equal(await remote.evaluate(() => localStorage.getItem('fixture-message-two')), '1')
  assert.equal(await remote.evaluate(() => localStorage.getItem('fixture-resume-two')), null, 'Attachment sending has been removed')
  await page.getByRole('button', { name: '投递记录', exact: true }).click()
  await page.getByText('测试岗位 2', { exact: true }).waitFor()
  await page.screenshot({ path: join(artifacts, 'applications-fixture.png') })
  await page.getByRole('textbox', { name: '筛选投递记录' }).fill('不存在的岗位')
  await page.getByText('没有匹配的记录', { exact: true }).waitFor()
  await page.getByRole('button', { name: '清空筛选' }).click()
  // Cancel after the site accepted a contact but before it returns confirmation.
  await remote.evaluate(() => localStorage.setItem('fixture-third', 'yes'))
  await start(page, { message: '' })
  await remote.waitForFunction(() => localStorage.getItem('fixture-contact-three') === '1')
  await page.evaluate(() => window.desktop.command({ type: 'stop' }))
  const stopped = await waitFor(page, state => state.task.status === 'stopped')
  assert.equal(stopped.applications.find(r => r.job.id === 'three').status, 'uncertain')
  await start(page)
  completed = await waitFor(page, state => ['completed', 'failed'].includes(state.task.status))
  assert.equal(completed.task.sent, 0, 'A cancelled/uncertain contact must not be retried')
  assert.equal(await remote.evaluate(() => localStorage.getItem('fixture-contact-three')), '1')
  // A greeting-only batch must dismiss the previous success dialog before selecting the next job.
  await remote.evaluate(() => localStorage.setItem('fixture-simple', 'yes'))
  await remote.goto('https://www.zhipin.com/web/geek/jobs')
  await start(page, { limit: 2, message: '' })
  completed = await waitFor(page, state => ['completed', 'failed'].includes(state.task.status))
  assert.equal(completed.task.status, 'completed', completed.task.message)
  assert.equal(completed.task.sent, 2)
  for (const id of ['simple-a', 'simple-b']) {
    assert.equal(await remote.evaluate(id => localStorage.getItem('fixture-contact-' + id), id), '1')
    assert.equal(completed.applications.find(r => r.job.id === id).status, 'greeted')
  }
  // Exercise the AI form and a local compatible provider, never a user's real credentials.
  await remote.evaluate(() => localStorage.setItem('fixture-ai', 'yes'))
  await remote.goto('https://www.zhipin.com/web/geek/jobs')
  await page.getByRole('button', { name: 'AI 与简历', exact: true }).click()
  await page.getByRole('checkbox', { name: 'AI 筛选与定制消息' }).check()
  await page.getByRole('textbox', { name: 'Base URL', exact: true }).fill(aiUrl)
  await page.locator('#ai-key').fill('fixture-ai-secret')
  await page.getByRole('textbox', { name: '模型', exact: true }).fill('fixture-model')
  await page.locator('#ai-resume').fill('测试候选人：有 React 和 TypeScript 项目经验。')
  await page.getByRole('button', { name: '测试连接', exact: true }).click()
  await page.getByText('连接成功', { exact: true }).waitFor()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await waitFor(page, state => state.ai.enabled && state.ai.keyConfigured)
  await page.screenshot({ path: join(artifacts, 'ai-settings-fixture.png') })
  assert.equal(await page.locator('#ai-key').inputValue(), '')
  assert.equal(JSON.stringify(await snapshot(page)).includes('fixture-ai-secret'), false)
  assert.equal((await readFile(join(profile, 'workspace.json'), 'utf8')).includes('fixture-ai-secret'), false)
  assert.equal((await readFile(join(profile, 'ai-key.enc'))).includes(Buffer.from('fixture-ai-secret')), false)
  // Import actual binary documents through the user-facing file input, then edit before saving.
  const previousResume = (await snapshot(page)).ai.resume
  await page.locator('#resume-file').setInputFiles({ name: '测试简历.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: resumeDocx() })
  await page.getByRole('button', { name: 'AI 解析', exact: true }).click()
  await page.waitForFunction(value => document.getElementById('ai-resume').value === value, importedMarkdown)
  assert.equal((await snapshot(page)).ai.resume, previousResume, 'Import must not overwrite the saved resume')
  await page.getByText('待保存', { exact: true }).waitFor()
  await page.locator('#resume-file').setInputFiles({ name: 'resume.pdf', mimeType: 'application/pdf', buffer: resumePdf() })
  await page.getByRole('button', { name: 'AI 解析', exact: true }).click()
  await page.getByRole('button', { name: 'AI 解析', exact: true }).waitFor()
  assert.equal(resumeRequests, 2)
  const editedResume = importedMarkdown + '\n\n手动核对：仅使用简历已有事实。'
  await page.locator('#ai-resume').fill(editedResume)
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await waitFor(page, state => state.ai.resume === editedResume)
  const beforeInvalid = resumeRequests
  await page.locator('#resume-file').setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') })
  await page.getByRole('button', { name: 'AI 解析', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '文件内容不是有效的 PDF' }).waitFor()
  assert.equal(resumeRequests, beforeInvalid)
  assert.equal(await page.locator('#ai-resume').inputValue(), editedResume)
  resumeMode = 'fail'
  await page.locator('#resume-file').setInputFiles({ name: 'resume.pdf', mimeType: 'application/pdf', buffer: resumePdf() })
  await page.getByRole('button', { name: 'AI 解析', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'HTTP 503' }).waitFor()
  assert.equal(await page.locator('#ai-resume').inputValue(), editedResume)
  resumeMode = 'hold'
  const beforeCancel = resumeRequests
  await page.getByRole('button', { name: 'AI 解析', exact: true }).click()
  for (let i = 0; i < 100 && resumeRequests === beforeCancel; i++) await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(resumeRequests, beforeCancel + 1)
  await assert.rejects(start(page), /正在解析简历/)
  await page.getByRole('button', { name: '取消解析', exact: true }).click()
  await page.getByRole('button', { name: 'AI 解析', exact: true }).waitFor()
  assert.equal(await page.locator('#ai-resume').inputValue(), editedResume)
  assert.equal((await snapshot(page)).ai.resume, editedResume)
  resumeMode = 'normal'
  await page.screenshot({ path: join(artifacts, 'resume-markdown-fixture.png') })
  await start(page, { limit: 1 })
  completed = await waitFor(page, state => ['completed', 'failed'].includes(state.task.status))
  assert.equal(completed.task.status, 'completed', completed.task.message)
  assert.equal(completed.task.sent, 1)
  assert.equal(completed.applications.find(r => r.job.id === 'ai-reject').status, 'skipped')
  assert.equal(completed.applications.find(r => r.job.id === 'ai-match').score, 92)
  assert.equal(await remote.evaluate(() => localStorage.getItem('fixture-contact-ai-reject')), null)
  assert.equal(await remote.evaluate(() => localStorage.getItem('fixture-message-ai-match')), '1')
  assert.equal(await remote.evaluate(() => localStorage.getItem('fixture-last-message-ai-match')), '您好，我有 React 项目经验，希望应聘AI 匹配岗位。')
  await start(page)
  completed = await waitFor(page, state => state.task.status === 'failed')
  assert.equal(completed.applications.find(r => r.job.id === 'ai-error').retryable, true)
  assert.equal(await remote.evaluate(() => localStorage.getItem('fixture-contact-ai-error')), null)
  failAi = false
  await start(page)
  completed = await waitFor(page, state => ['completed', 'failed'].includes(state.task.status))
  assert.equal(completed.task.status, 'completed', completed.task.message)
  assert.equal(completed.applications.find(r => r.job.id === 'ai-error').status, 'greeted')
  assert.equal(await remote.evaluate(() => localStorage.getItem('fixture-contact-ai-error')), '1')
  assert.ok(aiRequests.every(request => request.authorization === 'Bearer fixture-ai-secret'))
  assert.ok(aiRequests.filter(request => request.input.messages.length > 1 && JSON.parse(request.input.messages[1].content).job).every(request => {
    const data = JSON.parse(request.input.messages[1].content)
    return data.resume.includes('React') && data.job.description.includes('岗位要求：')
  }))
  await assert.rejects(page.evaluate(() => window.desktop.command({ type: 'open-job', url: 'https://evil.example/job_detail/one.html' })))
  await remote.goto('https://www.zhipin.com/web/passport/zp/security.html')
  assert.equal((await page.evaluate(() => window.desktop.command({ type: 'check-auth' }))).auth, 'verification')
  await remote.evaluate(() => { location.href = 'https://example.com' })
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.ok(remote.url().startsWith('https://www.zhipin.com'))
  await remote.close()
  await waitFor(page, state => !state.browser.opened)
  await page.getByRole('button', { name: '工作台', exact: true }).click()
  await page.getByRole('button', { name: '打开 Boss 直聘', exact: true }).click()
  await waitFor(page, state => state.auth === 'signed-in')
  await page.reload()
  assert.equal((await snapshot(page)).applications.length, 9)
  assert.deepEqual(errors, [])
  await app.close()
  instance = await launch()
  const restored = await snapshot(instance.page)
  assert.equal(restored.applications.length, 9)
  assert.equal(restored.ai.keyConfigured, true)
  assert.equal(restored.ai.model, 'fixture-model')
  assert.equal(restored.ai.resume, editedResume, 'The manually edited Markdown must survive restart')
  assert.ok(restored.savedAt)
  const cookieCount = await instance.app.evaluate(async ({ session }) => (await session.fromPartition('persist:get-jobs-boss-default').cookies.get({ name: 'mvp_fixture_session' })).length)
  assert.equal(cookieCount, 1)
  await instance.page.getByRole('button', { name: '打开 Boss 直聘', exact: true }).click()
  await waitFor(instance.page, state => state.auth === 'signed-in')
  await start(instance.page)
  await waitFor(instance.page, state => state.task.status === 'completed')
  assert.equal((await snapshot(instance.page)).task.sent, 0)
  await instance.page.getByRole('button', { name: '本地设置', exact: true }).click()
  await instance.page.getByRole('button', { name: '退出登录并清除会话' }).click()
  await instance.page.getByRole('button', { name: '确认清除' }).click()
  await waitFor(instance.page, state => state.auth === 'signed-out' && !state.browser.opened)
  await instance.app.close()
  instance = await launch()
  assert.equal((await snapshot(instance.page)).savedAt, null)
  assert.equal((await snapshot(instance.page)).applications.length, 9)
  await instance.page.getByRole('button', { name: 'AI 与简历', exact: true }).click()
  await instance.page.getByRole('button', { name: '清除 Key', exact: true }).click()
  await waitFor(instance.page, state => !state.ai.keyConfigured)
  await assert.rejects(readFile(join(profile, 'ai-key.enc')), { code: 'ENOENT' })
  console.log('Electron application smoke passed: PDF/DOCX import, Markdown editing and persistence, import failures and cancellation, AI configuration and encrypted key, compatible provider, resume/JD matching, rejection before contact, customized messages, retry after AI failure, real Start button, no attachment sends, cancellation, restart, session isolation and logout. Fixture jobs only.')
} finally {
  if (instance) {
    const child = instance.app.process()
    const watchdog = setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL') }, 5000)
    try { await instance.app.close().catch(() => {}) } finally { clearTimeout(watchdog) }
  }
  await rm(profile, { recursive: true, force: true })
  aiServer.closeAllConnections()
  await new Promise(resolve => aiServer.close(resolve))
}
