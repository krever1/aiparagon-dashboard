// Reading a Catalyst document, as the current dashboard's reader does (apMdStruct, apJsonStruct, apJsonToMd,
// apDocParse, apPdfToMd, e1MdClean): the agents write markdown, their Google Docs often hold JSON, and PDFs come back as
// plain text. Pure functions; the reader component draws what they return.

/** Over-escaped agent output ("\n" typed out) back to real line breaks; long underscore lines to rules. */
export function mdClean(md: unknown): string {
  return String(md ?? '')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/^ *_{5,} *$/gm, '\n---\n')
    .replace(/\r/g, '')
}

/** Text from a JSON value: typed-out line breaks and tabs made real. */
export function txt(v: unknown): string {
  return String(v === null || v === undefined ? '' : v)
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, ' ')
}

/** "first_meeting_date" → "First meeting date". */
export function humanize(k: string): string {
  return String(k)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase())
}

export type MdStruct = {
  title: string
  /** **Label:** value pairs before the first section */
  facts: [string, string][]
  intro: string
  secs: { h: string; body: string; points: number }[]
}

/** Markdown as a title, key facts, an intro and one part per ## (or ###) heading. */
export function mdStruct(source: string): MdStruct {
  const md = mdClean(source)
  const lines = md.split('\n')
  let title = ''
  let i = 0
  while (i < lines.length && !lines[i].trim()) i++
  if (i < lines.length && /^#\s+/.test(lines[i])) {
    title = lines[i].replace(/^#\s+/, '').trim()
    i++
  }
  const rest = lines.slice(i).join('\n')
  const lvl = /^##\s+/m.test(rest) ? '##' : /^###\s+/m.test(rest) ? '###' : null
  let pre = rest
  let secs: MdStruct['secs'] = []
  if (lvl) {
    const re = new RegExp('^' + lvl + '\\s+(.*)$', 'gm')
    const cuts: { at: number; h: string; end: number }[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(rest))) cuts.push({ at: m.index, h: m[1], end: m.index + m[0].length })
    pre = rest.slice(0, cuts.length ? cuts[0].at : rest.length)
    secs = cuts.map((c, j) => {
      const body = rest.slice(c.end, j + 1 < cuts.length ? cuts[j + 1].at : rest.length).trim()
      return { h: c.h.replace(/\*\*/g, '').trim().replace(/^\d+[.)]\s*/, ''), body, points: points(body) }
    })
  }
  const facts: [string, string][] = []
  const rx = /\*\*([^*:]{2,40}):\*\*\s*([^*\n]+?)(?=\s{2,}·|\s+·\s+\*\*|\n|$)/g
  let f: RegExpExecArray | null
  while ((f = rx.exec(pre)) && facts.length < 10) {
    const v = f[2].replace(/\s*·\s*$/, '').trim()
    if (v) facts.push([f[1].trim(), v])
  }
  let intro = facts.length
    ? pre
        .split('\n')
        .filter((l) => !/\*\*[^*:]{2,40}:\*\*/.test(l) && !/^-{3,}$/.test(l.trim()))
        .join('\n')
        .trim()
    : pre.replace(/^-{3,}$/gm, '').trim()
  if (!secs.length && !facts.length) {
    secs = [{ h: title.replace(/\*\*/g, '') || 'Document', body: intro, points: points(intro) }]
    intro = ''
  }
  return { title: title.replace(/\*\*/g, ''), facts, intro, secs }
}

function points(body: string): number {
  return (body.match(/^\s*(?:[-*•]|\d+[.)])\s+/gm) || []).length
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** A JSON document as markdown, for Full text. */
export function jsonToMd(obj: Record<string, unknown>): string {
  const out: string[] = []
  const t = obj.title || obj.heading
  if (t) out.push('# ' + txt(t), '')
  const val = (v: unknown, ind = ''): string => {
    if (v === null || v === undefined) return ''
    if (typeof v !== 'object') return txt(v)
    if (Array.isArray(v)) {
      return v
        .map((x) =>
          isObj(x)
            ? ind + '- ' + Object.keys(x).map((k) => '**' + humanize(k) + ':** ' + (typeof x[k] === 'object' ? JSON.stringify(x[k]) : txt(x[k]))).join(' · ')
            : ind + '- ' + txt(x),
        )
        .join('\n')
    }
    const o = v as Record<string, unknown>
    return Object.keys(o)
      .map((k) => '**' + humanize(k) + ':** ' + (typeof o[k] === 'object' && o[k] ? '\n' + val(o[k], ind + '  ') : txt(o[k])))
      .join('\n\n')
  }
  if (obj.header) out.push(val(obj.header), '')
  if (Array.isArray(obj.sections)) {
    for (const s of obj.sections) {
      const so = isObj(s) ? s : {}
      out.push('## ' + txt(so.heading || so.title || 'Section'), '')
      const c: Record<string, unknown> = { ...so }
      delete c.heading
      delete c.title
      delete c.type
      for (const k of Object.keys(c)) out.push(typeof c[k] === 'string' ? txt(c[k]) : val(c[k]), '')
    }
  }
  for (const k of Object.keys(obj)) {
    if (['title', 'heading', 'sections', 'header'].includes(k)) continue
    const v = obj[k]
    if (v === null || v === undefined || v === '') continue
    if (typeof v !== 'object') {
      out.push('**' + humanize(k) + ':** ' + txt(v), '')
      continue
    }
    out.push('## ' + humanize(k), '', val(v), '')
  }
  return out.join('\n')
}

