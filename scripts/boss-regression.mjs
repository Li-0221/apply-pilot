import { _electron as electron } from 'playwright'
import executablePath from 'electron'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const directory = await mkdtemp(join(tmpdir(), 'apply-pilot-dom-'))
let app
try {
  const modulePath = join(directory, 'actions.cjs')
  await build({ entryPoints: ['electron/platforms/boss-application.ts'], outfile: modulePath, bundle: true, platform: 'node', format: 'cjs', target: 'node22' })
  const { bossApplicationAction } = createRequire(import.meta.url)(modulePath)
  const env = { ...process.env, APPLY_PILOT_DATA_DIR: join(directory, 'profile') }
  delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
  app = await electron.launch({ executablePath, args: ['.'], env })
  const page = await app.firstWindow()
  // Delivery receipts are not shown on every BOSS message. A new own message with no
  // pending/error marker must not wait forever for an optional receipt label.
  await page.setContent('<main class="chat-conversation"><h2>前端开发</h2><h3>示例公司</h3><div class="chat-message"><ul class="im-list"><li class="message-item item-myself"><div class="message-content">已确认的测试消息</div></li></ul></div><textarea id="chat-input"></textarea></main>')
  const result = await page.evaluate(({ source }) => {
    const action = (0, eval)('(' + source + ')')
    return action('state', { id: 'fixture', title: '前端开发', company: '示例公司' }, '已确认的测试消息')
  }, { source: bossApplicationAction.toString() })
  assert.equal(result.messageSent, true, 'A confirmed own message without an optional delivery receipt currently becomes 结果待核实：BOSS 页面响应超时')
  const inspect = baseline => page.evaluate(({ source, baseline }) => {
    const action = (0, eval)('(' + source + ')')
    return action('state', { id: 'fixture', title: '前端开发', company: '示例公司有限公司' }, '已确认的测试消息', baseline)
  }, { source: bossApplicationAction.toString(), baseline })
  assert.equal((await inspect({ messageCount: 1, resumeCount: 0 })).messageSent, false, 'Historical identical messages are not a new send')
  assert.equal((await inspect({ messageCount: 0, resumeCount: 0 })).conversation, true, 'A legal company suffix does not break an otherwise verified conversation')
  await page.locator('.message-item').evaluate(e => e.insertAdjacentHTML('beforeend', '<span class="status-sending"></span>'))
  assert.equal((await inspect({ messageCount: 0, resumeCount: 0 })).messageSent, false)
  await page.locator('.status-sending').evaluate(e => e.className = 'send-fail')
  assert.equal((await inspect({ messageCount: 0, resumeCount: 0 })).messageSent, false)
  await page.locator('h3').evaluate(e => e.textContent = '另一家公司')
  assert.equal((await inspect({ messageCount: 0, resumeCount: 0 })).conversation, false, 'Never send into a different company conversation')
  assert.equal((await inspect({ messageCount: 0 })).messageSent, false)
  await page.setContent('<a class="more-job-btn" href="https://www.zhipin.com/job_detail/fixture.html">详情</a><a class="btn-startchat">继续沟通</a><div class="dialog-container"><div class="boss-info"><span class="position">示例公司·招聘者</span></div><div class="startchat-content"><ul class="message-list"><li class="message-item"><span class="status success">已发送</span><p class="text">已确认的测试消息</p></li></ul><textarea class="input-area"></textarea><div class="send-message disable">发送</div></div></div>')
  assert.equal((await inspect({ messageCount: 0 })).messageSent, true, 'The live lightweight dialog does not use the item-myself class')
  assert.equal((await inspect({ messageCount: 1 })).messageSent, false, 'Historical lightweight messages are not new sends')
  const conversation = await page.evaluate(source => (0, eval)('(' + source + ')')('contact', { id: 'fixture', title: '前端开发', company: '示例公司' }, '已确认的测试消息'), bossApplicationAction.toString())
  assert.equal(conversation.target, undefined, 'An open lightweight dialog must never re-click the background continue button')
  for (const status of ['sending', 'error', 'loading', 'pending']) {
    await page.locator('.status').evaluate((e, status) => { e.className = 'status ' + status; e.textContent = '' }, status)
    assert.equal((await inspect({ messageCount: 0 })).messageSent, false, `${status} is not a confirmed lightweight send`)
  }
  await page.locator('.status').evaluate(e => { e.className = 'status success'; e.textContent = '已发送' })
  await page.locator('.position').evaluate(e => e.textContent = '另一家公司·招聘者')
  assert.equal((await inspect({ messageCount: 0 })).messageSent, false, 'A lightweight dialog must match the selected job and company')
  const failures = []
  const check = (actual, expected, label) => { if (actual !== expected) failures.push(label) }
  // Message bodies may contain receipt words as ordinary prose.
  await page.setContent('<main class="chat-conversation"><h2>前端开发</h2><h3>示例公司</h3><li class="message-item item-myself"><p>您好，已阅读职位要求，可协助消息送达优化。</p><span class="status-delivery">送达</span></li><textarea id="chat-input"></textarea></main>')
  const prose = await page.evaluate(source => (0, eval)('(' + source + ')')('state', { id: 'fixture', title: '前端开发', company: '示例公司' }, '您好，已阅读职位要求，可协助消息送达优化。', { messageCount: 0 }), bossApplicationAction.toString())
  check(prose.messageSent, true, 'Receipt words inside the actual message must be preserved')
  // A historical message mentioning the target employer must not authenticate another chat.
  await page.locator('h3').evaluate(e => e.textContent = '另一家公司')
  await page.locator('p').evaluate(e => e.textContent = '示例公司 前端开发 已确认的测试消息')
  check((await inspect({ messageCount: 0 })).conversation, false, 'Chat history must not supply the company identity')
  // A matching title/company in a lightweight dialog must not bypass its HR/job checks.
  await page.setContent('<a class="more-job-btn" href="https://www.zhipin.com/job_detail/fixture.html">详情</a><div class="dialog-container"><div class="boss-info"><span class="name">另一位 HR</span><span class="position">示例公司·前端开发</span></div><div class="startchat-content"><textarea class="input-area"></textarea></div></div>')
  const mismatch = await page.evaluate(source => (0, eval)('(' + source + ')')('fill-message', { id: 'fixture', title: '前端开发', company: '示例公司', recruiterName: '目标 HR' }, '测试消息', { messageCount: 0 }), bossApplicationAction.toString())
  check(mismatch.conversation, false, 'Lightweight HR mismatch must not fall back to title/company')
  check(!!mismatch.target, false, 'A mismatched recruiter must never receive a fill target')
  await page.locator('.more-job-btn').evaluate(e => e.href = 'https://www.zhipin.com/job_detail/another.html')
  check((await inspect({ messageCount: 0 })).conversation, false, 'Lightweight job mismatch must not fall back to title/company')
  assert.deepEqual(failures, [], failures.join('\n'))
  console.log('BOSS DOM regression passed: optional receipts, pending/failed sends, historical messages, receipt words in message bodies, and company/HR/job conversation identity.')
} finally {
  await app?.close().catch(() => {})
  await rm(directory, { recursive: true, force: true })
}
