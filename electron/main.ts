import { randomUUID } from 'node:crypto'
import { blacklistReason } from '../shared/blacklist'
import { candidateJobs } from './candidates'
import { app, BrowserWindow, WebContentsView, ipcMain, session, dialog, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Command, Snapshot, ViewBounds } from '../shared/contracts'
import { platforms, getPlatform } from './platforms'
import type { PageInspection, InteractionTarget } from './platforms/types'
import { LocalStore } from './store'
import { SessionVault } from './session-vault'
import { TaskRunner } from './task-runner'
import { AiClient } from './ai'
import { AiKeyVault } from './ai-key-vault'
import { parseBounds, parseCommand, parseResumeImport } from './security'
import { extractResumeInWorker } from './resume-import'

app.setName('Apply Pilot')
// Keep the desktop MVP profile after extraction; this is separate from the Java profile.
app.setPath('userData', process.env.APPLY_PILOT_DATA_DIR || process.env.GET_JOBS_DATA_DIR || join(app.getPath('appData'), 'Get Jobs'))
if (!app.requestSingleInstanceLock()) app.quit()

const adapter = getPlatform('boss')
let window: BrowserWindow
let browser: WebContentsView | null = null
let store: LocalStore
let vault: SessionVault
let aiKeys: AiKeyVault
let taskAi: AiClient | null = null
let startingTask: AbortController | null = null
let testingAi = false
let resumeImport: AbortController | null = null
let state: Snapshot
let closing = false
let saving: Promise<void> = Promise.resolve()
let saveTimer: ReturnType<typeof setTimeout> | undefined
let probeTimer: ReturnType<typeof setInterval> | undefined
let probePending = false
let navigationPending = false
let logId = 0
let bounds: ViewBounds = { x: 0, y: 0, width: 0, height: 0, visible: false }

function publish() {
  if (!window?.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('desktop:snapshot', state)
}
function log(message: string, level: 'info' | 'success' | 'error' = 'info') {
  state.logs = [...state.logs.slice(-199), { id: ++logId, time: new Date().toISOString(), level, message }]
  publish()
}

async function saveSession() {
  clearTimeout(saveTimer)
  // A cleared or never-opened workspace must stay signed out across shutdown.
  if (!state.browser.opened && !state.savedAt) return
  // Serialize snapshots so cookie-change, manual save and shutdown cannot race.
  saving = saving.catch(() => {}).then(async () => {
    await vault.save()
    store.value.savedAt = new Date().toISOString()
    store.save()
    state.savedAt = store.value.savedAt
    publish()
  })
  return saving
}

function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void saveSession().catch(() => log('自动保存登录会话失败，请检查系统安全存储后手动保存', 'error')), 1200)
}

function liveContents() {
  const contents = browser?.webContents
  return contents && !contents.isDestroyed() ? contents : null
}

function applyBounds() {
  const contents = liveContents()
  if (!browser || !contents) return
  if (!bounds.visible) { browser.setVisible(false); return }
  const content = window.getContentBounds()
  const x = Math.max(0, Math.min(bounds.x, content.width))
  const y = Math.max(0, Math.min(bounds.y, content.height))
  browser.setBounds({ x, y, width: Math.max(0, Math.min(bounds.width, content.width - x)), height: Math.max(0, Math.min(bounds.height, content.height - y)) })
  // Boss uses a fixed desktop minimum width; keep its login controls in view.
  contents.setZoomFactor(Math.min(1, Math.max(0.6, bounds.width / 1180)))
  browser.setVisible(bounds.visible && bounds.width > 0 && bounds.height > 0)
}

