import { setTimeout as delay } from 'node:timers/promises'
import type { ApplicationSettings, Job } from '../shared/contracts'
import type { PageInspection, PlatformAdapter } from './platforms/types'

export const splitValues = (text: string) => [...new Set(text.split(/[,，\n;；]+/).map(value => value.trim()).filter(Boolean))]
export function searchPlan(settings: ApplicationSettings, adapter: PlatformAdapter) {
  const keywords = splitValues(settings.keyword), cities = splitValues(settings.city)
  return (keywords.length ? keywords : ['']).flatMap(keyword => (cities.length ? cities : ['']).map(city => ({ keyword, city, url: adapter.searchUrl(keyword, city, settings.filters) })))
}
interface CandidateHost {
  currentUrl(): string
  navigate(url: string, signal: AbortSignal): Promise<void>
  inspect(): Promise<PageInspection>
  scroll(signal: AbortSignal): Promise<void>
  log(message: string): void
}
// A single browser is shared with delivery. Reload and replay scrolling only when a
// delivery navigated away, so the next batch never depends on a stale DOM handle.
export async function* candidateJobs(settings: ApplicationSettings, adapter: PlatformAdapter, host: CandidateHost, signal: AbortSignal): AsyncGenerator<Job> {
  const seen = new Set<string>()
  for (const search of searchPlan(settings, adapter)) {
    signal.throwIfAborted()
    host.log(`搜索：${search.keyword || '推荐岗位'} · ${search.city || '全国'}`)
    if (host.currentUrl() !== search.url) await host.navigate(search.url, signal)
    let emptyPasses = 0
    for (let pass = 0; pass < 50; pass++) {
      signal.throwIfAborted()
      if (host.currentUrl() !== search.url) {
        await host.navigate(search.url, signal)
        for (let replay = 0; replay < pass; replay++) { await host.scroll(signal); await delay(500, undefined, { signal }) }
      } else if (pass > 0) await host.scroll(signal)
      let found: Job[] = []
      for (let poll = 0; poll < 16; poll++) {
        signal.throwIfAborted()
        const inspection = await host.inspect()
        if (inspection.auth === 'verification') throw new Error('请先在 BOSS 页面完成安全验证')
        if (inspection.auth === 'signed-out') throw new Error('BOSS 登录已失效，请重新登录')
        found = inspection.jobs.filter(job => !seen.has(`${job.platform}:${job.id}`))
        if (found.length) break
        if (/没有|暂无/.test(inspection.emptyReason || '')) break
        await delay(250, undefined, { signal })
      }
      if (!found.length) { if (++emptyPasses >= 2) break; continue }
      emptyPasses = 0
      for (const job of found) {
        signal.throwIfAborted()
        seen.add(`${job.platform}:${job.id}`)
        yield { ...job, searchUrl: search.url, searchKeyword: search.keyword, searchCity: search.city }
      }
    }
  }
}
