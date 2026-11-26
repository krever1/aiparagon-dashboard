// The client workspace on a lead's Files tab (the current dashboard's v145, Erica's Client Workspace design, with v146's
// fixes): Files and Calls side by side, folders on the left (All content, Starred, To organize, then a folder per
// client stage and the team's own), stage folder cards, search, a type filter, a sort, a list or grid. Each item has a
// name, a folder, a description and a star, kept for the team in ai_settings `catalyst_ws` ({lead email in lower case:
// {folders: [{id, name}], items: {key: {name, folder, desc, star, source, stage}}}}; keys `a:<agent>`, `p:<stage>`,
// `f:<lead_files id>`, `c:<call id>`). Since v151 an item also keeps what went where: `asana` {at, by, project,
// project_name, url} and `notion` {at, by, db, name}. Pure functions, for the server and the browser.

import type { Stage } from './stages'

export type WsAsana = { at?: string; by?: string; project?: string; project_name?: string; url?: string }
export type WsNotion = { at?: string; by?: string; db?: string; name?: string }
export type WsItemMeta = { name?: string; folder?: string; desc?: string; star?: boolean; source?: boolean; stage?: string; asana?: WsAsana; notion?: WsNotion }
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

export type WsCall = { id: string; title: string; start: string; minutes: number; stage: string; who: string; summary: string; link?: string }

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
      mins: x.minutes, who: x.who, src: 'Fathom', sum: x.summary, filed: !!x.stage, link: x.link || '', sent: sentOf(m),
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
