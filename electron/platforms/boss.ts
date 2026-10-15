import type { Job, AuthStatus } from '../../shared/contracts'
import { isBossUrl } from '../security'
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
  const user = [...document.querySelectorAll('.nav-figure, .user-nav .user-name, .nav-item-user')].find(visible)
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
      company: text(card.querySelector('.company-name')),
      salary: text(card.querySelector('.salary')),
      location: text(card.querySelector('.job-area, .job-area-wrapper')),
      tags: [...card.querySelectorAll('.tag-list li, .job-info .tag-list span')].map(text).filter(Boolean),
      url: `${url.origin}${url.pathname}`, collectedAt: new Date().toISOString(),
    })
  }
  return { auth, account: user ? text(user).slice(0, 50) : '', jobs: [...new Map(jobs.map(job => [job.id, job])).values()] }
}

export const bossAdapter: PlatformAdapter = {
  descriptor: { id: 'boss', name: 'Boss 直聘', capabilities: ['browse', 'collect'] },
  partition: 'persist:get-jobs-boss-default',
  entryUrl: 'https://www.zhipin.com/web/geek/jobs',
  loginUrl: 'https://www.zhipin.com/web/user/',
  isAllowedUrl: isBossUrl,
  searchUrl: keyword => `https://www.zhipin.com/web/geek/jobs${keyword ? `?query=${encodeURIComponent(keyword)}` : ''}`,
  inspectScript: `(${inspectBossPage.toString()})()`,
  scrollScript: `(() => {
    const cards = document.querySelectorAll('.job-card-wrapper, .job-card-box');
    cards[cards.length - 1]?.scrollIntoView({block: 'end'});
  })()`,
}
