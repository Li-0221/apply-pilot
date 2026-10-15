import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blacklistReason, blacklistValue } from '../shared/blacklist.ts'
import { parseCommand } from '../electron/security.ts'
import type { BlacklistEntry, Job } from '../shared/contracts.ts'
const job = { id: 'job1', platform: 'boss', title: '前端工程师', company: '测试公司', recruiterName: '张女士', recruiterId: 'hr1' } as Job
const entry: BlacklistEntry = { id: 'test', platform: 'boss', kind: 'recruiter', match: 'exact', value: 'id:hr1', label: '张女士', createdAt: '' }
test('blacklists distinguish recruiter identity, platform, company names and job IDs', () => {
  assert.ok(blacklistReason(job, [entry]))
  assert.equal(blacklistReason({ ...job, recruiterId: 'another-hr' }, [entry]), null)
  assert.equal(blacklistReason({ ...job, platform: 'other' }, [entry]), null)
  const fallback = { ...entry, value: blacklistValue({ ...job, recruiterId: undefined }, 'recruiter') }
  assert.ok(blacklistReason({ ...job, recruiterId: undefined }, [fallback]))
  assert.equal(blacklistReason({ ...job, company: '另一公司', recruiterId: undefined }, [fallback]), null)
  assert.ok(blacklistReason(job, [{ ...entry, kind: 'company', match: 'contains', value: '测试' }]))
  assert.ok(blacklistReason({ ...job, companyId: 'new-id' }, [{ ...entry, kind: 'company', value: 'name:测试公司' }]))
  assert.throws(() => parseCommand({ type: 'add-blacklist', entry: { ...entry, value: '' } }))
})
