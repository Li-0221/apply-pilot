import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { parseBounds, parseCommand, isBossUrl } from '../electron/security.ts'
import { LocalStore } from '../electron/store.ts'
import { TaskRunner, type TaskHost } from '../electron/task-runner.ts'
import { defaultSettings, type PendingApplication, type Job, type TaskState } from '../shared/contracts.ts'

const job: Job = { id: 'one', platform: 'boss', title: '前端开发', company: '测试公司', salary: '20-30K', location: '成都', tags: ['React'], url: 'https://www.zhipin.com/job_detail/one.html', collectedAt: new Date().toISOString() }
const record: PendingApplication = { key: 'boss:one', job, status: 'processing', resume: 'not-requested', detail: '处理中', startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
test('IPC limits application counts, intervals, message size and platform URLs', () => {
  assert.equal(isBossUrl(job.url), true)
  for (const url of ['https://zhipin.com.evil.test', 'javascript:alert(1)', 'http://www.zhipin.com', 'https://user:pass@www.zhipin.com', 'https://www.zhipin.com:3000']) assert.equal(isBossUrl(url), false)
  for (const input of [null, {}, { type: 'execute' }, { type: 'collect', keyword: '' }, { type: 'open', platform: 'liepin' }, { type: 'open-job', url: 'https://evil.test/job_detail/one.html' }]) assert.throws(() => parseCommand(input))
  for (const overrides of [{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { intervalSeconds: 0 }, { intervalSeconds: 301 }, { keyword: 'a'.repeat(81) }, { message: 'a'.repeat(1001) }, { sendResume: 'yes' }]) assert.throws(() => parseCommand({ type: 'start', settings: { ...defaultSettings, ...overrides } }))
  assert.deepEqual(parseCommand({ type: 'start', settings: { ...defaultSettings, keyword: ' 前端 ' } }), { type: 'start', settings: { ...defaultSettings, keyword: '前端' } })
  assert.throws(() => parseBounds({ x: NaN, y: 0, width: 100, height: 100, visible: true }))
})
test('old workspaces migrate without losing sessions; interrupted intentions remain deduplicated', () => {
  const directory = mkdtempSync(join(tmpdir(), 'apply-pilot-store-'))
  try {
    writeFileSync(join(directory, 'workspace.json'), JSON.stringify({ version: 1, keyword: '前端', jobs: [job], savedAt: '2026-10-15T12:00:00Z' }))
    const store = new LocalStore(directory)
    assert.equal(store.value.settings.keyword, '前端')
    assert.equal(store.value.jobs.length, 1)
    assert.equal(store.value.savedAt, '2026-10-15T12:00:00Z')
    store.record(record)
    const restored = new LocalStore(directory)
    assert.equal(restored.hasApplication(job), true)
    assert.equal(restored.value.applications[0].status, 'uncertain')
    restored.record({ ...record, status: 'greeted', resume: 'waiting-reply' })
    assert.equal(new LocalStore(directory).value.applications.length, 1)
    restored.record({ ...record, status: 'skipped', retryable: true, score: 20, aiReason: '不匹配' })
    assert.equal(new LocalStore(directory).hasApplication(job), false, 'A rejected job can be re-evaluated after changing the resume')
    restored.record({ ...record, retryable: true })
    assert.equal(new LocalStore(directory).value.applications[0].status, 'failed')
    restored.record({ ...record, retryable: false })
    assert.equal(new LocalStore(directory).value.applications[0].status, 'uncertain')
    if (process.platform !== 'win32') assert.equal(statSync(join(directory, 'workspace.json')).mode & 0o777, 0o600)
    writeFileSync(join(directory, 'workspace.json'), 'invalid-json')
    assert.throws(() => new LocalStore(directory), /数据损坏/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
function createHost(overrides: Partial<TaskHost> = {}) {
  const updates: TaskState[] = [], records: PendingApplication[] = [], contacted: string[] = []
  const host: TaskHost = {
    candidates: async () => [job, { ...job, id: 'two' }], hasApplication: () => false,
    apply: async (value, _settings, _signal, beforeContact) => { beforeContact(); contacted.push(value.id); return { status: 'greeted', resume: 'waiting-reply', detail: '招呼已发送，等待回复后才能发附件' } },
    record: value => { records.push({ ...value }) }, log: () => {}, update: task => { updates.push(task) }, ...overrides,
  }
  return { host, updates, records, contacted }
}
async function finish(runner: TaskRunner) {
  for (let i = 0; i < 200 && runner.running; i++) await delay(2)
  assert.equal(runner.running, false)
}
test('quantity limit counts actual attempts and never equates greeting with attachment delivery', async () => {
  const { host, updates, records, contacted } = createHost()
  const runner = new TaskRunner(host)
  runner.start(defaultSettings)
  assert.throws(() => runner.start(defaultSettings), /正在运行/)
  await finish(runner)
  assert.deepEqual(contacted, ['one'])
  assert.equal(records[0].status, 'processing')
  assert.equal(records[1].status, 'processing')
  assert.equal(records[1].retryable, false)
  assert.equal(records[2].status, 'greeted')
  assert.equal(records[2].resume, 'waiting-reply')
  assert.equal(updates.at(-1)?.sent, 1)
})
test('history, city and exclusions skip jobs without contacting their recruiters', async () => {
  const { host, contacted } = createHost({ candidates: async () => [job, { ...job, id: 'history' }, { ...job, id: 'other-city', location: '上海' }, { ...job, id: 'excluded', company: '排除公司' }, { ...job, id: 'ok' }, { ...job, id: 'ok' }], hasApplication: candidate => ['one', 'history'].includes(candidate.id) })
  const runner = new TaskRunner(host)
  runner.start({ ...defaultSettings, city: '成都', excludedKeywords: '排除' })
  await finish(runner)
  assert.deepEqual(contacted, ['ok'])
})
test('uncertain external results stop the batch instead of retrying or contacting the next job', async () => {
  const { host, updates, records, contacted } = createHost({ apply: async (value, _settings, _signal, beforeContact) => { beforeContact(); contacted.push(value.id); throw new Error('network disconnected after click') } })
  const runner = new TaskRunner(host)
  runner.start({ ...defaultSettings, limit: 3 })
  await finish(runner)
  assert.deepEqual(contacted, ['one'])
  assert.equal(records.at(-1)?.status, 'uncertain')
  assert.equal(updates.at(-1)?.status, 'failed')
})
test('stop during a send preserves confirmed results and prevents the next contact', async () => {
  let complete!: (value: Awaited<ReturnType<TaskHost['apply']>>) => void
  const { host, updates, records, contacted } = createHost({ apply: async (value, _settings, _signal, beforeContact) => { beforeContact(); contacted.push(value.id); return new Promise(resolve => { complete = resolve }) } })
  const runner = new TaskRunner(host)
  runner.start({ ...defaultSettings, limit: 3 })
  await delay(0)
  runner.stop()
  assert.throws(() => runner.start(defaultSettings), /正在运行/)
  complete({ status: 'greeted', resume: 'waiting-reply', detail: '送达' })
  await finish(runner)
  assert.deepEqual(contacted, ['one'])
  assert.equal(records.at(-1)?.status, 'greeted')
  assert.equal(updates.at(-1)?.status, 'stopped')
})
test('stop during list loading never creates an application intention or sends a message', async () => {
  let loaded!: (value: Job[]) => void
  const { host, records, contacted, updates } = createHost({ candidates: () => new Promise(resolve => { loaded = resolve }) })
  const runner = new TaskRunner(host)
  runner.start(defaultSettings)
  runner.stop(); loaded([job])
  await finish(runner)
  assert.equal(records.length, 0); assert.equal(contacted.length, 0)
  assert.equal(updates.at(-1)?.status, 'stopped')
})
test('AI failures before contact stop the task and leave the job eligible for a later retry', async () => {
  const { host, records, updates, contacted } = createHost({ apply: async () => { throw new Error('AI 服务返回 HTTP 503') } })
  const runner = new TaskRunner(host)
  runner.start(defaultSettings)
  await finish(runner)
  assert.equal(records.at(-1)?.status, 'failed')
  assert.equal(records.at(-1)?.retryable, true)
  assert.equal(updates.at(-1)?.status, 'failed')
  assert.equal(contacted.length, 0)
})