function ensureBrowser() {
  if (browser && liveContents()) { state.browser.opened = true; applyBounds(); return browser }
  browser = new WebContentsView({ webPreferences: {
    partition: adapter.partition, nodeIntegration: false, contextIsolation: true,
    sandbox: true, webSecurity: true, allowRunningInsecureContent: false,
  } })
  window.contentView.addChildView(browser)
  const view = browser
  const contents = browser.webContents
  contents.once('destroyed', () => {
    if (browser !== view) return
    browser = null
    if (!window.isDestroyed() && window.contentView.children.includes(view)) window.contentView.removeChildView(view)
    if (closing) return
    runner.stop()
    state.auth = 'unknown'
    state.account = ''
    const message = 'Boss 页面已关闭，请重新打开'
    state.browser = { ...state.browser, opened: false, loading: false, error: message }
    log(message, 'error')
  })
  contents.setWindowOpenHandler(({ url }) => {
    if (adapter.isAllowedUrl(url) && !navigationPending) void navigate(url).catch(error => log(error.message, 'error'))
    return { action: 'deny' }
  })
  const guard = (event: Electron.Event, url: string) => {
    if (!adapter.isAllowedUrl(url)) { event.preventDefault(); log('已阻止跳转到 Boss 以外的网站', 'error') }
  }
  contents.on('will-navigate', guard)
  contents.on('will-redirect', guard)
  contents.on('did-start-loading', () => { state.browser.loading = true; publish() })
  contents.on('did-stop-loading', () => {
    state.browser.loading = false
    updateUrl()
    publish()
    if (!runner.running && !navigationPending) void inspect().catch(() => {})
  })
  const updateUrl = () => {
    try { const url = new URL(contents.getURL()); state.browser.url = `${url.origin}${url.pathname}` } catch { /* initial blank page */ }
  }
  contents.on('did-navigate', () => { updateUrl(); applyBounds(); publish() })
  contents.on('did-navigate-in-page', () => { updateUrl(); publish() })
  contents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return
    state.browser.error = `页面加载失败（${code}），请检查网络后重新加载`
    log(state.browser.error, 'error')
  })
  contents.on('render-process-gone', () => {
    runner.stop()
    state.auth = 'unknown'
    state.browser.opened = false
    state.browser.loading = false
    state.browser.error = 'Boss 页面进程已退出，请重新打开页面'
    log(state.browser.error, 'error')
  })
  contents.on('will-prevent-unload', event => event.preventDefault())
  state.browser.opened = true
  applyBounds()
  return browser
}

async function navigate(url: string) {
  if (!adapter.isAllowedUrl(url)) throw new Error('只允许打开 Boss 直聘页面')
  if (navigationPending) throw new Error('页面正在打开，请稍候')
  navigationPending = true
  state.browser.error = null
  state.auth = 'checking'
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const page = ensureBrowser().webContents
    publish()
    await Promise.race([
      page.loadURL(url),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { page.stop(); reject(new Error('打开页面超时，请检查网络后重试')) }, 30_000) }),
    ])
    await inspect()
  } catch (error) {
    state.auth = 'unknown'
    state.browser.loading = false
    state.browser.error = !liveContents() ? 'Boss 页面已关闭，请重新打开' : error instanceof Error ? error.message : '打开页面失败'
    throw new Error(state.browser.error, { cause: error })
  } finally { clearTimeout(timer); navigationPending = false; publish() }
}

async function inspect(): Promise<PageInspection> {
  const page = liveContents()
  if (!page || page.isDestroyed() || !adapter.isAllowedUrl(page.getURL())) throw new Error('请先打开 Boss 直聘页面')
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result: PageInspection = await Promise.race([
      page.executeJavaScript(adapter.inspectScript),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('读取页面超时，请重新加载页面后重试')), 8000) }),
    ])
    // The website is untrusted; only a bounded, expected result crosses into local state.
    if (!result || !['unknown', 'checking', 'signed-out', 'signed-in', 'verification'].includes(result.auth) || typeof result.account !== 'string' || !Array.isArray(result.jobs)) throw new Error('页面返回了无效数据')
    result.jobs = result.jobs.slice(0, 500).filter(job =>
      job && job.platform === adapter.descriptor.id && typeof job.id === 'string' && job.id.length < 200 &&
      typeof job.title === 'string' && typeof job.company === 'string' && typeof job.salary === 'string' &&
      typeof job.location === 'string' && typeof job.collectedAt === 'string' && Array.isArray(job.tags) &&
      job.tags.every((tag: unknown) => typeof tag === 'string') && adapter.isAllowedUrl(job.url) &&
      new URL(job.url).pathname.startsWith('/job_detail/'))
    const previousAuth = state.auth
    state.auth = result.auth
    state.account = result.account.slice(0, 50)
    if (previousAuth !== result.auth && result.auth === 'signed-in') { log('已确认 Boss 登录状态', 'success'); scheduleSave() }
    publish()
    return result
  } finally { clearTimeout(timer) }
}

