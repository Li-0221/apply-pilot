import { hrSkipReason } from '../hr-activity'
import { setTimeout as delay } from 'node:timers/promises'
import type { ApplicationOutcome, ApplicationSettings, Job } from '../../shared/contracts'
import type { AutomationBrowser, InteractionTarget } from './types'

type Action = 'state' | 'select' | 'contact' | 'conversation' | 'fill-message' | 'message' | 'resume' | 'confirm-resume'
interface PageState {
  selectedId: string; description: string; listReady: boolean; chat: 'new' | 'existing' | 'disabled' | 'missing'; greeted: boolean
  conversation: boolean; messageSent: boolean; resume: 'available' | 'waiting-reply' | 'missing'
  resumeSent: boolean; resumeDialog: boolean; blocked: string; acted: boolean
  hrActivity: string; recruiterName: string; recruiterId: string;
  messageCount: number; resumeCount: number; target?: InteractionTarget
}
// This function runs inside the sandboxed website and uses visible DOM controls only.
export function bossApplicationAction(action: Action, job: Job, message: string, baseline = { messageCount: -1, resumeCount: -1 }): PageState {
  const visible = (e: Element) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const text = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, ' ').trim() || ''
  const disabled = (e: Element) => e.matches(':disabled,[aria-disabled="true"],.unable,.is-disabled,.disabled')
  const pathId = (value: string) => { try { return new URL(value, location.origin).pathname.match(/\/job_detail\/([^/]+)\.html/)?.[1] || '' } catch { return '' } }
  const all = (selector: string, root: ParentNode = document) => [...root.querySelectorAll<HTMLElement>(selector)].filter(visible)
  const detailLink = all('a.more-job-btn[href*="/job_detail/"]')[0]
  const selectedId = detailLink ? pathId((detailLink as HTMLAnchorElement).href) : pathId(location.href)
  const listReady = all('a[href*="/job_detail/"]').some(e => pathId((e as HTMLAnchorElement).href) === job.id)
  const chatButton = all('a.op-btn-chat,a.btn-startchat,button[data-action="contact"]')[0]
  const chat: PageState['chat'] = !chatButton ? 'missing' : disabled(chatButton) ? 'disabled' : /继续沟通/.test(text(chatButton)) ? 'existing' : /立即沟通/.test(text(chatButton)) ? 'new' : 'missing'
  const description = all('.job-detail-body .desc,.job-sec-text,.job-detail-description').map(e => e.innerText).join('\n').trim().slice(0, 16000)
  const hrActivity = text(document.querySelector('.boss-active-time,.boss-active,.active-time,.boss-online,.boss-info .status')).slice(0, 100)
  const recruiterName = text(document.querySelector('.boss-info .boss-name,.boss-info .name,.boss-info .name-text')).slice(0, 100)
  const recruiterId = document.querySelector('a[href*="/boss/"]')?.getAttribute('href')?.match(/\/boss\/([^/.]+)/)?.[1] || ''
  const body = document.body?.innerText || ''
  const blocked = /安全验证|请完成验证|访问受限|今日.*(?:沟通|上限)|沟通.*(?:达到|已达).*上限|操作频繁/.exec(body)?.[0] || ''
  const root = all('.chat-conversation')[0]
  const normalize = (value: string) => value.replace(/\s|有限责任公司|股份有限公司|有限公司/g, '').toLowerCase()
  const context = normalize(text(root) + ' ' + text(document.querySelector('.chat-content .job-info,.chat-content .job-detail')))
  const conversation = !!root && !root.querySelector('.chat-no-data') && context.includes(normalize(job.title)) && !!job.company && context.includes(normalize(job.company))
  const own = root ? all('.message-item.item-myself,.message-item.is-self,[data-own-message]', root) : []
  const normalizedMessage = message.replace(/\s+/g, ' ').trim()
  const matching = own.filter(e => text(e.querySelector('.message-content,.text-content,p') || e).replace(/送达|已读/g, '').trim() === normalizedMessage)
  const pendingOrFailed = (e: Element) => !!e.querySelector('.send-fail,.message-fail,.status-fail,.status-sending,.sending,[data-pending="true"]') || e.matches('.sending,.send-fail')
  const messageCount = matching.length
  const messageSent = !!message && messageCount > baseline.messageCount && matching.length > 0 && !pendingOrFailed(matching[matching.length - 1])
  const resumeMessages = own.filter(e => /附件简历已发送|已发送附件简历|已发送简历|简历发送成功/.test(text(e)))
  const resumeCount = resumeMessages.length
  const resumeSent = resumeCount > baseline.resumeCount && resumeCount > 0 && !pendingOrFailed(resumeMessages[resumeCount - 1])
  const resumeButton = root && all('.toolbar-btn,button,a', root).find(e => /^发简历$/.test(text(e)))
  const resume: PageState['resume'] = !resumeButton ? 'missing' : disabled(resumeButton) ? 'waiting-reply' : 'available'
  const dialogs = all('[role="dialog"],.dialog-container,.dialog-wrap,.boss-dialog')
  const resumeDialog = dialogs.find(e => /简历/.test(text(e)) && all('button,a', e).some(b => /^(发送|确定|确认发送|发送简历)$/.test(text(b))))
  let target: InteractionTarget | undefined
  const act = (element: HTMLElement, fill?: string) => {
    element.scrollIntoView({ block: 'center', inline: 'nearest' })
    const r = element.getBoundingClientRect()
    const token = 'ap-' + Math.random().toString(36).slice(2)
    element.setAttribute('data-apply-target', token)
    target = { token, x: r.x + r.width / 2, y: r.y + r.height / 2, fill }
  }
  let acted = false
  if (action !== 'state' && blocked) return { selectedId, description, listReady, chat, greeted: false, conversation, messageSent, resume, resumeSent, resumeDialog: !!resumeDialog, blocked, acted, hrActivity, recruiterName, recruiterId, messageCount, resumeCount, target }
  if (action === 'select') {
    const dismiss = all('a,button').find(e => text(e) === '留在此页')
    if (dismiss) act(dismiss)
    const link = all('a[href*="/job_detail/"]').find(e => pathId((e as HTMLAnchorElement).href) === job.id)
    if (link) { act(link); acted = true }
  }
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
  if (action === 'resume' && conversation && resume === 'available' && !resumeSent && resumeButton) { act(resumeButton); acted = true }
  if (action === 'confirm-resume' && conversation && resumeDialog && !resumeSent) {
    // Never guess which attachment to send when the website offers several choices.
    const choices = all('input[type="radio"],[role="radio"]', resumeDialog)
    if (choices.length <= 1 || choices.some(e => e.matches(':checked,[aria-checked="true"]'))) {
      const buttons = all('button,a', resumeDialog).filter(e => /^(发送|确定|确认发送|发送简历)$/.test(text(e)) && !disabled(e))
      if (buttons.length === 1) { act(buttons[0]); acted = true }
    }
  }
  return { selectedId, description, listReady, chat, greeted: /已向\s*BOSS\s*发送消息/.test(body), conversation, messageSent, resume, resumeSent, resumeDialog: !!resumeDialog, blocked, acted, hrActivity, recruiterName, recruiterId, messageCount, resumeCount, target }
}

