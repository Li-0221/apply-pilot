import { hrSkipReason } from '../hr-activity'
import { setTimeout as delay } from 'node:timers/promises'
import type { ApplicationOutcome, ApplicationSettings, Job } from '../../shared/contracts'
import type { AutomationBrowser, InteractionTarget } from './types'

type Action = 'state' | 'contact' | 'conversation' | 'fill-message' | 'message'
interface PageState {
  selectedId: string; description: string; chat: 'new' | 'existing' | 'disabled' | 'missing'; greeted: boolean
  conversation: boolean; messageSent: boolean
  blocked: string; acted: boolean
  hrActivity: string; recruiterName: string; recruiterId: string;
  messageCount: number; target?: InteractionTarget
}
// This function runs inside the sandboxed website and uses visible DOM controls only.
export function bossApplicationAction(action: Action, job: Job, message: string, baseline = { messageCount: -1 }): PageState {
  const visible = (e: Element) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const text = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, ' ').trim() || ''
  const disabled = (e: Element) => e.matches(':disabled,[aria-disabled="true"],.unable,.is-disabled,.disabled')
  const pathId = (value: string) => { try { return new URL(value, location.origin).pathname.match(/\/job_detail\/([^/]+)\.html/)?.[1] || '' } catch { return '' } }
  const all = (selector: string, root: ParentNode = document) => [...root.querySelectorAll<HTMLElement>(selector)].filter(visible)
  const detailLink = all('a.more-job-btn[href*="/job_detail/"]')[0]
  const selectedId = detailLink ? pathId((detailLink as HTMLAnchorElement).href) : pathId(location.href)
  const chatButton = all('a.op-btn-chat,a.btn-startchat,button[data-action="contact"]')[0]
  const chat: PageState['chat'] = !chatButton ? 'missing' : disabled(chatButton) ? 'disabled' : /继续沟通/.test(text(chatButton)) ? 'existing' : /立即沟通/.test(text(chatButton)) ? 'new' : 'missing'
  const description = all('.job-detail-body .desc,.job-sec-text,.job-detail-description').map(e => e.innerText).join('\n').trim().slice(0, 100000)
  const hrActivity = text(document.querySelector('.boss-active-time,.boss-active,.active-time,.boss-online,.boss-info .status')).slice(0, 100)
  const recruiterName = text(document.querySelector('.boss-info .boss-name,.boss-info .name,.boss-info .name-text')).slice(0, 100)
  const recruiterId = document.querySelector('a[href*="/boss/"]')?.getAttribute('href')?.match(/\/boss\/([^/.]+)/)?.[1] || ''
  const body = document.body?.innerText || ''
  const loginRequired = all('.sign-form,.login-register,.header-login-btn').length > 0 || location.pathname.startsWith('/web/user/')
  const blocked = loginRequired ? '登录已失效' : /安全验证|请完成验证|访问受限|今日.*(?:沟通|上限)|沟通.*(?:达到|已达).*上限|操作频繁/.exec(body)?.[0] || ''
  const editorNode = all('#chat-input,textarea.input-area,[contenteditable="true"]')[0]
  const root = all('.chat-conversation')[0] || editorNode?.closest<HTMLElement>('.chat-container,.chat-im,.chat-wrap,.chat-box,[role="dialog"]') || (editorNode && selectedId === job.id ? document.body : undefined)
  const normalize = (value: string) => value.replace(/\s|有限责任公司|股份有限公司|有限公司/g, '').toLowerCase()
  const context = normalize(text(root) + ' ' + text(document.querySelector('.chat-content .job-info,.chat-content .job-detail')))
  const detailContext = selectedId === job.id && !!editorNode && context.includes(normalize(job.title)) && normalize(document.body.innerText).includes(normalize(job.company))
  const conversation = !!root && !root.querySelector('.chat-no-data') && !!job.company && ((context.includes(normalize(job.title)) && context.includes(normalize(job.company))) || detailContext)
  const own = root ? all('.message-item.item-myself,.message-item.is-self,[data-own-message]', root) : []
  const normalizedMessage = message.replace(/\s+/g, ' ').trim()
  const matching = own.filter(e => text(e.querySelector('.message-content,.text-content,.message-text,p') || e).replace(/送达|已读/g, '').trim() === normalizedMessage)
  const pendingOrFailed = (e: Element) => !!e.querySelector('.send-fail,.message-fail,.status-fail,.status-sending,.sending,[data-pending="true"]') || e.matches('.sending,.send-fail')
  const messageCount = matching.length
  const messageSent = !!message && messageCount > baseline.messageCount && matching.length > 0 && !pendingOrFailed(matching[matching.length - 1])
  let target: InteractionTarget | undefined
  const act = (element: HTMLElement, fill?: string) => {
    element.scrollIntoView({ block: 'center', inline: 'nearest' })
    const r = element.getBoundingClientRect()
    const token = 'ap-' + Math.random().toString(36).slice(2)
    element.setAttribute('data-apply-target', token)
    target = { token, x: r.x + r.width / 2, y: r.y + r.height / 2, fill }
  }
  let acted = false
  if (action !== 'state' && blocked) return { selectedId, description, chat, greeted: false, conversation, messageSent, blocked, acted, hrActivity, recruiterName, recruiterId, messageCount, target }
  if (action === 'contact' && selectedId === job.id && chat === 'new' && chatButton) { act(chatButton); acted = true }
  if (action === 'conversation') {
    const continueButton = all('a.default-btn.sure-btn,button').find(e => text(e) === '继续沟通')
    if (continueButton) { act(continueButton); acted = true }
    else if (selectedId === job.id && chat === 'existing' && chatButton) { act(chatButton); acted = true }
  }
  if (action === 'fill-message' && conversation && message && !messageSent && root) {
    const editor = all('textarea,#chat-input,[contenteditable="true"]', root)[0]
    if (editor) {
      act(editor, message)
      acted = true
    }
  }
  if (action === 'message' && conversation && message && !messageSent && root) {
    const editor = all('textarea,#chat-input,[contenteditable="true"]', root)[0]
    const draft = editor instanceof HTMLTextAreaElement ? editor.value : text(editor)
    const send = all('div.send-message,button.btn-send,button[type="send"]', root).find(e => !disabled(e))
    if (send && draft.replace(/\s+/g, ' ').trim() === message.replace(/\s+/g, ' ').trim()) { act(send); acted = true }
  }

  return { selectedId, description, chat, greeted: /已向\s*BOSS\s*发送消息/.test(body), conversation, messageSent, blocked, acted, hrActivity, recruiterName, recruiterId, messageCount, target }
}