async function execute<T>(script: string, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  const page = liveContents()
  if (!page || !adapter.isAllowedUrl(page.getURL())) throw new Error('请先打开 BOSS 页面')
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([page.executeJavaScript(script), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('读取 BOSS 页面状态超时')), 8000)
    })])
  } finally { clearTimeout(timer) }
}
async function interact(target: InteractionTarget, signal: AbortSignal) {
  signal.throwIfAborted()
  const page = liveContents()
  if (!page || !/^ap-[a-z0-9]+$/.test(target.token)) throw new Error('页面操作目标失效')
  const valid = await execute<boolean>(`(() => {
    const e = document.querySelector('[data-apply-target="${target.token}"]');
    if (!e) return false;
    const r = e.getBoundingClientRect(), hit = document.elementFromPoint(${target.x}, ${target.y});
    return r.width > 0 && r.height > 0 && (e === hit || e.contains(hit));
  })()`, signal)
  if (!valid) throw new Error('页面控件已变化或被遮挡，请在 BOSS 页面核实')
  const zoom = page.getZoomFactor()
  const point = { x: Math.round(target.x * zoom), y: Math.round(target.y * zoom) }
  page.focus()
  page.sendInputEvent({ type: 'mouseMove', ...point })
  page.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point })
  page.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point })
  if (target.fill !== undefined) {
    page.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: [process.platform === 'darwin' ? 'meta' : 'control'] })
    page.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers: [process.platform === 'darwin' ? 'meta' : 'control'] })
    await page.insertText(target.fill)
  }
}
const runner = new TaskRunner({
  candidates: (settings, signal) => candidateJobs(settings, adapter, {
    currentUrl: () => liveContents()?.getURL() || '',
    navigate: async (url, taskSignal) => { taskSignal.throwIfAborted(); await navigate(url); taskSignal.throwIfAborted() },
    inspect,
    scroll: async taskSignal => { await execute(adapter.scrollScript, taskSignal) },
    log,
  }, signal),
  apply: (job, settings, signal, beforeContact, progress) => adapter.apply({
    execute, interact,
    beforeContact: async () => { const reason = blacklistReason(job, store.value.blacklist); if (reason) throw new Error(reason); await beforeContact() },
    progress,
    skipReason: candidate => blacklistReason(candidate, store.value.blacklist),
    evaluate: (candidate, description, taskSignal) => taskAi ? taskAi.evaluate(candidate, description, taskSignal) : Promise.resolve(null),
    navigate: async (url, taskSignal) => {
      taskSignal.throwIfAborted()
      if (liveContents()?.getURL() !== url) await navigate(url)
      taskSignal.throwIfAborted()
    },
  }, job, settings, signal),
  blacklist: () => store.value.blacklist,
  hasApplication: job => store.hasApplication(job),
  record: record => { store.record(record); state.applications = store.value.applications; state.history = store.value.history; publish() },
  log,
  saveTask: task => { store.saveTask(task); state.tasks = store.value.tasks },
  update: task => { state.task = task; publish() },
})

function authorize(event: IpcMainInvokeEvent) {
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('未经授权的调用')
  const allowedUrl = process.env.ELECTRON_RENDERER_URL || pathToFileURL(join(__dirname, '../dist/index.html')).href
  if (event.senderFrame.url !== allowedUrl && event.senderFrame.url !== `${allowedUrl}/`) throw new Error('未经授权的页面')
}

function ensureIdle(type: Command['type'] | 'import-resume') {
  const passive = ['snapshot', 'stop', 'save-session', 'cancel-resume-import', 'add-blacklist', 'remove-blacklist'].includes(type)
  if (testingAi && !passive) throw new Error('正在测试 AI 连接，请稍候')
  if ((runner.running || startingTask) && !passive) throw new Error('请先停止当前投递任务')
  if (navigationPending && !passive) throw new Error('页面正在加载，请稍候')
  if (resumeImport && !passive) throw new Error('正在解析简历，请稍候或取消解析')
}

app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus() } })

