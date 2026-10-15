import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activityDays, hrSkipReason } from '../electron/hr-activity.ts'
import { defaultSettings, type Job } from '../shared/contracts.ts'

test('HR activity uses displayed bounds and exposes unknown activity explicitly', () => {
  for (const label of ['在线', '刚刚活跃', '今日活跃', '2小时前活跃']) assert.equal(activityDays(label), 0)
  assert.equal(activityDays('3日内活跃'), 3)
  assert.equal(activityDays('本周活跃'), 7)
  assert.equal(activityDays('本月活跃'), 31)
  assert.equal(activityDays('2个月前活跃'), 62)
  assert.equal(activityDays('活跃'), null)
  const job = { hrActivity: '本周活跃' } as Job
  assert.equal(hrSkipReason(job, { ...defaultSettings, hrMaxDays: 7 }), null)
  assert.match(hrSkipReason(job, { ...defaultSettings, hrMaxDays: 3 })!, /不符合/)
  assert.equal(hrSkipReason({ ...job, hrActivity: '' }, { ...defaultSettings, hrMaxDays: 7 }), null)
  assert.match(hrSkipReason({ ...job, hrActivity: '' }, { ...defaultSettings, hrMaxDays: 7, hrUnknown: 'skip' })!, /未知/)
})
