import { useEffect, useState } from 'react'
import type { Command, Snapshot } from '../../shared/contracts'

const errorMessage = (error: unknown) => error instanceof Error
  ? error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
  : '操作失败'

export function useDesktop() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  useEffect(() => {
    const api = window.desktop
    if (!api) return
    let active = true
    const unsubscribe = api.onSnapshot(value => { if (active) setSnapshot(value) })
    void api.command({ type: 'snapshot' }).then(value => { if (active) setSnapshot(value) }).catch(error => { if (active) setError(errorMessage(error)) })
    return () => { active = false; unsubscribe() }
  }, [])
  async function command(input: Command) {
    if (!window.desktop) return
    setError(null)
    setPending(true)
    try { setSnapshot(await window.desktop.command(input)); return true }
    catch (error) { setError(errorMessage(error)); return false }
    finally { setPending(false) }
  }
  return { snapshot, command, pending, error }
}
