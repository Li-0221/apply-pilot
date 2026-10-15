import { bossAdapter } from './boss'
import type { PlatformAdapter } from './types'

export const platforms: ReadonlyMap<string, PlatformAdapter> = new Map([[bossAdapter.descriptor.id, bossAdapter]])

export function getPlatform(id: string) {
  const adapter = platforms.get(id)
  if (!adapter) throw new Error('暂不支持该平台')
  return adapter
}
