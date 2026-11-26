// The client workspace on a lead's Files tab (the current dashboard's v145, Erica's Client Workspace design, with v146's
// fixes): Files and Calls side by side, folders on the left (All content, Starred, To organize, then a folder per
// client stage and the team's own), stage folder cards, search, a type filter, a sort, a list or grid. Each item has a
// name, a folder, a description and a star, kept for the team in ai_settings `catalyst_ws` ({lead email in lower case:
// {folders: [{id, name}], items: {key: {name, folder, desc, star, source, stage}}}}; keys `a:<agent>`, `p:<stage>`,
// `f:<lead_files id>`, `c:<call id>`). Since v151 an item also keeps what went where: `asana` {at, by, project,
// project_name, url} and `notion` {at, by, db, name}. Since v153 every change made in the workspace is kept on the item
// as `log` ([{at, by, what}], the last 30), and the preview panel and the folder suggestions for calls read these rules.
// Pure functions, for the server and the browser.

import type { Stage } from './stages'

export type WsAsana = { at?: string; by?: string; project?: string; project_name?: string; url?: string }
export type WsNotion = { at?: string; by?: string; db?: string; name?: string }
export type WsLog = { at: string; by: string; what: string }
export type WsItemMeta = {
  name?: string
  folder?: string
  desc?: string
  star?: boolean
  source?: boolean
  stage?: string
  asana?: WsAsana
  notion?: WsNotion
  /** every change made in the workspace from v153 on, the last 30 */
  log?: WsLog[]
}
export type WsMeta = { folders: { id: string; name: string }[]; items: Record<string, WsItemMeta> }

export const EMPTY_WS: WsMeta = { folders: [], items: {} }

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** One lead's workspace from the whole setting (keyed by the lead's email in lower case). */
export function wsMetaOf(all: Record<string, unknown>, email: string): WsMeta {
  const m = obj(all[str(email).trim().toLowerCase()])
  const folders = Array.isArray(m.folders)
    ? (m.folders as unknown[]).map((f) => ({ id: str(obj(f).id), name: str(obj(f).name) })).filter((f) => f.id && f.name)
    : []
  return { folders, items: obj(m.items) as Record<string, WsItemMeta> }
}

export type WsFolder = { id: string; name: string; stage: boolean; color?: string }

/** The folders: one per client stage, then the team's own (v145WsFolders). */
export function wsFolders(stages: readonly Pick<Stage, 'key' | 'name' | 'color'>[], meta: WsMeta): WsFolder[] {
  return [
    ...stages.map((s) => ({ id: s.key, name: s.name, stage: true, color: s.color })),
    ...meta.folders.map((f) => ({ id: f.id, name: f.name, stage: false })),
  ]
}

export type WsFormat = { l: string; u?: string; tab?: string }

export type WsItem = {
  key: string
  kind: 'doc' | 'upload' | 'transcript' | 'call'
  /** the lead_files row or the call */
  id?: string
  name: string
  fm: WsFormat[]
  folder: string
  at: string
  by: string
  desc: string
  star: boolean
  /** an upload the stage runs read */
  source?: boolean
  hs?: boolean
  /** a call: minutes, who was on it, where it came from (Fathom or Uploaded), its summary, whether it is filed */
  mins?: number
  who?: string
  src?: string
  sum?: string
  filed?: boolean
  /** a call's Fathom link, for Send to Asana's Open it */
  link?: string
  /** a call's type: the team's (call_meta.meeting_type), else the AI's pick (v153's folder suggestions and Details) */
  type?: string
  /** where it was sent (v151): the Asana project, the Notion database, each with when */
  sent: WsSent[]
}

export type WsSent = { to: 'Asana' | 'Notion'; name: string; at: string }

/** What went where for an item (v151Rows): "In Asana · <project>", "In Notion · <database>", once each was sent. */
export function sentOf(m: WsItemMeta | undefined): WsSent[] {
  const out: WsSent[] = []
  const a = obj(m?.asana)
  const n = obj(m?.notion)
  if (a.at) out.push({ to: 'Asana', name: str(a.project_name), at: str(a.at) })
  if (n.at) out.push({ to: 'Notion', name: str(n.name), at: str(n.at) })
  return out
}

/** An item's kind as Asana and Notion are told it (v151Kind). */
export function kindWord(i: Pick<WsItem, 'kind'>): string {
  return i.kind === 'call' ? 'Call' : i.kind === 'transcript' ? 'Transcript' : i.kind === 'upload' ? 'File' : 'Document'
}

