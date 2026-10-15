import { extractText, getDocumentProxy } from 'unpdf'
import { extractRawText } from 'mammoth'
import { unzipSync } from 'fflate'

export async function extractResumeText(name: string, data: ArrayBuffer) {
  if (!data.byteLength || data.byteLength > 10 * 1024 * 1024) throw new Error('简历文件需为 1 字节至 10 MB')
  const buffer = Buffer.from(data)
  let text: string
  if (/\.pdf$/i.test(name)) {
    if (!buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('文件内容不是有效的 PDF')
    let pdf
    try {
      pdf = await getDocumentProxy(new Uint8Array(data), { maxImageSize: 16_777_216, verbosity: 0 })
      if (pdf.numPages > 20) throw new Error('简历最多支持 20 页')
      text = (await extractText(pdf, { mergePages: true })).text
    } catch (error) {
      if (error instanceof Error && error.message === '简历最多支持 20 页') throw error
      throw new Error('无法读取 PDF，请确认文件完整且未加密', { cause: error })
    } finally { await pdf?.loadingTask.destroy() }
  } else if (/\.docx$/i.test(name)) {
    let size = 0, entries = 0, hasDocument = false
    try {
      // Inspect ZIP metadata without inflating images or other parts before handing it to the parser.
      unzipSync(new Uint8Array(data), { filter: entry => {
        size += entry.originalSize; entries++
        if (size > 30 * 1024 * 1024 || entries > 2000) throw new Error('DOCX 解压内容过大')
        if (entry.name === 'word/document.xml') hasDocument = true
        return false
      } })
      if (!hasDocument) throw new Error('缺少 Word 正文')
      text = (await extractRawText({ buffer })).value
    } catch (error) { throw new Error('无法读取 DOCX，请确认文件完整且未加密', { cause: error }) }
  } else throw new Error('请选择 PDF 或 DOCX 文件')
  text = text.replace(/\r\n?/g, '\n').replace(/\0/g, '').trim()
  if (!text) throw new Error('未提取到文字，扫描图片版简历暂不支持，请上传文字版 PDF 或 DOCX')
  if (text.length > 60000) throw new Error('简历文字超过 60,000 字，请精简后重试')
  return text
}
