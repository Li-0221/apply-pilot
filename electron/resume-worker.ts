import { parentPort, workerData } from 'node:worker_threads'
import { extractResumeText } from './resume-text'

const input: { name: string; data: ArrayBuffer } = workerData
void extractResumeText(input.name, input.data).then(
  text => parentPort?.postMessage({ text }),
  error => parentPort?.postMessage({ error: error instanceof Error ? error.message : '简历读取失败' }),
)
