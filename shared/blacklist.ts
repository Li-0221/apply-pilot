import type { BlacklistEntry, Job } from './contracts'
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '')
export function blacklistValue(job: Job, kind: BlacklistEntry['kind']) {
  if (kind === 'job') return `id:${job.id}`
  if (kind === 'company') return job.companyId ? `id:${job.companyId}` : job.company ? `name:${job.company}` : ''
  return job.recruiterId ? `id:${job.recruiterId}` : job.recruiterName && job.company ? `name:${job.company}|${job.recruiterName}` : ''
}
export function blacklistReason(job: Job, entries: BlacklistEntry[]): string | null {
  for (const entry of entries) {
    if (entry.platform !== job.platform) continue
    const exactValue = entry.value.startsWith('name:') ? `name:${entry.kind === 'company' ? job.company : entry.kind === 'job' ? job.title : `${job.company}|${job.recruiterName || ''}`}` : blacklistValue(job, entry.kind)
    const candidate = entry.match === 'exact' ? exactValue : entry.kind === 'company' ? job.company : entry.kind === 'job' ? job.title : job.recruiterName || ''
    if (!candidate) continue
    if (entry.match === 'exact' ? normalize(candidate) === normalize(entry.value) : normalize(candidate).includes(normalize(entry.value))) return `黑名单：${entry.label || entry.value}`
  }
  return null
}