/** "<item> · <client>", 300 characters at most (v151Title). */
export function sendTitle(name: string, client: string): string {
  const s = str(name).trim() + ' · ' + client
  return s.length > 300 ? s.slice(0, 299) + '…' : s
}

/** A link that opens the item (v151Link): a call's Fathom link, else its first web link (the file, the Google Doc). */
export function itemLink(i: Pick<WsItem, 'kind' | 'fm' | 'link'>): string {
  if (i.kind === 'call') return i.link && /^https:\/\//i.test(i.link) ? i.link : ''
  return i.fm.find((f) => f.u && /^https?:\/\//i.test(f.u))?.u ?? ''
}

/**
 * An Asana task's description for an item (v151Notes): its kind, the client, the folder and the day, what it is about
 * (its description, else a call's summary), and the link that opens it.
 */
export function asanaNotes(i: Pick<WsItem, 'kind' | 'fm' | 'link' | 'desc' | 'sum'>, client: string, folder: string, day: string): string {
  const link = itemLink(i)
  return [
    kindWord(i) + ' from ' + client + '’s workspace' + (folder ? ' · ' + folder : '') + (day ? ' · ' + day : ''),
    i.desc ? 'About it: ' + i.desc : i.sum ? 'Summary: ' + i.sum : '',
    link ? 'Open it: ' + link : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** The picked items, once each (a transcript is in both views), in the order they show (v151Picked). */
export function pickedOf(files: WsItem[], calls: WsItem[], sel: Record<string, boolean>): WsItem[] {
  const seen = new Set<string>()
  return [...files, ...calls].filter((i) => sel[i.key] && !seen.has(i.key) && !!seen.add(i.key))
}

/** The board stage an older agent's document goes in (v145StageOfAgent): the built-in stage it writes, else none. */
export function stageOfAgent(stages: readonly Pick<Stage, 'key' | 'agent' | 'custom'>[], agent: string): string {
  return stages.find((s) => s.agent === agent && !s.custom && s.agent !== 'meeting_prep')?.key ?? ''
}

/** "report.pdf" → "PDF"; no ending → "FILE" (v145Ext). */
export function extOf(name: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(str(name))
  return m ? m[1].toUpperCase() : 'FILE'
}

/** An item whose folder is gone (a stage removed, a folder deleted) is To organize (v146Folded). */
export function folded<T extends { folder: string }>(list: T[], folders: WsFolder[]): T[] {
  const ids = new Set(folders.map((f) => f.id))
  return list.map((i) => (i.folder && !ids.has(i.folder) ? { ...i, folder: '' } : i))
}

/** Whether a workspace upload is one the stage runs read: ticked, or a transcript nobody unticked (v146). */
export function isSource(m: WsItemMeta | undefined, category: string): boolean {
  return m?.source === true || (m?.source !== false && category === 'transcript')
}

export type WsDoc = { agent: string; label: string; done: boolean; at: string | null; url: string; documentId: string; gammaDocUrl: string }
export type WsPrep = { key: string; at: string | null }
export type WsUpload = {
  id: string
  name: string
  url: string
  stage: string
  note: string
  by: string
  at: string | null
  category: string
  indexed: boolean
  hs: boolean
}

/** Everything in the Files view (v145WsItems): the stage documents, the meeting prep and the uploads. */
export function wsFiles({
  docs,
  prep,
  uploads,
  stages,
  meta,
}: {
  docs: WsDoc[]
  prep: WsPrep[]
  uploads: WsUpload[]
  stages: readonly Stage[]
  meta: WsMeta
}): WsItem[] {
  const list: WsItem[] = []
  for (const d of docs) {
    if (!d.done) continue
    const fm: WsFormat[] = []
    if (d.url) fm.push({ l: 'PDF', u: d.url })
    if (d.documentId) fm.push({ l: 'Google Doc', u: 'https://docs.google.com/document/d/' + encodeURIComponent(d.documentId) + '/edit' })
    if (d.gammaDocUrl) fm.push({ l: 'Slide notes', u: d.gammaDocUrl })
    const key = 'a:' + d.agent
    const m = meta.items[key] ?? {}
    list.push({
      key, kind: 'doc', name: m.name || d.label, fm, folder: m.folder != null ? m.folder : stageOfAgent(stages, d.agent),
      at: d.at ?? '', by: 'AI generated', desc: m.desc || '', star: !!m.star, sent: sentOf(m),
    })
  }
  for (const p of prep) {
    const st = stages.find((s) => s.key === p.key)
    if (!st) continue
    const key = 'p:' + p.key
    const m = meta.items[key] ?? {}
    list.push({
      key, kind: 'doc', name: m.name || st.doc, fm: [{ l: 'Read', tab: p.key }], folder: m.folder != null ? m.folder : p.key,
      at: p.at ?? '', by: 'AI generated', desc: m.desc || '', star: !!m.star, sent: sentOf(m),
    })
  }
  for (const f of uploads) {
    const key = 'f:' + f.id
    const m = meta.items[key] ?? {}
    const tr = f.category === 'transcript'
    list.push({
      key, kind: tr ? 'transcript' : 'upload', id: f.id, name: m.name || f.name, fm: [{ l: tr ? 'Transcript' : extOf(f.name), u: f.url }],
      folder: m.folder != null ? m.folder : stageOfAgent(stages, f.stage), at: f.at ?? '', by: f.by, desc: m.desc != null ? m.desc : f.note,
      star: !!m.star, source: isSource(m, f.category), hs: f.hs, sent: sentOf(m),
    })
  }
  return folded(list, wsFolders(stages, meta))
}

export type WsCall = { id: string; title: string; start: string; minutes: number; stage: string; who: string; summary: string; link?: string; type?: string }

/**
 * Everything in the Calls view (v145WsCalls, v146): the lead's recorded calls and the transcripts uploaded to the
 * workspace, newest first. A call goes in the stage folder it is filed under; a workspace move holds while the call is
 * still filed where it was when moved (`stage`), and its name and description are the ones given in Edit.
 */
export function wsCalls({ calls, files, stages, meta }: { calls: WsCall[]; files: WsItem[]; stages: readonly Stage[]; meta: WsMeta }): WsItem[] {
  const keys = new Set(stages.map((s) => s.key))
  const out: WsItem[] = calls.map((x) => {
    const key = 'c:' + x.id
    const m = meta.items[key] ?? {}
    const filed = x.stage && x.stage !== 'none' && keys.has(x.stage) ? x.stage : ''
    const folder = m.folder != null && (m.stage ?? '') === (x.stage ?? '') ? m.folder : filed || m.folder || ''
    return {
      key, kind: 'call', id: x.id, name: m.name || x.title || 'Call', fm: [], folder, at: x.start, by: '', desc: m.desc || '', star: !!m.star,
      mins: x.minutes, who: x.who, src: 'Fathom', sum: x.summary, filed: !!x.stage, link: x.link || '', type: x.type || '', sent: sentOf(m),
    }
  })
  for (const i of files) if (i.kind === 'transcript') out.push({ ...i, src: 'Uploaded' })
  return folded(out, wsFolders(stages, meta)).sort((a, b) => String(b.at).localeCompare(String(a.at)))
}

export type WsView = { folder: string; q: string; type: string; sort: string }

/** What the list shows (v145WsShown): the folder (All, Starred, To organize or one), the type, the search, the sort. */
export function wsShown(list: WsItem[], w: WsView, folders: WsFolder[]): WsItem[] {
  const q = w.q.trim().toLowerCase()
  const fname = (id: string) => folders.find((f) => f.id === id)?.name ?? ''
  const L = list.filter((i) => {
    if (w.folder === 'star' && !i.star) return false
    if (w.folder === 'org' && i.folder) return false
    if (w.folder !== 'all' && w.folder !== 'star' && w.folder !== 'org' && i.folder !== w.folder) return false
    if (w.type === 'pdf' && !i.fm.some((f) => f.l === 'PDF')) return false
    if (w.type === 'gdoc' && !i.fm.some((f) => f.l === 'Google Doc')) return false
    if (w.type === 'upload' && i.kind !== 'upload') return false
    if (w.type === 'transcript' && i.kind !== 'transcript') return false
    if (q && !(i.name + ' ' + (i.desc || '') + ' ' + (i.who || '') + ' ' + (i.sum || '') + ' ' + fname(i.folder)).toLowerCase().includes(q)) return false
    return true
  })
  return L.sort(
    w.sort === 'old'
      ? (a, b) => String(a.at).localeCompare(String(b.at))
      : w.sort === 'az'
        ? (a, b) => a.name.localeCompare(b.name)
        : (a, b) => String(b.at).localeCompare(String(a.at)),
  )
}

// ---------- v153: the change log, the preview panel and the folder suggestions ----------

/**
 * What changed on each item between two copies of the workspace's items, logged on the item (v153's v145WsPut wrapper):
 * "Renamed to “X”", "Moved to <folder>" or "Moved to To organize", "Starred" or "Unstarred", "Description changed" or
 * "Description removed", "Marked as a source for the stage runs" or "No longer a source for the stage runs". An upload's
 * own entry, made with it (no entry before, with a name and a source), is not a change. Each item keeps the last 30.
 * Changes `after` in place and returns it.
 */
export function logChanges(
  before: Record<string, WsItemMeta>,
  after: Record<string, WsItemMeta>,
  folderName: (id: string) => string,
  at: string,
  by: string,
): Record<string, WsItemMeta> {
  for (const k of Object.keys(after)) {
    const a = before[k] ?? {}
    const b = after[k] ?? {}
    if (!before[k] && b.source !== undefined && b.name !== undefined) continue
    const say: string[] = []
    if (b.name != null && a.name !== b.name) say.push('Renamed to “' + b.name + '”')
    if (b.folder != null && (a.folder || '') !== (b.folder || '')) say.push(b.folder ? 'Moved to ' + (folderName(b.folder) || 'a folder') : 'Moved to To organize')
    if (!!a.star !== !!b.star) say.push(b.star ? 'Starred' : 'Unstarred')
    if (b.desc != null && (a.desc || '') !== (b.desc || '')) say.push(b.desc ? 'Description changed' : 'Description removed')
    if (b.source != null && a.source !== b.source) say.push(b.source ? 'Marked as a source for the stage runs' : 'No longer a source for the stage runs')
    if (!say.length) continue
    const log = Array.isArray(b.log) ? b.log.slice(-29) : []
    for (const what of say) log.push({ at, by, what })
    after[k] = { ...b, log: log.slice(-30) }
  }
  return after
}

/** An item's kind, as Details says it (v153Kind). */
export function wsKindName(i: Pick<WsItem, 'kind'>): string {
  return i.kind === 'call' ? 'Call' : i.kind === 'transcript' ? 'Transcript' : i.kind === 'upload' ? 'Uploaded file' : 'Document'
}

/** The newest call in the same folder, for View related call (v153Related); none for a call or an item in no folder. */
export function relatedCall(i: Pick<WsItem, 'kind' | 'folder'>, calls: WsItem[]): WsItem | null {
  if (i.kind === 'call' || !i.folder) return null
  return [...calls].filter((c) => c.kind === 'call' && c.folder === i.folder).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] ?? null
}

/** The first web link among an item's formats (Open <format> in the panel's foot). */
export function firstLink(i: Pick<WsItem, 'fm'>): WsFormat | null {
  return i.fm.find((f) => f.u && /^https?:\/\//i.test(f.u)) ?? null
}

/** The line under the name: who and when (v153Paint's head), without the date. */
export function byLine(i: Pick<WsItem, 'kind' | 'mins' | 'who' | 'src' | 'by'>): string {
  if (i.kind === 'call') return [i.mins ? i.mins + ' min' : '', i.who, i.src].filter(Boolean).join(' · ')
  if (i.src === 'Uploaded' || i.kind === 'upload' || i.kind === 'transcript') return 'Uploaded' + (i.by ? ' by ' + i.by : '')
  return i.by
}

/** What the server says about an item when its panel opens (wsInfo). */
export type WsInfo = {
  /** an upload's or a transcript's text as read (lead_files.file_text): '' when none was read */
  text?: string
  indexedAt?: string
  /** a call: its post-call summary and next steps, and when they were written */
  summary?: string[]
  tasks?: { text: string; owner: string }[]
  post?: { at: string; done: boolean } | null
  /** a call: where it is filed (call_meta), when and by whom */
  filed?: { stage: string; at: string; by: string } | null
}

export type WsEvent = { at: string; what: string; by: string }

/**
 * The Activity tab (v153Activity), newest first: recorded, uploaded or written; a call filed under a stage and its
 * post-call actions; an upload's text read; sent to Asana or Notion; and every change logged on the item.
 */
export function activityOf(i: WsItem, m: WsItemMeta | undefined, info: WsInfo | null, stages: readonly Pick<Stage, 'key' | 'name'>[]): WsEvent[] {
  const ev: WsEvent[] = []
  const up = i.kind === 'upload' || i.kind === 'transcript'
  if (i.at) ev.push({ at: i.at, what: i.kind === 'call' ? 'Recorded on Fathom' : up ? 'Uploaded' + (i.by ? ' by ' + i.by : '') : 'Written by Catalyst', by: '' })
  if (i.kind === 'call' && info) {
    const f = info.filed
    if (f && f.stage && f.stage !== 'none') ev.push({ at: f.at, what: 'Filed under ' + (stages.find((s) => s.key === f.stage)?.name || f.stage), by: f.by })
    if (info.post?.done && info.post.at) ev.push({ at: info.post.at, what: 'Post-call actions written', by: '' })
  }
  if (up && info?.indexedAt) ev.push({ at: info.indexedAt, what: 'Text read for the Ask bot and the stage runs', by: '' })
  const a = obj(m?.asana)
  const n = obj(m?.notion)
  if (a.at) ev.push({ at: str(a.at), what: 'Sent to Asana · ' + str(a.project_name), by: str(a.by) })
  if (n.at) ev.push({ at: str(n.at), what: 'Sent to Notion · ' + str(n.name), by: str(n.by) })
  for (const l of Array.isArray(m?.log) ? m!.log! : []) ev.push({ at: str(l?.at), what: str(l?.what), by: str(l?.by) })
  return ev.sort((x, y) => String(y.at).localeCompare(String(x.at)))
}

const norm = (t: string) => ' ' + str(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' '

export type GuessCtx = {
  folders: WsFolder[]
  stages: readonly Pick<Stage, 'key' | 'name' | 'short' | 'doc'>[]
  /** each stage's setup meeting type (catalyst_stage_setup, by stage) */
  setupType: Record<string, string>
  /** when each stage's document was written (null when none, or only a link was saved) */
  docAt: Record<string, string | null>
  /** the stage the client is in now */
  current: string
  /** a call type's name ("Onboarding") */
  typeName: (t: string) => string
  /** a day as "Oct 1, 2026" */
  day: (iso: string) => string
}

/**
 * The folder suggested for a call or an uploaded transcript with none (v153Guess), with why, in this order: its title
 * names a folder (the longest name that fits wins; a stage's short word, or the first word of its name when that has
 * five letters or more and is not a word every meeting has); its call type is a stage's meeting type; the latest stage
 * whose document was written at or before it; else the stage the client is in now.
 */
export function guessFolder(i: Pick<WsItem, 'kind' | 'name' | 'at' | 'type'>, x: GuessCtx): { folder: string; why: string } {
  const title = norm(i.name)
  let best: { k: string; id: string; n: string } | null = null
  for (const f of x.folders) {
    const names = [f.name]
    const s = x.stages.find((st) => st.key === f.id)
    if (s) {
      if (s.short) names.push(s.short)
      const w = str(f.name).split(/\s+/)[0]
      if (w.length >= 5 && !/^(client|clients|meeting|calls?|team|first|final|kick)$/i.test(w)) names.push(w)
    }
    for (const n of names) {
      const k = norm(n)
      if (k.trim().length >= 5 && !/^ (review|call|meeting|client) $/.test(k) && title.includes(k) && (!best || k.length > best.k.length)) best = { k, id: f.id, n: n.trim() }
    }
  }
  if (best) return { folder: best.id, why: 'Its title says “' + best.n + '”' }
  if (i.kind === 'call' && i.type) {
    const s = x.stages.find((st) => x.setupType[st.key] === i.type)
    if (s) return { folder: s.key, why: 'Its call type is ' + x.typeName(i.type) + ': the ' + s.name + ' stage’s meeting' }
  }
  const t = Date.parse(i.at) || 0
  if (t) {
    let last: { at: number; s: (typeof x.stages)[number]; iso: string } | null = null
    for (const s of x.stages) {
      const iso = x.docAt[s.key]
      const at = iso ? Date.parse(iso) || 0 : 0
      if (at && at <= t && (!last || at > last.at)) last = { at, s, iso: iso! }
    }
    if (last) return { folder: last.s.key, why: 'Held after the ' + (last.s.doc || last.s.name) + ' was written (' + x.day(last.iso) + ')' }
  }
  const cs = x.stages.find((s) => s.key === x.current) ?? x.stages[0]
  return cs ? { folder: cs.key, why: 'The client is in ' + cs.name + ' now' } : { folder: '', why: '' }
}
