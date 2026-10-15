import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractResumeText } from '../electron/resume-text.ts'
import { parseResumeImport } from '../electron/security.ts'
import { parseResumeMarkdown } from '../electron/ai.ts'
import { defaultAiSettings } from '../shared/contracts.ts'
// @ts-expect-error The binary document fixtures are also used by the JavaScript Electron checks.
import { resumeDocx, resumePdf } from './fixtures/resume.mjs'

const bytes = (value: Uint8Array) => new Uint8Array(value).buffer
test('PDF and DOCX extract actual document text without requiring system Office or PDF tools', async () => {
  assert.match(await extractResumeText('resume.pdf', bytes(resumePdf())), /React and TypeScript/)
  assert.match(await extractResumeText('简历.DOCX', bytes(resumeDocx())), /测试候选人.*React.*TypeScript/)
})
test('invalid documents, empty/image-only PDFs, excessive pages and unsupported file types fail before AI', async () => {
  await assert.rejects(extractResumeText('resume.pdf', bytes(Buffer.from('not a PDF'))), /有效的 PDF/)
  await assert.rejects(extractResumeText('resume.docx', bytes(Buffer.from('not a Word document'))), /无法读取 DOCX/)
  await assert.rejects(extractResumeText('scan.pdf', bytes(resumePdf(''))), /未提取到文字/)
  await assert.rejects(extractResumeText('long.pdf', bytes(resumePdf('React', 21))), /最多支持 20 页/)
  assert.throws(() => parseResumeImport({ name: 'resume.doc', data: bytes(resumeDocx()), settings: defaultAiSettings }), /PDF 或 DOCX/)
  assert.throws(() => parseResumeImport({ name: 'resume.pdf', data: new ArrayBuffer(10 * 1024 * 1024 + 1), settings: defaultAiSettings }), /10 MB/)
  assert.throws(() => parseResumeImport({ name: 'resume.pdf', data: 'file:///private/path', settings: defaultAiSettings }))
})
test('AI Markdown is normalized and bounded before replacing an editable draft', () => {
  assert.equal(parseResumeMarkdown('```markdown\n# 简历\n\n- React\n```'), '# 简历\n\n- React')
  for (const content of ['', '无法读取简历', '# 简历\n<script>alert(1)</script>', '# 简历\n' + 'a'.repeat(30000)]) assert.throws(() => parseResumeMarkdown(content))
})
