import { FILE_MIN, FILE_MSG, PDF_PAGES, cleanCaptions, fileKind } from '@/lib/pipeline/content-files'

// Reading a file for New draft, in the browser (apCfReadFile): nothing is sent anywhere until the draft goes out, and a
// file of any size is read here (a Vercel request takes 4.5 MB at most). A PDF is read with pdf.js and a Word file with
// mammoth's browser build, each loaded the first time one is dropped.

/** A file that cannot be read, in the words the Upload tab shows. */
export class ReadError extends Error {}

type PdfLib = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let pdfLib: Promise<PdfLib> | null = null

/** pdf.js, run on this page: importing its worker module sets it up to work without a worker of its own. */
function loadPdf(): Promise<PdfLib> {
  pdfLib ??= Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.mjs')]).then(([lib]) => lib)
  pdfLib.catch(() => {
    pdfLib = null
  })
  return pdfLib
}

async function pdfText(file: File): Promise<string> {
  let lib: PdfLib
  try {
    lib = await loadPdf()
  } catch {
    throw new ReadError(FILE_MSG.loader)
  }
  const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), disableFontFace: true, useSystemFonts: false })
  try {
    const doc = await task.promise
    const out: string[] = []
    for (let i = 1; i <= Math.min(doc.numPages, PDF_PAGES); i++) {
      const page = await doc.getPage(i)
      const c = await page.getTextContent()
      // a page's runs of text, joined by spaces (apCfReadFile), without the runs of spaces that leaves
      out.push(c.items.map((x) => ('str' in x ? x.str : '')).join(' ').replace(/[ \t]{2,}/g, ' ').trim())
    }
    return out.join('\n\n').trim()
  } catch (e) {
    if (e instanceof Error && e.name === 'PasswordException') throw new ReadError(FILE_MSG.locked)
    throw new ReadError('Could not read that PDF. It may be damaged. Paste the text instead.')
  } finally {
    void task.destroy()
  }
}

async function docxText(file: File): Promise<string> {
  let mammoth: typeof import('mammoth')
  try {
    mammoth = await import('mammoth')
  } catch {
    throw new ReadError(FILE_MSG.loader)
  }
  try {
    const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return String(r.value || '').trim()
  } catch {
    throw new ReadError('Could not read that Word file. It may be damaged. Paste the text instead.')
  }
}

function htmlText(html: string): string {
  const d = new DOMParser().parseFromString(html, 'text/html')
  d.querySelectorAll('script,style,nav,footer,noscript,template').forEach((x) => x.remove())
  // innerText follows the layout, which a parsed document does not have: line breaks come from its blocks instead
  d.querySelectorAll('br').forEach((x) => x.replaceWith('\n'))
  d.querySelectorAll('p,div,section,article,li,h1,h2,h3,h4,h5,h6,tr,blockquote,pre').forEach((x) => x.append('\n'))
  return (d.body?.textContent ?? '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** A file's text, or a ReadError saying why there is none. Video and audio are not read here yet. */
export async function readFileText(file: File): Promise<string> {
  const kind = fileKind(file.name, file.type)
  if (kind === 'media') throw new ReadError(FILE_MSG.media)
  if (!kind) throw new ReadError(FILE_MSG.unsupported)
  let t = ''
  if (kind === 'text') t = await file.text()
  else if (kind === 'captions') t = cleanCaptions(await file.text())
  else if (kind === 'html') t = htmlText(await file.text())
  else if (kind === 'pdf') t = await pdfText(file)
  else t = await docxText(file)
  t = t.replace(/\r\n?/g, '\n').trim()
  if (t.length < FILE_MIN) throw new ReadError(FILE_MSG.empty)
  return t
}
