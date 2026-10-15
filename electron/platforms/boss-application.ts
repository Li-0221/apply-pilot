import { setTimeout as delay } from 'node:timers/promises'
import type { ApplicationOutcome, ApplicationSettings, Job } from '../../shared/contracts'
import type { AutomationBrowser } from './types'

type Action = 'state' | 'select' | 'contact' | 'conversation' | 'fill-message' | 'message' | 'resume' | 'confirm-resume'
interface PageState {
  selectedId: string; description: string; listReady: boolean; chat: 'new' | 'existing' | 'disabled' | 'missing'; greeted: boolean
  conversation: boolean; messageSent: boolean; resume: 'available' | 'waiting-reply' | 'missing'
  resumeSent: boolean; resumeDialog: boolean; blocked: string; acted: boolean
}
// This function runs inside the sandboxed website and uses visible DOM controls only.
export function bossApplicationAction(action: Action, job: Job, message: string): PageState {
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
  const body = document.body?.innerText || ''
  const blocked = /安全验证|请完成验证|访问受限|今日.*(?:沟通|上限)|沟通.*(?:达到|已达).*上限|操作频繁/.exec(body)?.[0] || ''
  const root = all('.chat-conversation')[0]
  const conversation = !!root && text(root).includes(job.title) && (!job.company || text(root).includes(job.company))
  const own = root ? all('.message-item.item-myself,.message-item.is-self,[data-own-message]', root) : []
  const messageSent = !!message && own.some(e => text(e).includes(message.replace(/\s+/g, ' ').trim()) && !e.querySelector('.send-fail,.message-fail,.status-fail') && (!!e.querySelector('.status-delivery,.status-read') || /送达|已读/.test(text(e))))
  const history = root?.querySelector('.chat-message,.chat-record,.im-list,[data-message-list]')
  const resumeSent = !!history && /附件简历已发送|已发送附件简历|已发送简历|简历发送成功/.test(text(history))
  const resumeButton = root && all('.toolbar-btn,button,a', root).find(e => /^发简历$/.test(text(e)))
  const resume: PageState['resume'] = !resumeButton ? 'missing' : disabled(resumeButton) ? 'waiting-reply' : 'available'
  const dialogs = all('[role="dialog"],.dialog-container,.dialog-wrap,.boss-dialog')
  const resumeDialog = dialogs.find(e => /简历/.test(text(e)) && all('button,a', e).some(b => /^(发送|确定|确认发送|发送简历)$/.test(text(b))))
  let acted = false
  if (action !== 'state' && blocked) return { selectedId, description, listReady, chat, greeted: false, conversation, messageSent, resume, resumeSent, resumeDialog: !!resumeDialog, blocked, acted }
  if (action === 'select') {
    const dismiss = all('a,button').find(e => text(e) === '留在此页')
    dismiss?.click()
    const link = all('a[href*="/job_detail/"]').find(e => pathId((e as HTMLAnchorElement).href) === job.id)
    if (link) { link.click(); acted = true }
  }
  if (action === 'contact' && selectedId === job.id && chat === 'new' && chatButton) { chatButton.click(); acted = true }
  if (action === 'conversation') {
    const continueButton = all('a.default-btn.sure-btn,button').find(e => text(e) === '继续沟通')
    if (continueButton) { continueButton.click(); acted = true }
  }
  if (action === 'fill-message' && conversation && message && !messageSent && root) {
    const editor = all('textarea,#chat-input,[contenteditable="true"]', root)[0]
    if (editor) {
      editor.focus()
      if (editor instanceof HTMLTextAreaElement) Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(editor, message)
      else editor.textContent = message
      editor.dispatchEvent(new Event('input', { bubbles: true }))
      acted = true
    }
  }
  if (action === 'message' && conversation && message && !messageSent && root) {
    const editor = all('textarea,#chat-input,[contenteditable="true"]', root)[0]
    const draft = editor instanceof HTMLTextAreaElement ? editor.value : text(editor)
    const send = all('div.send-message,button.btn-send,button[type="send"]', root).find(e => !disabled(e))
    if (send && draft.replace(/\s+/g, ' ').trim() === message.replace(/\s+/g, ' ').trim()) { send.click(); acted = true }
  }
  if (action === 'resume' && conversation && resume === 'available' && !resumeSent && resumeButton) { resumeButton.click(); acted = true }
  if (action === 'confirm-resume' && conversation && resumeDialog && !resumeSent) {
    // Never guess which attachment to send when the website offers several choices.
    const choices = all('input[type="radio"],[role="radio"]', resumeDialog)
    if (choices.length <= 1 || choices.some(e => e.matches(':checked,[aria-checked="true"]'))) {
      const buttons = all('button,a', resumeDialog).filter(e => /^(发送|确定|确认发送|发送简历)$/.test(text(e)) && !disabled(e))
      if (buttons.length === 1) { buttons[0].click(); acted = true }
    }
  }
  return { selectedId, description, listReady, chat, greeted: /已向\s*BOSS\s*发送消息/.test(body), conversation, messageSent, resume, resumeSent, resumeDialog: !!resumeDialog, blocked, acted }
}