app.whenReady().then(async () => {
  store = new LocalStore(app.getPath('userData'))
  aiKeys = new AiKeyVault(app.getPath('userData'))
  state = {
    platforms: [...platforms.values()].map(platform => platform.descriptor), activePlatform: 'boss',
    auth: 'unknown', account: '', browser: { opened: false, loading: false, url: '', error: null },
    tasks: store.value.tasks,
    task: { status: 'idle', attempted: 0, sent: 0, skipped: 0, failed: 0, message: '等待开始' },
    history: store.value.history, blacklist: store.value.blacklist, settings: store.value.settings, applications: store.value.applications, logs: [], savedAt: store.value.savedAt,
    ai: { ...store.value.ai, keyConfigured: aiKeys.configured },
    runtime: { electron: process.versions.electron, chromium: process.versions.chrome, node: process.versions.node, dataPath: app.getPath('userData') },
  }
  const platformSession = session.fromPartition(adapter.partition)
  platformSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  platformSession.setPermissionCheckHandler(() => false)
  platformSession.on('will-download', event => event.preventDefault())
  vault = new SessionVault(platformSession, app.getPath('userData'))
  let restoreError: string | null = null
  try { await vault.restore() } catch (error) { restoreError = error instanceof Error ? error.message : '会话恢复失败，请重新登录' }
  platformSession.cookies.on('changed', () => { if (!closing) scheduleSave() })

  window = new BrowserWindow({
    width: 1440, height: 980, minWidth: 1100, minHeight: 760,
    title: 'Apply Pilot', backgroundColor: '#ffffff',
    webPreferences: { preload: join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true },
  })
  window.setMenuBarVisibility(false)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('did-start-loading', () => { bounds.visible = false; applyBounds() })
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.on('resize', applyBounds)
  window.on('close', event => {
    if (closing) return
    event.preventDefault()
    closing = true
    startingTask?.abort()
    runner.stop()
    resumeImport?.abort()
    clearInterval(probeTimer)
    clearTimeout(saveTimer)
    liveContents()?.stop()
    let shutdownTimer: ReturnType<typeof setTimeout> | undefined
    void Promise.race([saveSession(), new Promise<void>(resolve => { shutdownTimer = setTimeout(resolve, 5000) })]).catch(() => {}).finally(() => {
      clearTimeout(shutdownTimer)
      liveContents()?.close()
      window.destroy()
      app.quit()
    })
  })
  ipcMain.handle('desktop:bounds', (event, input: unknown) => { authorize(event); bounds = parseBounds(input); applyBounds() })
  ipcMain.handle('desktop:import-resume', async (event, input: unknown) => {
    authorize(event)
    ensureIdle('import-resume')
    const file = parseResumeImport(input)
    const client = new AiClient(file.settings, file.key || aiKeys.read())
    const controller = new AbortController()
    resumeImport = controller
    try {
      const text = await extractResumeInWorker(file.name, file.data, controller.signal)
      controller.signal.throwIfAborted()
      const markdown = await client.resumeMarkdown(text, controller.signal)
      controller.signal.throwIfAborted()
      log('简历已解析，编辑后保存', 'success')
      return markdown
    } catch (error) {
      if (controller.signal.aborted) return null
      throw error
    } finally { if (resumeImport === controller) resumeImport = null }
  })
  ipcMain.handle('desktop:command', async (event, input: unknown) => {
    authorize(event)
    const command = parseCommand(input)
    ensureIdle(command.type)
    switch (command.type) {
      case 'snapshot': break
      case 'add-blacklist':
        if (store.value.blacklist.length >= 2000) throw new Error('黑名单最多 2000 条')
        if (!store.value.blacklist.some(entry => entry.platform === command.entry.platform && entry.kind === command.entry.kind && entry.match === command.entry.match && entry.value === command.entry.value)) store.value.blacklist.push({ ...command.entry, id: randomUUID(), createdAt: new Date().toISOString() })
        store.save(); state.blacklist = [...store.value.blacklist]; log('已加入黑名单', 'success')
        break
      case 'remove-blacklist':
        store.value.blacklist = store.value.blacklist.filter(entry => entry.id !== command.id)
        store.save(); state.blacklist = [...store.value.blacklist]; log('已移出黑名单')
        break
      case 'cancel-resume-import': resumeImport?.abort(); break
      case 'open': await navigate(getPlatform(command.platform).entryUrl); log('Boss 页面已打开'); break
      case 'reload': {
        const url = liveContents()?.getURL()
        await navigate(url && adapter.isAllowedUrl(url) ? url : adapter.entryUrl)
        break
      }
      case 'login': await navigate(adapter.loginUrl); log('已打开 Boss 官方登录页面'); break
      case 'check-auth': await inspect(); log(state.auth === 'signed-in' ? '登录检查通过' : state.auth === 'verification' ? '需要在 Boss 页面完成安全验证' : '尚未确认登录，请在页面中登录后重试'); break
      case 'save-session': await saveSession(); log('浏览器会话已保存到本机', 'success'); break
      case 'logout':
        clearTimeout(saveTimer)
        await saving.catch(() => {})
        if (browser) {
          const contents = liveContents()
          const view = browser
          browser = null
          if (window.contentView.children.includes(view)) window.contentView.removeChildView(view)
          contents?.close()
        }
        await platformSession.clearStorageData()
        clearTimeout(saveTimer)
        vault.clear()
        state.auth = 'signed-out'; state.account = ''; state.savedAt = null
        store.value.savedAt = null; store.save()
        state.browser = { opened: false, loading: false, url: '', error: null }
        log('已清除本机 Boss 登录会话')
        break
      case 'save-settings':
        store.value.settings = command.settings; store.save(); state.settings = command.settings
        log('投递设置已保存', 'success')
        break
      case 'save-ai':
        if (command.key) aiKeys.save(command.key)
        store.value.ai = command.settings; store.save()
        state.ai = { ...command.settings, keyConfigured: aiKeys.configured }
        log('AI 与简历已保存', 'success')
        break
      case 'test-ai':
        testingAi = true
        try {
          await new AiClient(command.settings, command.key || aiKeys.read()).test(new AbortController().signal)
          log('AI 连接测试成功', 'success')
        } finally { testingAi = false }
        break
      case 'clear-ai-key':
        aiKeys.clear(); state.ai = { ...state.ai, keyConfigured: false }
        log('API Key 已清除')
        break
      case 'start': {
        taskAi = store.value.ai.enabled ? new AiClient(store.value.ai, aiKeys.read()) : null
        if (taskAi && !store.value.ai.resume) throw new Error('请先填写简历内容')
        const request = new AbortController()
        startingTask = request
        state.task = { status: 'running', attempted: 0, sent: 0, skipped: 0, failed: 0, message: '正在打开岗位首页' }
        publish()
        try {
          await navigate(adapter.entryUrl)
          request.signal.throwIfAborted()
          if (state.auth !== 'signed-in') throw new Error('请先登录 BOSS 直聘')
          store.value.settings = command.settings; store.save(); state.settings = command.settings
          log(`开始自动投递，本次最多 ${command.settings.limit} 个新岗位`)
          runner.start(command.settings)
        } catch (error) {
          state.task = { ...state.task, status: request.signal.aborted ? 'stopped' : 'failed', message: request.signal.aborted ? '投递已停止' : error instanceof Error ? error.message : '开始投递失败' }
          if (!request.signal.aborted) throw error
          state.browser.error = null
        } finally { startingTask = null; publish() }
        break
      }
      case 'stop':
        startingTask?.abort()
        runner.stop()
        if (navigationPending) liveContents()?.stop()
        break
      case 'open-job': await navigate(command.url); break
    }
    publish()
    return state
  })
  if (process.env.ELECTRON_RENDERER_URL) await window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else await window.loadFile(join(__dirname, '../dist/index.html'))
  log('工作台已就绪，登录后可开始投递')
  if (restoreError) log(restoreError, 'error')
  else if (state.savedAt) log('已恢复本机会话，打开 Boss 页面后将检查是否仍有效')
  probeTimer = setInterval(() => {
    if (!browser || runner.running || navigationPending || probePending || state.browser.loading || closing) return
    probePending = true
    void inspect().catch(() => {}).finally(() => { probePending = false })
  }, 5000)
}).catch(error => { dialog.showErrorBox('Apply Pilot 启动失败', error.message); app.quit() })

app.on('window-all-closed', () => app.quit())
