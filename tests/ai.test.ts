import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import { AiClient, chatEndpoint, parseDecision } from '../electron/ai.ts'
import { parseCommand, parseAiSettings } from '../electron/security.ts'
import { defaultAiSettings, type Job } from '../shared/contracts.ts'

const job: Job = { id: 'ai-test', platform: 'boss', title: 'React 开发', company: '测试公司', salary: '', location: '成都', tags: ['React'], url: 'https://www.zhipin.com/job_detail/ai-test.html', collectedAt: '' }
const decision = { matched: true, score: 88, reason: '简历包含 React 项目经验', greeting: '您好，我有 React 项目经验，希望进一步沟通。' }
async function provider(handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>) {
  const server = createServer((request, response) => { void handler(request, response) })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server missing port')
  return { url: `http://127.0.0.1:${address.port}/v1`, close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) } }
}
test('AI configuration accepts compatible endpoints and validates untrusted IPC fields', () => {
  assert.equal(chatEndpoint('https://api.openai.com'), 'https://api.openai.com/v1/chat/completions')
  assert.equal(chatEndpoint('https://provider.test/api/v1/'), 'https://provider.test/api/v1/chat/completions')
  assert.equal(chatEndpoint('http://localhost:1234/v1/chat/completions'), 'http://localhost:1234/v1/chat/completions')
  for (const overrides of [{ baseUrl: 'file:///tmp/x' }, { baseUrl: 'https://key@host/v1' }, { baseUrl: 'https://host?key=secret' }, { minScore: 101 }, { minScore: 2.5 }, { resume: 'a'.repeat(30001) }]) assert.throws(() => parseAiSettings({ ...defaultAiSettings, ...overrides }))
  assert.throws(() => parseCommand({ type: 'save-ai', settings: defaultAiSettings, key: 'bad\nheader' }))
  assert.equal(parseDecision(JSON.stringify(decision), 90).matched, false, 'Local threshold must override an optimistic model result')
  for (const content of ['false', 'not-json', JSON.stringify({ ...decision, score: 101 }), JSON.stringify({ ...decision, greeting: '' })]) assert.throws(() => parseDecision(content, 70))
})
test('AI receives the resume and selected JD once and returns a validated customized message', async () => {
  let requests = 0
  const service = await provider(async (request, response) => {
    requests++
    assert.equal(request.url, '/v1/chat/completions')
    assert.equal(request.headers.authorization, 'Bearer fixture-key')
    let body = ''
    for await (const chunk of request) body += chunk
    const data = JSON.parse(body)
    assert.equal(data.model, 'fixture-model')
    assert.equal(data.stream, false)
    const input = JSON.parse(data.messages[1].content)
    assert.equal(input.resume, '候选人：有 React 项目经验')
    assert.equal(input.job.description, '要求 React 和 TypeScript')
    assert.equal(input.job.title, job.title)
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ choices: [{ message: { content: '```json\n' + JSON.stringify(decision) + '\n```' } }] }))
  })
  try {
    const client = new AiClient({ ...defaultAiSettings, baseUrl: service.url, model: 'fixture-model', resume: '候选人：有 React 项目经验' }, 'fixture-key')
    assert.deepEqual(await client.evaluate(job, '要求 React 和 TypeScript', new AbortController().signal), decision)
    assert.equal(requests, 1)
    await assert.rejects(client.evaluate(job, '', new AbortController().signal), /未读取到岗位要求/)
    assert.equal(requests, 1)
  } finally { await service.close() }
})
test('AI errors do not expose provider bodies or API keys and never silently fall back to sending', async () => {
  const service = await provider((_request, response) => { response.writeHead(401); response.end('fixture-secret-key provider diagnostics') })
  try {
    const client = new AiClient({ ...defaultAiSettings, baseUrl: service.url, model: 'test', resume: 'React' }, 'fixture-secret-key')
    await assert.rejects(client.evaluate(job, 'React', new AbortController().signal), error => error instanceof Error && error.message.includes('HTTP 401') && !error.message.includes('fixture-secret-key'))
  } finally { await service.close() }
})
test('stopping aborts an in-flight AI request', async () => {
  let accepted!: () => void
  const received = new Promise<void>(resolve => { accepted = resolve })
  const service = await provider(() => { accepted() })
  try {
    const client = new AiClient({ ...defaultAiSettings, baseUrl: service.url, model: 'test', resume: 'React' }, 'fixture-key')
    const controller = new AbortController()
    const result = client.evaluate(job, 'React', controller.signal)
    await received
    controller.abort()
    await assert.rejects(result, { name: 'AbortError' })
  } finally { await service.close() }
})
test('resume conversion sends extracted text and returns editable Markdown with original facts', async () => {
  const service = await provider(async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk
    const input = JSON.parse(body)
    assert.equal(JSON.parse(input.messages[1].content).resumeText, '测试候选人：React 项目经验')
    assert.match(input.messages[0].content, /不得新增/)
    assert.match(input.messages[0].content, /首行必须是 Markdown 一级标题/)
    response.end(JSON.stringify({ choices: [{ message: { content: '# 测试候选人\n\n## 技能\n- React 项目经验' } }] }))
  })
  try {
    const client = new AiClient({ ...defaultAiSettings, baseUrl: service.url, model: 'fixture' }, 'fixture-key')
    assert.equal(await client.resumeMarkdown('测试候选人：React 项目经验', new AbortController().signal), '# 测试候选人\n\n## 技能\n- React 项目经验')
  } finally { await service.close() }
})