export type JsonSec = { h: string; flag: boolean; kind: 'obj' | 'paras' | 'val'; value: unknown }
export type JsonStruct = { title: string; facts: [string, string][]; secs: JsonSec[] }

/** A JSON document as a title, key facts and parts (its `sections`, then its other keys). */
export function jsonStruct(obj: Record<string, unknown>): JsonStruct {
  const title = txt(obj.title || obj.heading || '')
  const header = isObj(obj.header) ? obj.header : null
  const topSimple = Object.keys(obj).filter((k) => {
    const v = obj[k]
    return !['title', 'heading', 'sections'].includes(k) && v !== null && v !== undefined && typeof v !== 'object' && String(v).length <= 160 && String(v).trim()
  })
  const facts: [string, string][] = [
    ...(header
      ? Object.keys(header)
          .filter((k) => header[k] !== null && header[k] !== undefined && typeof header[k] !== 'object' && String(header[k]).trim())
          .map((k): [string, string] => [humanize(k), txt(header[k])])
      : []),
    ...topSimple.map((k): [string, string] => [humanize(k), txt(obj[k])]),
  ].slice(0, 12)
  const secs: JsonSec[] = []
  if (Array.isArray(obj.sections)) {
    obj.sections.forEach((s, j) => {
      const so = isObj(s) ? s : null
      secs.push({
        h: txt((so && (so.heading || so.title)) || 'Section ' + (j + 1)),
        flag: !!so && /flag|warn|alert/i.test(String(so.type || '')),
        kind: so ? 'obj' : 'paras',
        value: so ? { ...so, heading: undefined, title: undefined } : s,
      })
    })
  }
  for (const k of Object.keys(obj)) {
    if (['title', 'heading', 'sections', 'header'].includes(k) || topSimple.includes(k)) continue
    const v = obj[k]
    if (v === null || v === undefined || v === '') continue
    secs.push({ h: humanize(k), flag: false, kind: 'val', value: v })
  }
  return { title, facts, secs }
}

export type DocSource = { md: string; json?: Record<string, unknown> | unknown[]; pdf?: boolean }

/**
 * Text from a Google Doc: a markdown export of a JSON document (backslash-escaped), or markdown. JSON is kept as JSON
 * (drawn as cards) with a markdown copy for Full text.
 */
export function parseDocText(text: unknown): DocSource {
  const un = String(text ?? '').replace(/\\([\\`*_{}[\]()#+\-.!$>~|&])/g, '$1')
  const t = un.trim()
  if (/^[[{]/.test(t)) {
    for (const s of [t, t.replace(/ /g, ' ')]) {
      try {
        const o = JSON.parse(s)
        if (o && typeof o === 'object') return { json: o, md: isObj(o) ? jsonToMd(o) : jsonToMd({ items: o }) }
      } catch {
        // not JSON
      }
    }
  }
  return { md: un }
}

/** A document saved as markdown (content_md): JSON when it is JSON, else the markdown as written. */
export function parseSaved(md: string): DocSource {
  const p = parseDocText(md)
  return p.json ? p : { md }
}

/** PDF text has no headings: lines in capitals read as headings. */
export function pdfToMd(t: unknown): string {
  return String(t ?? '')
    .split('\n')
    .map((l) => {
      const s = l.trim()
      if (!s) return ''
      if (s.length < 90 && /^[A-Z0-9 &·–-―\-:|,.'’()]{6,}$/.test(s) && /[A-Z]{3}/.test(s)) return '\n## ' + s.replace(/:$/, '') + '\n'
      return s
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

/** A Google Doc's id from its address. */
export function googleDocId(u: unknown): string {
  return /docs\.google\.com\/document\/d\/([A-Za-z0-9_-]{20,})/.exec(String(u ?? ''))?.[1] ?? ''
}

/** A Drive file's id from its address (/d/<id> or ?id=<id>). */
export function driveId(u: unknown): string {
  const s = String(u ?? '')
  return (/\/d\/([A-Za-z0-9_-]{20,80})/.exec(s) || /[?&]id=([A-Za-z0-9_-]{20,80})/.exec(s))?.[1] ?? ''
}

export const DOC_ID = /^[A-Za-z0-9_-]{20,80}$/
