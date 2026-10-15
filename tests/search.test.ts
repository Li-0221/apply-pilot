import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bossSearchUrl } from '../electron/platforms/boss.ts'
import { parseSettings } from '../electron/security.ts'
import { defaultSearchFilters, defaultSettings } from '../shared/contracts.ts'

test('all search filters reach BOSS URL with city code and encoded query', () => {
  const filters = { jobType: '1901', salary: '406', experience: '105', degree: '203', scale: '303', industry: '100020', stage: '807' }
  // Use a real option code rather than assume a particular industry catalogue revision.
  const settings = parseSettings({ ...defaultSettings, keyword: '前端 React', city: '成都', filters: { ...filters, industry: '0' } })
  const url = new URL(bossSearchUrl(settings.keyword, settings.city, settings.filters))
  assert.equal(url.searchParams.get('city'), '101270100')
  assert.equal(url.searchParams.get('query'), '前端 React')
  for (const [key, value] of Object.entries(settings.filters)) assert.equal(url.searchParams.get(key), value === '0' ? null : value)
  assert.equal(new URL(bossSearchUrl('')).searchParams.get('city'), '100010000')
  assert.throws(() => parseSettings({ ...defaultSettings, city: '不存在的城市' }))
  assert.throws(() => parseSettings({ ...defaultSettings, filters: { ...defaultSearchFilters, salary: 'bad' } }))
  const { filters: _oldFilters, ...legacy } = defaultSettings
  assert.deepEqual(_oldFilters, defaultSearchFilters)
  assert.deepEqual(parseSettings(legacy).filters, defaultSearchFilters)
})

import { searchPlan, candidateJobs } from '../electron/candidates.ts'
import { bossAdapter } from '../electron/platforms/boss.ts'

test('multiple keywords and cities form a deduplicated search plan', () => {
  const plan = searchPlan({ ...defaultSettings, keyword: '前端,React,前端', city: '成都，上海' }, bossAdapter)
  assert.equal(plan.length, 4)
  assert.equal(new URL(plan[3].url).searchParams.get('city'), '101020100')
  assert.equal(new URL(plan[3].url).searchParams.get('query'), 'React')
})
test('candidate loading is lazy and continues beyond the former 100-job cap', async () => {
  let url = '', inspections = 0, scrolls = 0
  const signal = new AbortController().signal
  const jobs = candidateJobs(defaultSettings, bossAdapter, {
    currentUrl: () => url,
    navigate: async next => { url = next },
    inspect: async () => {
      inspections++
      return { auth: 'signed-in', account: '', jobs: Array.from({ length: 100 }, (_, i) => ({ id: String(scrolls * 100 + i), platform: 'boss', title: '前端', company: '公司', salary: '', location: '', tags: [], url: 'https://www.zhipin.com/job_detail/test.html', collectedAt: '' })) }
    },
    scroll: async () => { scrolls++ }, log: () => {},
  }, signal)
  assert.equal(inspections, 0)
  const ids = new Set<string>()
  for await (const job of jobs) { ids.add(job.id); if (ids.size === 101) break }
  assert.equal(ids.size, 101)
  assert.equal(inspections, 2)
  assert.equal(scrolls, 1)
})
