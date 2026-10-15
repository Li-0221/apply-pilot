import type { Command, ViewBounds } from '../shared/contracts'

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
    case 'snapshot': case 'reload': case 'login': case 'check-auth': case 'save-session': case 'logout': case 'stop':
      return { type: value.type }
    case 'open':
      if (!('platform' in value) || value.platform !== 'boss') throw new Error('暂不支持该平台')
      return { type: 'open', platform: value.platform }
    case 'collect':
      if (!('keyword' in value) || typeof value.keyword !== 'string' || value.keyword.length > 80) throw new Error('关键词最多 80 个字符')
      return { type: 'collect', keyword: value.keyword.trim() }
    case 'open-job':
      if (!('url' in value) || typeof value.url !== 'string' || !isBossUrl(value.url) || !new URL(value.url).pathname.startsWith('/job_detail/')) throw new Error('无效的岗位链接')
      return { type: 'open-job', url: value.url }
    default: throw new Error('未知指令')
  }
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
