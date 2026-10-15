import type { ApplicationSettings, Job } from '../shared/contracts'

// Bounds describe the site's wording; they are not an inferred last-login timestamp.
export function activityDays(label: string): number | null {
  const value = label.replace(/\s/g, '')
  if (/在线|刚刚|今日|今天|当日/.test(value)) return 0
  if (/昨日|昨天/.test(value)) return 1
  const numeric = value.match(/(\d+)(分钟|小时|天|日|周|个?月|年)/)
  if (numeric) return Number(numeric[1]) * ({ 分钟: 0, 小时: 0, 天: 1, 日: 1, 周: 7, 月: 31, 个月: 31, 年: 365 }[numeric[2]] ?? 1)
  if (/本周|近一周|一周内/.test(value)) return 7
  if (/两周|二周/.test(value)) return 14
  if (/本月|近一月|一月内/.test(value)) return 31
  if (/半年/.test(value)) return 183
  if (/一年/.test(value)) return 365
  return null
}
export function hrSkipReason(job: Job, settings: ApplicationSettings): string | null {
  if (!settings.hrMaxDays) return null
  const days = activityDays(job.hrActivity || '')
  if (days === null) return settings.hrUnknown === 'skip' ? 'HR 活跃状态未知' : null
  return days > settings.hrMaxDays ? `HR 活跃度不符合：${job.hrActivity}` : null
}
