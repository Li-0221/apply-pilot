import { defaultSearchFilters } from '../shared/contracts'
import { bossOptions } from '../shared/boss-options'
import type { AiSettings, ApplicationSettings, Command, ResumeImportInput, ViewBounds } from '../shared/contracts'

export function isBossUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      (url.hostname === 'zhipin.com' || url.hostname.endsWith('.zhipin.com'))
  } catch { return false }
}

export function parseCommand(value: unknown): Command {
  if (!value || typeof value !== 'object' || !('type' in value)) throw new Error('无效指令')
  switch (value.type) {
    case 'snapshot': case 'reload': case 'login': case 'check-auth': case 'save-session': case 'logout': case 'stop': case 'clear-ai-key': case 'cancel-resume-import':
      return { type: value.type }
    case 'open':
      if (!('platform' in value) || value.platform !== 'boss') throw new Error('暂不支持该平台')
      return { type: 'open', platform: value.platform }
    case 'start': case 'save-settings':
      if (!('settings' in value)) throw new Error('缺少投递设置')
      return { type: value.type, settings: parseSettings(value.settings) }
    case 'save-ai': case 'test-ai': {
      if (!('settings' in value)) throw new Error('缺少 AI 设置')
      return { type: value.type, settings: parseAiSettings(value.settings), key: parseAiKey('key' in value ? value.key : undefined) }
    }
    case 'open-job':
      if (!('url' in value) || typeof value.url !== 'string' || !isBossUrl(value.url) || !new URL(value.url).pathname.startsWith('/job_detail/')) throw new Error('无效的岗位链接')
      return { type: 'open-job', url: value.url }
    default: throw new Error('未知指令')
  }
}

function parseAiKey(key: unknown) {
  if (key !== undefined && (typeof key !== 'string' || key.length > 4096 || /[\r\n]/.test(key))) throw new Error('无效的 API Key')
  return key?.trim()
}

export function parseResumeImport(value: unknown): ResumeImportInput {
  if (!value || typeof value !== 'object') throw new Error('无效的简历文件')
  const data = value as Record<string, unknown>
  if (typeof data.name !== 'string' || data.name.length > 255 || !/\.(pdf|docx)$/i.test(data.name)) throw new Error('请选择 PDF 或 DOCX 文件')
  if (!(data.data instanceof ArrayBuffer) || !data.data.byteLength || data.data.byteLength > 10 * 1024 * 1024) throw new Error('简历文件需为 1 字节至 10 MB')
  return { name: data.name, data: data.data, settings: parseAiSettings(data.settings), key: parseAiKey(data.key) }
}

export function parseAiSettings(value: unknown): AiSettings {
  if (!value || typeof value !== 'object') throw new Error('无效的 AI 设置')
  const data = value as Record<string, unknown>
  if (typeof data.enabled !== 'boolean') throw new Error('无效的 AI 开关')
  if (typeof data.baseUrl !== 'string' || data.baseUrl.length > 2048) throw new Error('无效的 Base URL')
  let url: URL
  try { url = new URL(data.baseUrl.trim()) } catch { throw new Error('请输入有效的 Base URL') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Base URL 仅支持不含凭据和查询参数的 HTTP / HTTPS 地址')
  if (typeof data.model !== 'string' || data.model.length > 120 || /[\r\n]/.test(data.model)) throw new Error('无效的模型名称')
  if (typeof data.resume !== 'string' || data.resume.length > 30000) throw new Error('简历内容最多 30,000 字')
  if (!Number.isInteger(data.minScore) || Number(data.minScore) < 0 || Number(data.minScore) > 100) throw new Error('匹配分数需为 0–100')
  return { enabled: data.enabled, baseUrl: url.href.replace(/\/$/, ''), model: data.model.trim(), resume: data.resume.trim(), minScore: Number(data.minScore) }
}

export function parseBounds(value: unknown): ViewBounds {
  if (!value || typeof value !== 'object') throw new Error('无效的页面位置')
  const rect = value as Record<string, unknown>
  for (const key of ['x', 'y', 'width', 'height']) {
    if (typeof rect[key] !== 'number' || !Number.isFinite(rect[key]) || Math.abs(rect[key]) > 20_000) throw new Error('无效的页面位置')
  }
  if (typeof rect.visible !== 'boolean') throw new Error('无效的页面状态')
  return { x: Math.round(Number(rect.x)), y: Math.round(Number(rect.y)), width: Math.max(0, Math.round(Number(rect.width))), height: Math.max(0, Math.round(Number(rect.height))), visible: rect.visible }
}

export function parseSettings(value: unknown): ApplicationSettings {
  if (!value || typeof value !== 'object') throw new Error('无效的投递设置')
  const data = value as Record<string, unknown>
  const text = (key: string, max: number) => {
    if (typeof data[key] !== 'string' || data[key].length > max) throw new Error(`设置字段 ${key} 无效`)
    return data[key].trim()
  }
  if (!Number.isInteger(data.limit) || Number(data.limit) < 1 || Number(data.limit) > 100) throw new Error('本次数量需为 1–100')
  if (!Number.isInteger(data.intervalSeconds) || Number(data.intervalSeconds) < 3 || Number(data.intervalSeconds) > 300) throw new Error('间隔需为 3–300 秒')
  if (typeof data.sendResume !== 'boolean') throw new Error('无效的简历设置')
  const filters = { ...defaultSearchFilters }
  if (data.filters !== undefined) {
    if (!data.filters || typeof data.filters !== 'object') throw new Error('无效的筛选条件')
    for (const key of Object.keys(filters) as (keyof typeof filters)[]) {
      const value = (data.filters as Record<string, unknown>)[key]
      if (typeof value !== 'string' || (value !== '0' && !bossOptions[key].some(option => option.value === value))) throw new Error(`无效的筛选条件 ${key}`)
      filters[key] = value
    }
  }
  const cities = text('city', 40).split(/[,，\n;；]+/).map(s => s.trim()).filter(Boolean)
  if (cities.some(city => !bossOptions.city.some(option => option.label === city || option.value === city))) throw new Error('城市不在 BOSS 城市列表中')
  return { filters, keyword: text('keyword', 80), city: text('city', 40), excludedKeywords: text('excludedKeywords', 500),
    message: text('message', 1000), limit: Number(data.limit), intervalSeconds: Number(data.intervalSeconds), sendResume: data.sendResume }
}
