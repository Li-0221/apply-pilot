import { bossOptions } from '../../shared/boss-options'
import { defaultSearchFilters, type SearchFilters } from '../../shared/contracts'
import type { Job, AuthStatus } from '../../shared/contracts'
import { isBossUrl } from '../security'
import { applyToBoss } from './boss-application'
import type { PlatformAdapter, PageInspection } from './types'

// Runs in the isolated, unprivileged website. Never receives local capabilities.
export function inspectBossPage(): PageInspection {
  const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  const visible = (element: Element) => {
    const bounds = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return bounds.width > 0 && bounds.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
  }
  const body = document.body?.innerText ?? ''
  const verification = /安全验证|访问异常|访问受限|滑动验证|请完成验证/.test(body.slice(0, 8000)) || /captcha|verify|security(?:-check|\.html)/.test(location.pathname)
  const user = [...document.querySelectorAll('.nav-figure, .user-nav .user-name, .nav-item-user, [ka="header-username"]')].find(visible)
  const login = [...document.querySelectorAll('.header-login-btn, .btn-sign, .sign-form, .sign-wrap, .login-register, [class*="login-dialog"]')].find(visible)
  const chat = [...document.querySelectorAll('a[href*="/web/geek/chat"]')].find(visible)
  const loginDocument = location.pathname.startsWith('/web/user/') && /登录/.test(document.title) && /扫码|验证码|微信登录|手机号/.test(body)
  const auth: AuthStatus = verification ? 'verification' : login || loginDocument ? 'signed-out' : user || chat ? 'signed-in' : 'unknown'
  const jobs: Job[] = []
  for (const card of document.querySelectorAll('.job-card-wrapper, .job-card-box')) {
    // Some Boss versions nest job-card-box inside job-card-wrapper.
    if (card.matches('.job-card-box') && card.closest('.job-card-wrapper')) continue
    const link = card.querySelector<HTMLAnchorElement>('a[href*="/job_detail/"]')
    if (!link) continue
    const url = new URL(link.href, location.origin)
    const id = url.pathname.match(/\/job_detail\/([^/]+)\.html/)?.[1]
    const title = text(card.querySelector('.job-name, .job-title'))
    if (!id || !title || url.protocol !== 'https:' || !(url.hostname === 'zhipin.com' || url.hostname.endsWith('.zhipin.com'))) continue
    jobs.push({
      id, platform: 'boss', title,
      recruiterName: text(card.querySelector('.boss-info .boss-name,.boss-info .name')).slice(0, 100),
      hrActivity: text(card.querySelector('.boss-active-time,.boss-active,.active-time,.boss-online,.boss-info .status')).slice(0, 100),
      recruiterId: card.querySelector('a[href*="/boss/"]')?.getAttribute('href')?.match(/\/boss\/([^/.]+)/)?.[1],
      companyId: card.querySelector('a[href*="/gongsi/"]')?.getAttribute('href')?.match(/\/gongsi\/([^/.]+)/)?.[1],
      company: text(card.querySelector('.company-name, .boss-name')),
      salary: text(card.querySelector('.salary, .job-salary')),
      location: text(card.querySelector('.job-area, .job-area-wrapper, .company-location')),
      tags: [...card.querySelectorAll('.tag-list li, .job-info .tag-list span')].map(text).filter(Boolean),
      url: url.href, collectedAt: new Date().toISOString(),
    })
  }
  return { auth, account: user ? text(user).slice(0, 50) : '', emptyReason: text(document.querySelector('.job-empty,.search-none,.job-list-empty')), jobs: [...new Map(jobs.map(job => [job.id, job])).values()] }
}

export function bossSearchUrl(keyword: string, city = '', filters: SearchFilters = defaultSearchFilters) {
  const params = new URLSearchParams()
  if (keyword) params.set('query', keyword)
  const cityOption = bossOptions.city.find(option => option.label === city || option.value === city)
  if (city && !cityOption) throw new Error('无效的 BOSS 城市')
  params.set('city', cityOption?.value || '100010000')
  for (const [key, value] of Object.entries(filters)) if (value !== '0') params.set(key, value)
  return `https://www.zhipin.com/web/geek/jobs?${params}`
}
export const bossAdapter: PlatformAdapter = {
  descriptor: { id: 'boss', name: 'Boss 直聘', capabilities: ['browse', 'apply'] },
  partition: 'persist:get-jobs-boss-default',
  entryUrl: 'https://www.zhipin.com/web/geek/jobs',
  loginUrl: 'https://www.zhipin.com/web/user/',
  isAllowedUrl: isBossUrl,
  searchUrl: bossSearchUrl,
  apply: applyToBoss,
  inspectScript: `(${inspectBossPage.toString()})()`,
  scrollScript: `(() => {
    const cards = document.querySelectorAll('.job-card-wrapper, .job-card-box');
    cards[cards.length - 1]?.scrollIntoView({block: 'end'});
  })()`,
}
