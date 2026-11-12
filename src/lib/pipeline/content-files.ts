// New draft's Upload tab, the rules (apCfFile, apCfReadFile and the v113 guess in the current dashboard): which files it
// reads, how a captions file is cleaned, what the material is guessed to be, and the title a file gives it. Pure: the
// page reads the file in the browser with these, and the tests use them without one.

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

/** What the file picker offers (the current dashboard's list): text files, and video and audio. */
export const FILE_ACCEPT =
  '.txt,.md,.markdown,.csv,.vtt,.srt,.pdf,.docx,.html,.htm,video/*,audio/*,.mp4,.m4v,.mov,.webm,.mkv,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac'
/** A PDF is read up to its 120th page. */
export const PDF_PAGES = 120
/** Under this many characters, a file has no text to work from. */
export const FILE_MIN = 40

export type FileKind = 'text' | 'captions' | 'html' | 'pdf' | 'docx' | 'media'

const ext = (name: string) => /\.([a-z0-9]+)$/i.exec(str(name).trim())?.[1]?.toLowerCase() ?? ''
const MEDIA = /^(mp4|m4v|mov|webm|mkv|avi|mpg|mpeg|mp3|m4a|aac|wav|ogg|oga|opus|flac|weba)$/

/** A video or audio file (v102IsMedia): by its type, or its ending. */
export function isMedia(name: string, mime: string): boolean {
  return /^(video|audio)\//i.test(str(mime)) || MEDIA.test(ext(name))
}

/** How a file is read, by its ending (apCfReadFile), or null for one it does not read. */
export function fileKind(name: string, mime: string): FileKind | null {
  if (isMedia(name, mime)) return 'media'
  const e = ext(name)
  if (/^(txt|md|markdown|csv)$/.test(e)) return 'text'
  if (e === 'vtt' || e === 'srt') return 'captions'
  if (e === 'html' || e === 'htm') return 'html'
  if (e === 'pdf') return 'pdf'
  if (e === 'docx') return 'docx'
  return null
}

/** A captions file's words (apCfReadFile): no WEBVTT line, cue numbers, timings or tags, one line per cue line. */
export function cleanCaptions(t: string): string {
  return str(t)
    .replace(/\r\n?/g, '\n')
    .replace(/^WEBVTT.*$/m, '')
    .replace(/^\d+\s*$/gm, '')
    .replace(/^[\d:.,]+\s*-->\s*[\d:.,]+.*$/gm, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** What the material is guessed to be from the file (v113): video, audio, a document, else an article. */
export function guessType(name: string, mime: string): string {
  const e = ext(name)
  const t = str(mime)
  if (/^video\//i.test(t) || /^(mp4|m4v|mov|webm|mkv|vtt|srt)$/.test(e)) return 'video'
  if (/^audio\//i.test(t) || /^(mp3|m4a|aac|wav|ogg|oga|opus|flac)$/.test(e)) return 'podcast'
  if (e === 'pdf' || e === 'docx') return 'report'
  return 'article'
}

/** The title a file gives the material: its name without the ending, with _ and - as spaces. */
export function fileTitle(name: string): string {
  return str(name)
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

/** The Upload tab's words (apCfFile, apCfReadFile). */
export const FILE_MSG = {
  unsupported: 'That file type is not supported. Use TXT, MD, PDF, DOCX, VTT or SRT.',
  loader: 'Could not load the file reader. Paste the text instead.',
  empty: 'No readable text in that file. If it is a scanned PDF, paste the text instead.',
  locked: 'That PDF is locked with a password. Unlock it, or paste the text instead.',
  media: 'Video and audio are still transcribed in the current dashboard. Open it there, or paste a transcript instead.',
} as const
