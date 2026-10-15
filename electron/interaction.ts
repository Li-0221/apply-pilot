import { setTimeout as delay } from 'node:timers/promises'
import type { WebContents } from 'electron'
import type { InteractionTarget } from './platforms/types'

interface Point { x: number; y: number; editor: 'textarea' | 'contenteditable' | null }
// Resolve the marked element again, as a browser locator does before a click.
// A moved element is allowed; an obscured element never receives a forced click.
export async function interactWithPage(page: WebContents, target: InteractionTarget, execute: <T>(script: string, signal: AbortSignal) => Promise<T>, signal: AbortSignal) {
  signal.throwIfAborted()
  if (!/^ap-[a-z0-9]+$/.test(target.token)) throw new Error('页面操作目标失效')
  const selector = `[data-apply-target="${target.token}"]`
  let previous: Point | null = null
  let point: Point | null = null
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const current = await execute<Point | null>(`(() => {
      const e = document.querySelector(${JSON.stringify(selector)});
      if (!(e instanceof HTMLElement) || e.matches(':disabled,[readonly],[aria-disabled="true"],.disabled,.disable')) return null;
      const r = e.getBoundingClientRect(), style = getComputedStyle(e);
      if (r.width <= 0 || r.height <= 0 || style.visibility === 'hidden' || style.display === 'none') return null;
      const left = Math.max(0, r.left), right = Math.min(innerWidth, r.right), top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
      if (right <= left || bottom <= top) { e.scrollIntoView({block:'center',inline:'nearest'}); return null; }
      const x = (left + right) / 2, y = (top + bottom) / 2, hit = document.elementFromPoint(x, y);
      if (e !== hit && !e.contains(hit)) return null;
      return { x, y, editor: e instanceof HTMLTextAreaElement ? 'textarea' : e.isContentEditable ? 'contenteditable' : null };
    })()`, signal)
    signal.throwIfAborted()
    if (current && previous && Math.abs(current.x - previous.x) < 0.5 && Math.abs(current.y - previous.y) < 0.5) { point = current; break }
    previous = current
    await delay(100, undefined, { signal })
  }
  if (!point) throw new Error('当前步骤的控件不可点击，可能仍被弹窗遮挡')
  const zoom = page.getZoomFactor()
  const position = { x: Math.round(point.x * zoom), y: Math.round(point.y * zoom) }
  signal.throwIfAborted()
  page.focus()
  page.sendInputEvent({ type: 'mouseMove', ...position })
  page.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...position })
  page.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...position })
  if (target.fill === undefined) return
  const focused = await execute<boolean>(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e?.focus(); return !!e && document.activeElement === e; })()`, signal)
  if (!focused) throw new Error('聊天输入框未获得焦点，未填写消息')
  if (point.editor === 'textarea') {
    page.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: [process.platform === 'darwin' ? 'meta' : 'control'] })
    page.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers: [process.platform === 'darwin' ? 'meta' : 'control'] })
    await page.insertText(target.fill)
  } else if (point.editor === 'contenteditable') {
    await execute(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e?.isContentEditable) throw new Error('聊天输入框已变化'); e.innerText = ${JSON.stringify(target.fill)}; e.dispatchEvent(new Event('input', {bubbles:true})); })()`, signal)
  } else throw new Error('当前控件不是聊天输入框，未填写消息')
}
