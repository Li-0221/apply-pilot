import { Worker } from 'node:worker_threads'
import { join } from 'node:path'

export function extractResumeInWorker(name: string, data: ArrayBuffer, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const worker = new Worker(join(__dirname, 'resume-worker.cjs'), {
      workerData: { name, data }, transferList: [data], resourceLimits: { maxOldGenerationSizeMb: 256 },
    })
    const finish = (error: Error | null, text = '') => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      void worker.terminate()
      if (error) reject(error)
      else resolve(text)
    }
    const abort = () => finish(new Error('简历解析已取消'))
    let settled = false
    const timer = setTimeout(() => finish(new Error('简历读取超时，请检查文件后重试')), 20000)
    signal.addEventListener('abort', abort, { once: true })
    worker.on('message', (message: { text?: string; error?: string }) => {
      if (message.error) finish(new Error(message.error))
      else if (typeof message.text === 'string' && message.text.length <= 60000) finish(null, message.text)
      else finish(new Error('简历读取结果无效'))
    })
    worker.on('error', () => finish(new Error('简历读取失败，请检查文件格式或大小')))
    worker.on('exit', () => { if (!settled) finish(new Error('简历读取进程已退出')) })
    if (signal.aborted) abort()
  })
}
