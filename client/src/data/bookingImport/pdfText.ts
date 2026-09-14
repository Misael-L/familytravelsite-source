let workerConfigured = false

export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  if (!workerConfigured) {
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    workerConfigured = true
  }
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise
  const pages: string[] = []
  const max = Math.min(pdf.numPages, 12)
  for (let i = 1; i <= max; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const line = content.items
      .map(it => ('str' in it && typeof it.str === 'string' ? it.str : ''))
      .filter(Boolean)
      .join(' ')
    pages.push(line)
  }
  return pages.join('\n')
}