export async function applyToBoss(browser: AutomationBrowser, job: Job, settings: ApplicationSettings, signal: AbortSignal): Promise<ApplicationOutcome> {
  let message = settings.message
  let evaluation: Pick<ApplicationOutcome, 'score' | 'aiReason' | 'greeting'> = { greeting: message || undefined }
  let baseline = { messageCount: -1 }
  const run = async (action: Action) => {
    signal.throwIfAborted()
    const state: PageState = await browser.execute(`(${bossApplicationAction.toString()})(${JSON.stringify(action)},${JSON.stringify(job)},${JSON.stringify(message)},${JSON.stringify(baseline)})`, signal)
    if (state.blocked) throw new Error(`BOSS 需要处理：${state.blocked}`)
    if (state.target) await browser.interact(state.target, signal)
    return state
  }
  const wait = async (predicate: (state: PageState) => boolean, step: string, timeout = 15000, stableMs = 0) => {
    let confirmedAt = 0
    const deadline = Date.now() + timeout
    do { const state = await run('state'); if (predicate(state)) { confirmedAt ||= Date.now(); if (Date.now() - confirmedAt >= stableMs) return state } else confirmedAt = 0; await delay(250, undefined, { signal }) } while (Date.now() < deadline)
    throw new Error(`BOSS ${step}超时，请检查当前页面`)
  }
  const perform = async (): Promise<ApplicationOutcome> => {
    browser.progress({ detail: '正在读取岗位详情' })
    await browser.navigate(job.url, signal)
    const state = await wait(s => s.selectedId === job.id && s.chat !== 'missing', '打开岗位详情')
    job.description = state.description
    job.hrActivity = state.hrActivity || job.hrActivity
    job.recruiterName = state.recruiterName || job.recruiterName
    job.recruiterId = state.recruiterId || job.recruiterId
    const hrReason = browser.skipReason(job) || hrSkipReason(job, settings)
    if (hrReason) return { status: 'skipped', retryable: true, detail: hrReason }
    if (state.chat === 'existing') return { status: 'skipped', retryable: false, detail: '已沟通过，跳过重复投递' }
    if (state.chat !== 'new') return { status: 'skipped', retryable: true, detail: '岗位当前不能发起沟通' }
    browser.progress({ detail: '正在匹配简历与岗位' })
    const decision = await browser.evaluate(job, state.description, signal)
    signal.throwIfAborted()
    if (decision) evaluation = { score: decision.score, aiReason: decision.reason, greeting: decision.matched ? decision.greeting : undefined }
    if (decision && !decision.matched) return { status: 'skipped', retryable: true, detail: `AI 不匹配（${decision.score}）：${decision.reason}` }
    browser.progress({ ...evaluation, detail: '准备发起沟通' })
    if (decision) message = decision.greeting
    await browser.beforeContact()
    const contact = await run('contact')
    if (!contact.acted) return { status: 'skipped', retryable: true, detail: '岗位状态已变化，未发起沟通' }
    await wait(s => s.greeted || s.conversation || s.chat === 'existing', '确认首次招呼')
    if (!message) return { status: 'greeted', detail: 'BOSS 已确认招呼发送成功' }
    await run('conversation')
    await wait(s => s.conversation, '定位当前岗位会话')
    const initial = await run('state')
    baseline = { messageCount: initial.messageCount }
    if (message) {
      browser.progress({ detail: '正在发送补充消息' })
      await run('fill-message')
      await delay(100, undefined, { signal })
      const sent = await run('message')
      if (!sent.acted && !sent.messageSent) return { status: 'uncertain', detail: '招呼已发送；补充消息入口不可用，请核实' }
      await wait(s => s.messageSent, '确认补充消息发送', 15000, 3000)
    }
    return { status: 'greeted', detail: '招呼和补充消息已发送' }
  }
  const outcome = await perform()
  // Keep the decision alongside the delivery result for review.
  return { ...outcome, ...evaluation }
}