export async function applyToBoss(browser: AutomationBrowser, job: Job, settings: ApplicationSettings, signal: AbortSignal): Promise<ApplicationOutcome> {
  let message = settings.message
  let evaluation: Pick<ApplicationOutcome, 'score' | 'aiReason' | 'greeting'> = {}
  let baseline = { messageCount: -1, resumeCount: -1 }
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
    await browser.navigate(job.url, signal)
    const state = await wait(s => s.selectedId === job.id && s.chat !== 'missing', '打开岗位详情')
    job.description = state.description
    job.hrActivity = state.hrActivity || job.hrActivity
    job.recruiterName = state.recruiterName || job.recruiterName
    job.recruiterId = state.recruiterId || job.recruiterId
    const hrReason = browser.skipReason(job) || hrSkipReason(job, settings)
    if (hrReason) return { status: 'skipped', resume: 'not-requested', retryable: true, detail: hrReason }
    if (state.chat === 'existing') return { status: 'skipped', resume: 'not-requested', retryable: false, detail: '已沟通过，跳过重复投递' }
    if (state.chat !== 'new') return { status: 'skipped', resume: 'not-requested', retryable: true, detail: '岗位当前不能发起沟通' }
    const decision = await browser.evaluate(job, state.description, signal)
    signal.throwIfAborted()
    if (decision) evaluation = { score: decision.score, aiReason: decision.reason, greeting: decision.matched ? decision.greeting : undefined }
    if (decision && !decision.matched) return { status: 'skipped', resume: 'not-requested', retryable: true, detail: `AI 不匹配（${decision.score}）：${decision.reason}` }
    if (decision) message = decision.greeting
    browser.beforeContact()
    const contact = await run('contact')
    if (!contact.acted) return { status: 'skipped', resume: 'not-requested', retryable: true, detail: '岗位状态已变化，未发起沟通' }
    await wait(s => s.greeted || s.conversation || s.chat === 'existing', '确认首次招呼')
    if (!message && !settings.sendResume) return { status: 'greeted', resume: 'not-requested', detail: 'BOSS 已确认招呼发送成功' }
    await run('conversation')
    await wait(s => s.conversation, '定位当前岗位会话')
    const initial = await run('state')
    baseline = { messageCount: initial.messageCount, resumeCount: initial.resumeCount }
    if (message) {
      await run('fill-message')
      await delay(100, undefined, { signal })
      const sent = await run('message')
      if (!sent.acted && !sent.messageSent) return { status: 'uncertain', resume: 'not-requested', detail: '招呼已发送；补充消息入口不可用，请核实' }
      await wait(s => s.messageSent, '确认补充消息发送', 15000, 1500)
    }
    if (!settings.sendResume) return { status: 'greeted', resume: 'not-requested', detail: '招呼和补充消息已发送' }
    const ready = await run('state')

    if (ready.resume === 'waiting-reply') return { status: 'greeted', resume: 'waiting-reply', detail: '招呼已发送，附件简历需双方回复后才能发送' }
    if (ready.resume !== 'available') return { status: 'greeted', resume: 'unavailable', detail: '招呼已发送，当前未提供附件简历入口' }
    const requested = await run('resume')
    if (!requested.acted) return { status: 'greeted', resume: 'unavailable', detail: '招呼已发送，附件简历入口不可用' }
    const result = await wait(s => s.resumeSent || s.resumeDialog || s.resume === 'waiting-reply', '打开附件简历')
    if (result.resumeSent) return { status: 'resume-sent', resume: 'sent', detail: '附件简历已发送' }
    if (result.resume === 'waiting-reply' && !result.resumeDialog) return { status: 'greeted', resume: 'waiting-reply', detail: '招呼已发送，附件简历需双方回复后才能发送' }
    const confirmed = await run('confirm-resume')
    if (!confirmed.acted) return { status: 'greeted', resume: 'unavailable', detail: '招呼已发送，请在 BOSS 中选择要发送的附件简历' }
    await wait(s => s.resumeSent, '确认附件简历发送', 15000, 1500)
    return { status: 'resume-sent', resume: 'sent', detail: 'BOSS 已确认附件简历发送成功' }
  }
  const outcome = await perform()
  // Keep the decision alongside the delivery result for review.
  return { ...outcome, ...evaluation }
}
