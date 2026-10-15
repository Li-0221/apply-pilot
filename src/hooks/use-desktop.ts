import { useEffect, useState } from 'react'
import type { Command, ResumeImportInput, Snapshot } from '../../shared/contracts'

const errorMessage = (error: unknown) => error instanceof Error
  ? error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
  : '操作失败'

export function useDesktop() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
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
    setPendingCount(count => count + 1)
    try { setSnapshot(await window.desktop.command(input)); return true }
    catch (error) { setError(errorMessage(error)); return false }
    finally { setPendingCount(count => count - 1) }
  }
  async function importResume(input: ResumeImportInput) {
    if (!window.desktop) return
    setError(null)
    setPendingCount(count => count + 1)
    try { return await window.desktop.importResume(input) }
    catch (error) { setError(errorMessage(error)); return null }
    finally { setPendingCount(count => count - 1) }
  }
  return { snapshot, command, importResume, pending: pendingCount > 0, error }
}