export async function applyToBoss(browser: AutomationBrowser, job: Job, settings: ApplicationSettings, signal: AbortSignal): Promise<ApplicationOutcome> {
  let message = settings.message
  let evaluation: Pick<ApplicationOutcome, 'score' | 'aiReason' | 'greeting'> = {}
  const run = async (action: Action) => {
    signal.throwIfAborted()
    const state: PageState = await browser.execute(`(${bossApplicationAction.toString()})(${JSON.stringify(action)},${JSON.stringify(job)},${JSON.stringify(message)})`, signal)
    if (state.blocked) throw new Error(`BOSS 需要处理：${state.blocked}`)
    return state
  }
  const wait = async (predicate: (state: PageState) => boolean, timeout = 10000) => {
    const deadline = Date.now() + timeout
    do { const state = await run('state'); if (predicate(state)) return state; await delay(250, undefined, { signal }) } while (Date.now() < deadline)
    throw new Error('BOSS 页面响应超时')
  }
  const perform = async (): Promise<ApplicationOutcome> => {
    await browser.navigate(browser.listUrl, signal)
    try { await wait(s => s.listReady, 3000) } catch (error) {
      if (signal.aborted || !(error instanceof Error) || error.message !== 'BOSS 页面响应超时') throw error
      return { status: 'skipped', resume: 'not-requested', retryable: true, detail: '岗位已不在当前列表，未发起沟通' }
    }
    const selected = await run('select')
    if (!selected.acted && selected.selectedId !== job.id) return { status: 'skipped', resume: 'not-requested', retryable: true, detail: '岗位已不在当前列表，未发起沟通' }
    const state = await wait(s => s.selectedId === job.id && s.chat !== 'missing')
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
    await wait(s => s.greeted || s.conversation)
    if (!message && !settings.sendResume) return { status: 'greeted', resume: 'not-requested', detail: 'BOSS 已确认招呼发送成功' }
    await run('conversation')
    await wait(s => s.conversation)
    if (message) {
      await run('fill-message')
      await delay(100, undefined, { signal })
      const sent = await run('message')
      if (!sent.acted && !sent.messageSent) return { status: 'uncertain', resume: 'not-requested', detail: '招呼已发送；补充消息入口不可用，请核实' }
      await wait(s => s.messageSent)
    }
    if (!settings.sendResume) return { status: 'greeted', resume: 'not-requested', detail: '招呼和补充消息已发送' }
    const ready = await run('state')
    if (ready.resumeSent) return { status: 'resume-sent', resume: 'sent', detail: 'BOSS 已确认附件简历发送成功' }
    if (ready.resume === 'waiting-reply') return { status: 'greeted', resume: 'waiting-reply', detail: '招呼已发送，附件简历需双方回复后才能发送' }
    if (ready.resume !== 'available') return { status: 'greeted', resume: 'unavailable', detail: '招呼已发送，当前未提供附件简历入口' }
    const requested = await run('resume')
    if (!requested.acted) return { status: 'greeted', resume: 'unavailable', detail: '招呼已发送，附件简历入口不可用' }
    const result = await wait(s => s.resumeSent || s.resumeDialog || s.resume === 'waiting-reply')
    if (result.resumeSent) return { status: 'resume-sent', resume: 'sent', detail: '附件简历已发送' }
    if (result.resume === 'waiting-reply' && !result.resumeDialog) return { status: 'greeted', resume: 'waiting-reply', detail: '招呼已发送，附件简历需双方回复后才能发送' }
    const confirmed = await run('confirm-resume')
    if (!confirmed.acted) return { status: 'greeted', resume: 'unavailable', detail: '招呼已发送，请在 BOSS 中选择要发送的附件简历' }
    await wait(s => s.resumeSent)
    return { status: 'resume-sent', resume: 'sent', detail: 'BOSS 已确认附件简历发送成功' }
  }
  const outcome = await perform()
  // Keep the decision alongside the delivery result for review.
  return { ...outcome, ...evaluation }
}
