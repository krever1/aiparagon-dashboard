// Calls' rules, as the current dashboard has them (v85, v88, v92, v121): a Fathom call and what the team saved about it
// (call_meta), its post-call actions (call_outputs), call types and the buttons that group them, client folders, the
// people on a call, and the list's search and filters. Pure: the page and the tests both use it.

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const lower = (v: unknown) => str(v).trim().toLowerCase()

// ---------- a Fathom call ----------

export type FtPerson = { name: string; email: string; external: boolean }
export type FtAction = { text: string; who: string; t: string; done: boolean; link: string }
export type FtLine = { speaker: string; t: string; text: string }
export type FtCall = {
  id: string
  title: string
  start: string
  end: string
  shareUrl: string
  url: string
  recordedBy: { name: string; email: string } | null
  invitees: FtPerson[]
  summary: string
  actions: FtAction[]
  sharedWith: string
  /** outside guests on the invite */
  external: boolean
}

function person(p: unknown): FtPerson {
  const o = (p ?? {}) as Record<string, unknown>
  return { name: str(o.name), email: str(o.email), external: o.external === true }
}

/** A call as Dashboard · Fathom Proxy lists it. */
export function normCall(c: unknown): FtCall {
  const o = (c ?? {}) as Record<string, unknown>
  const rb = o.recorded_by && typeof o.recorded_by === 'object' ? (o.recorded_by as Record<string, unknown>) : null
  const invitees = Array.isArray(o.invitees) ? o.invitees.map(person) : []
  const actions = Array.isArray(o.actions)
    ? (o.actions as Record<string, unknown>[]).map((a) => ({ text: str(a?.text), who: str(a?.who), t: str(a?.t), done: a?.done === true, link: str(a?.link) }))
    : []
  return {
    id: str(o.id),
    title: str(o.title || o.meeting_title),
    start: str(o.start || o.created_at),
    end: str(o.end),
    shareUrl: str(o.share_url),
    url: str(o.url),
    recordedBy: rb ? { name: str(rb.name), email: str(rb.email) } : null,
    invitees,
    summary: str(o.summary),
    actions,
    sharedWith: str(o.shared_with),
    // with invitees, a client call is one with an outside guest on the invite (apFtNorm)
    external: invitees.length ? invitees.some((i) => i.external) : o.external === true,
  }
}

export function minutesOf(c: Pick<FtCall, 'start' | 'end'>): number {
  const a = Date.parse(c.start)
  const b = Date.parse(c.end)
  return a && b && b > a ? Math.round((b - a) / 60000) : 0
}

/** "4.5" hours under ten, a whole number above, "0" for none. */
export function hoursText(minutes: number): string {
  if (!minutes) return '0'
  const h = minutes / 60
  return h < 10 ? String(Math.round(h * 10) / 10) : String(Math.round(h))
}

/** The share link's token, for the embedded player (https://fathom.video/share/<token>). */
export function shareToken(c: Pick<FtCall, 'shareUrl'>): string {
  return /^https:\/\/fathom\.video\/share\/([A-Za-z0-9_-]{8,64})/.exec(c.shareUrl)?.[1] ?? ''
}

/** A link into Fathom: the share link, else the call's own address. */
export function fathomLink(c: Pick<FtCall, 'shareUrl' | 'url'>): string {
  const u = c.shareUrl || c.url
  return /^https:\/\/([a-z0-9-]+\.)*fathom\.video\//i.test(u) ? u : ''
}

export const isFathomUrl = (u: unknown) => /^https:\/\/([a-z0-9-]+\.)*fathom\.video\//i.test(str(u))

// ---------- what the team saved about a call, and its post-call actions ----------

export type Guest = { name: string; email: string; external: boolean }
export type CrmResult = { ok: boolean; message: string; code: string; contacts: { name: string; email: string }[] }
export type CallMeta = {
  call_id: string
  title: string
  folder: string
  client: string
  tags: string[]
  meeting_type: string
  description: string
  guests: Guest[]
  crm_synced_at: string
  crm_result: CrmResult | null
  lead_email: string
  lead_stage: string
}
export type Task = { id: string; text: string; owner: string; due: string; why: string; done: boolean }
export type CallOutput = {
  id: string
  call_id: string
  status: string
  error: string
  summary: string[]
  tasks: Task[]
  deliverable: { title: string; markdown: string } | null
  follow_up: { subject: string; body: string } | null
  slack_posted_at: string
  source: string
  created_by: string
  created_at: string
  meeting_type: string
  /** the call's title and start as the post-call actions saved them (Tasks, for a call Fathom did not list) */
  call_title: string
  call_start: string
  /** when its tasks were sent to Asana, and the project (the current dashboard's Send to Asana) */
  asana: { at: string; project_name: string } | null
}

function parsed(v: unknown): unknown {
  if (typeof v !== 'string') return v
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}
const arr = (v: unknown): unknown[] => {
  const p = parsed(v)
  return Array.isArray(p) ? p : []
}
const obj = (v: unknown): Record<string, unknown> | null => {
  const p = parsed(v)
  return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, unknown>) : null
}

export function normMeta(r: Record<string, unknown>): CallMeta {
  const crm = obj(r.crm_result)
  return {
    call_id: str(r.call_id),
    title: str(r.title).trim(),
    folder: str(r.folder).trim(),
    client: str(r.client).trim(),
    tags: arr(r.tags).map((t) => str(t).trim()).filter(Boolean),
    meeting_type: str(r.meeting_type).trim(),
    description: str(r.description).trim(),
    guests: arr(r.guests).map((g) => {
      const o = (g ?? {}) as Record<string, unknown>
      return { name: str(o.name).trim(), email: str(o.email).trim(), external: o.external === true }
    }),
    crm_synced_at: str(r.crm_synced_at),
    crm_result: crm
      ? {
          ok: crm.ok === true,
          message: str(crm.message),
          code: str(crm.code),
          contacts: arr(crm.contacts).map((c) => {
            const o = (c ?? {}) as Record<string, unknown>
            return { name: str(o.name), email: str(o.email) }
          }),
        }
      : null,
    lead_email: str(r.lead_email).trim(),
    lead_stage: str(r.lead_stage).trim(),
  }
}

/** A post-call summary point: a line, or {text} / {point}. */
export const pointText = (x: unknown) => (typeof x === 'string' ? x : str((x as Record<string, unknown>)?.text || (x as Record<string, unknown>)?.point))

export function normOutput(r: Record<string, unknown>): CallOutput {
  const d = obj(r.deliverable)
  const f = obj(r.follow_up)
  return {
    id: str(r.id),
    call_id: str(r.call_id),
    status: str(r.status),
    error: str(r.error),
    summary: arr(r.summary).map(pointText).filter(Boolean),
    tasks: arr(r.tasks).map((t, i) => {
      const o = (t ?? {}) as Record<string, unknown>
      return { id: str(o.id) || String(i), text: str(o.text), owner: str(o.owner), due: str(o.due), why: str(o.why), done: o.done === true }
    }),
    deliverable: d ? { title: str(d.title), markdown: str(d.markdown) } : null,
    follow_up: f ? { subject: str(f.subject), body: str(f.body) } : null,
    slack_posted_at: str(r.slack_posted_at),
    source: str(r.source),
    created_by: str(r.created_by),
    created_at: str(r.created_at),
    meeting_type: str(r.meeting_type).trim(),
    call_title: str(r.call_title).trim(),
    call_start: str(r.call_start),
    asana: (() => {
      const a = obj(r.asana)
      return a && a.at ? { at: str(a.at), project_name: str(a.project_name) } : null
    })(),
  }
}

// ---------- call types and the buttons that group them ----------

export const MT: Record<string, { label: string; deliv: string }> = {
  demo: { label: 'Client demo', deliv: 'demo recap' },
  sales: { label: 'Sales call', deliv: 'sales call notes' },
  interview: { label: 'Interview / prequal', deliv: 'prequal call notes' },
  discovery: { label: 'Discovery', deliv: 'discovery recap' },
  proposal: { label: 'Proposal', deliv: 'proposal follow-up' },
  onboarding: { label: 'Onboarding', deliv: '30-day onboarding plan' },
  checkin: { label: 'Check-in', deliv: 'client status update' },
  dev: { label: 'Internal development', deliv: 'build notes' },
  internal: { label: 'Internal meeting', deliv: 'meeting notes' },
  other: { label: 'Other', deliv: 'meeting notes' },
}
export const MT_KEYS = ['demo', 'sales', 'interview', 'discovery', 'proposal', 'onboarding', 'checkin', 'dev', 'internal', 'other']

/** The buttons along the top, and the types under each. */
export const CATS: readonly (readonly [string, string, readonly string[]])[] = [
  ['demo', 'Client demos', ['demo']],
  ['sales', 'Sales', ['sales', 'interview', 'discovery', 'proposal']],
  ['client', 'Client work', ['onboarding', 'checkin']],
  ['dev', 'Internal development', ['dev']],
  ['internal', 'Internal meetings', ['internal']],
  ['other', 'Other', ['other']],
]
/** Erica's three always show; the rest once a call has them. */
export const CAT_MAIN = ['demo', 'sales', 'dev']
export const IN_FOLDER = 'AI Paragon (internal)'
export const NO_CLIENT = 'No client yet'

/**
 * The team's names for the built-in types and the buttons (ai_settings call_type_names, v144): {type key or
 * cat:<button>: name}; an empty name is the usual one.
 */
export type TypeNames = Record<string, string>

export function cleanNames(v: unknown): TypeNames {
  const o = obj(v)
  if (!o) return {}
  const out: TypeNames = {}
  for (const [k, x] of Object.entries(o)) {
    if (typeof x !== 'string') continue
    const n = str(x).replace(/\s+/g, ' ').trim().slice(0, 30)
    if (n) out[k] = n
  }
  return out
}

/** A built-in type's name, the team's when it has one (v144Labels); a type of the team's own is its name. */
export const typeLabel = (t: string, names: TypeNames = {}) => (t && MT[t] ? names[t] || MT[t].label : t)
/** The chip's short name: "Interview" for "Interview / prequal"; a type of the team's own is its name. */
export const typeShort = (t: string, names: TypeNames = {}) => (t && MT[t] ? typeLabel(t, names).split(' /')[0] : t)
/** A button's name, the team's when it has one. */
export const catName = (k: string, names: TypeNames = {}) => names['cat:' + k] || (CATS.find((x) => x[0] === k)?.[1] ?? k)
export const deliverableOf = (t: string) => (t && MT[t] ? MT[t].deliv : 'meeting notes')

export function catOf(t: string): string {
  if (!t) return 'none'
  const c = CATS.find((x) => x[2].includes(t))
  return c ? c[0] : 'x:' + t
}
export function catLabel(k: string, names: TypeNames = {}): string {
  if (k === 'none') return 'No type yet'
  if (k.startsWith('x:')) return k.slice(2)
  return catName(k, names)
}

/** A call's type: the team's, else the AI's pick on its post-call actions. */
export const typeOf = (m: CallMeta | null | undefined, o: CallOutput | null | undefined) => m?.meeting_type || o?.meeting_type || ''
export const typeGuessed = (m: CallMeta | null | undefined, o: CallOutput | null | undefined) => !m?.meeting_type && !!typeOf(m, o)

/** The team's own types (ai_settings call_types): names, or {label}, 30 characters at most. */
export function customTypes(v: unknown): string[] {
  return arr(v)
    .map((x) => str((x as Record<string, unknown>)?.label ?? x).trim().slice(0, 30))
    .filter(Boolean)
}

/** Why a new type's name is turned away, in the current dashboard's words, or ''. The team's names count. */
export function newTypeProblem(name: string, names: TypeNames = {}): string {
  const v = name.replace(/\s+/g, ' ').trim()
  const lo = v.toLowerCase()
  if (v.length < 2) return 'Give it a name, two letters or more.'
  if (/[<>{}[\]\\]/.test(v)) return 'Use letters, numbers and spaces.'
  if (
    MT_KEYS.some((k) => k === lo || typeLabel(k, names).toLowerCase() === lo) ||
    CATS.some((c) => catName(c[0], names).toLowerCase() === lo) ||
    lo === 'no type yet'
  ) {
    return 'That type is already in the list.'
  }
  return ''
}

// ---------- the people on a call, and its client folder ----------

export const TEAM_EMAIL = /@aiparagonconsulting\.com$/i
/** Outside the team: marked as client side, or an email that is not the team's. */
export const isOutside = (p: { external: boolean; email: string }) => p.external || (!!p.email && !TEAM_EMAIL.test(p.email))

/** Fathom's guests: the invitees but the person who recorded the call. */
export function ftGuests(c: FtCall): Guest[] {
  const rec = c.recordedBy?.email
  return c.invitees.filter((i) => !(rec && i.email && i.email === rec)).map((i) => ({ name: i.name, email: i.email, external: i.external }))
}

/** The guests: the team's list when they changed it, else Fathom's. */
export function guestsOf(c: FtCall, m: CallMeta | null | undefined): Guest[] {
  return m?.guests.length ? m.guests : ftGuests(c)
}

/** Whether a call has a client on it: the team's list decides when there is one. */
export function isClientCall(c: FtCall, m: CallMeta | null | undefined): boolean {
  return m?.guests.length ? m.guests.some((g) => g.external) : c.external
}

/** Who recorded the call, then the guests, each once; a call Fathom did not list has only the people the team saved. */
export function peopleOf(c: FtCall | null, m: CallMeta | null | undefined): Guest[] {
  const out: Guest[] = []
  const seen = new Set<string>()
  const add = (p: Guest) => {
    const k = lower(p.email || p.name)
    if (!k || seen.has(k)) return
    seen.add(k)
    out.push({ name: p.name.trim(), email: p.email.trim(), external: p.external })
  }
  if (c?.recordedBy) add({ name: c.recordedBy.name, email: c.recordedBy.email, external: false })
  ;(c ? guestsOf(c, m) : (m?.guests ?? [])).forEach(add)
  return out
}

const FREE = /^(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|mac|aol|proton|protonmail|gmx|zoho|fastmail)\./i

/** A company name from an email's domain ("acme.co.uk" is Acme); none for free mail. */
export function companyOf(email: string): string {
  const d = lower(email).split('@')[1] || ''
  if (!d || FREE.test(d)) return ''
  const p = d.split('.').filter(Boolean)
  if (p.length < 2) return ''
  let n = p[p.length - 2]
  if (p.length > 2 && /^(co|com|org|net|gov|ac)$/.test(n)) n = p[p.length - 3]
  return n
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * The client folder a call is filed in: the folder set on it, else its client company, else its Catalyst lead's
 * company, else the company of the people on it; a call with only the team is AI Paragon (internal), and a client call
 * with no client on the invite is No client yet. A call Fathom did not list (Tasks) and with no people saved is only
 * internal when its type is: the current dashboard's v121Folder, lead's company only for a call Fathom listed.
 */
export function folderOf(c: FtCall | null, m: CallMeta | null | undefined, o: CallOutput | null | undefined, leadCompany = ''): string {
  if (m?.folder) return m.folder
  if (m?.client) return m.client
  if (c && leadCompany) return leadCompany
  const ext = peopleOf(c, m).filter(isOutside)
  for (const p of ext) {
    const n = companyOf(p.email)
    if (n) return n
  }
  if (ext.length) return ext[0].name || ext[0].email
  const cat = catOf(typeOf(m, o))
  if (c || m?.guests.length) return ['demo', 'sales', 'client'].includes(cat) ? NO_CLIENT : IN_FOLDER
  return cat === 'dev' || cat === 'internal' ? IN_FOLDER : NO_CLIENT
}

// ---------- filing a call by its people (v144: v144Match, v144Norm, v144Dom, v144KnownFolders, the v121Folder wrapper) ----------

export type FileLead = { emails: string[]; company: string; name: string }
export type FileContact = { email: string; company: string }
/** What files a call by its people: the Catalyst leads, the HubSpot contacts, and the folders the team made (set on a
 * call, or kept in ai_settings call_folders). */
export type FilingCtx = { leads: FileLead[]; contacts: FileContact[]; folders: string[] }
export const NO_FILING: FilingCtx = { leads: [], contacts: [], folders: [] }

/** A company name to compare: lower case, no Inc, LLC, Group or The, letters and numbers only. */
export const normName = (t: unknown) =>
  str(t)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(inc|llc|ltd|co|corp|corporation|company|group|the)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')

/** A work email's domain; none for free mail or the team's own. */
export function workDomain(email: string): string {
  const d = lower(email).split('@')[1] || ''
  return d && !FREE.test(d) && !/aiparagonconsulting\.com$/.test(d) ? d : ''
}

/** A folder the team has by that company name, else the name as it is. */
export function asFolder(name: string, known: string[]): string {
  const n = normName(name)
  if (!n) return ''
  return known.find((f) => normName(f) === n) ?? str(name).trim()
}

/** The folders the team made: set on a call, or kept in call_folders. */
export function knownFolders(metas: CallMeta[], team: string[]): string[] {
  return [...new Set([...metas.map((m) => m.folder).filter(Boolean), ...team.filter(Boolean)])]
}

const PLACEHOLDER = /deltaadvisory\.com$/i

/** The people on a call from outside the team, with an email. */
export const outsiders = (c: FtCall | null, m: CallMeta | null | undefined) =>
  peopleOf(c, m).filter(isOutside).filter((p) => p.email && !TEAM_EMAIL.test(p.email))

export type Match = { folder: string; how: 'lead' | 'domain' | 'contact' | 'folder' }

/**
 * What files a call by its people (v144Match): a lead with a guest's email, then a lead at a guest's company (the same
 * work email domain), then a HubSpot contact's company, then a folder the team already has with the guest's company
 * name. Free mail never counts. Null when none of those.
 */
export function matchCall(c: FtCall | null, m: CallMeta | null | undefined, ctx: FilingCtx): Match | null {
  const ext = outsiders(c, m)
  if (!ext.length) return null
  const leads = ctx.leads.filter((l) => l.emails.length && !PLACEHOLDER.test(l.emails[0]))
  const known = ctx.folders
  for (const p of ext) {
    const e = lower(p.email)
    const l = leads.find((x) => x.emails.map(lower).includes(e))
    if (l) return { folder: asFolder(l.company || l.name || e, known), how: 'lead' }
  }
  for (const p of ext) {
    const d = workDomain(p.email)
    if (!d) continue
    const l = leads.find((x) => x.emails.some((y) => workDomain(y) === d) && x.company)
    if (l) return { folder: asFolder(l.company, known), how: 'domain' }
  }
  for (const p of ext) {
    const ct = ctx.contacts.find((x) => lower(x.email) === lower(p.email))
    if (ct?.company) return { folder: asFolder(ct.company, known), how: 'contact' }
  }
  for (const p of ext) {
    const co = companyOf(p.email)
    if (!co) continue
    const f = known.find((x) => normName(x) === normName(co))
    if (f) return { folder: f, how: 'folder' }
  }
  return null
}

/** The two folders the dashboard sets on its own. */
export const autoFolder = (f: string) => f === IN_FOLDER || f === NO_CLIENT

/**
 * The folder a call is filed in, with v144's filing: the folder or client set on it, else what its people match, else
 * folderOf, with a company name that matches a folder the team has taking that folder's name.
 */
export function filedFolder(c: FtCall | null, m: CallMeta | null | undefined, o: CallOutput | null | undefined, ctx: FilingCtx, leadCompany = ''): string {
  if (m?.folder || m?.client) return folderOf(c, m, o, leadCompany)
  const x = matchCall(c, m, ctx)
  if (x) return x.folder
  const f = folderOf(c, m, o, leadCompany)
  return autoFolder(f) ? f : asFolder(f, ctx.folders) || f
}

/** Every call the page knows (Fathom's list, the saved details, the post-call actions) by the folder it is filed in
 * (v144CallIds, v144InFolder). */
export function callsByFolder(
  calls: FtCall[],
  meta: Record<string, CallMeta>,
  outputs: Record<string, CallOutput>,
  leads: { emails: string[]; company: string }[],
  ctx: FilingCtx,
): Record<string, string[]> {
  const byId = new Map(calls.map((c) => [c.id, c]))
  const ids = new Set<string>([...calls.map((c) => c.id), ...Object.keys(meta), ...Object.values(outputs).map((o) => o.call_id).filter(Boolean)])
  const out: Record<string, string[]> = {}
  for (const id of ids) {
    const c = byId.get(id) ?? null
    const m = meta[id] ?? null
    const lead = c ? leadOf(c, m, leads) : null
    const f = filedFolder(c, m, outputs[id] ?? null, ctx, lead?.company ?? '')
    ;(out[f] ??= []).push(id)
  }
  return out
}

/** How many calls stay filed under deleted folders by the people on them (or their client) once the folders are taken off
 * the calls they were set on (v144Save's toast). */
export function keptAfterDelete(
  calls: FtCall[],
  meta: Record<string, CallMeta>,
  outputs: Record<string, CallOutput>,
  leads: { emails: string[]; company: string }[],
  ctx: FilingCtx,
  deleted: string[],
): number {
  if (!deleted.length) return 0
  const m2: Record<string, CallMeta> = {}
  for (const [k, m] of Object.entries(meta)) m2[k] = deleted.includes(m.folder) ? { ...m, folder: '' } : m
  const by = callsByFolder(calls, m2, outputs, leads, { ...ctx, folders: ctx.folders.filter((f) => !deleted.includes(f)) })
  return deleted.reduce((n, f) => n + (by[f]?.length ?? 0), 0)
}

/** The Catalyst lead among a call's guests, by email (apCxLead). */
export function leadOf<L extends { emails: string[] }>(c: FtCall, m: CallMeta | null | undefined, leads: L[]): L | null {
  for (const e of guestsOf(c, m).map((g) => g.email.toLowerCase()).filter(Boolean)) {
    const l = leads.find((x) => x.emails.includes(e))
    if (l) return l
  }
  return null
}

/** "With Robin Sample, QA Teammate", outside people first, four at most. */
export function withLine(people: Guest[]): string {
  const names = people
    .filter(isOutside)
    .concat(people.filter((p) => !isOutside(p)))
    .map((p) => p.name || p.email)
    .filter(Boolean)
  return names.length ? 'With ' + names.slice(0, 4).join(', ') + (names.length > 4 ? ' +' + (names.length - 4) : '') : 'No people listed'
}

// ---------- the list: search, filters and the type buttons ----------

export type CallRow = {
  call: FtCall
  /** the title the team saved, else Fathom's */
  title: string
  meta: CallMeta | null
  out: CallOutput | null
  type: string
  cat: string
  folder: string
  client: boolean
  hay: string
}

export function callRow(c: FtCall, m: CallMeta | null, o: CallOutput | null, leadCompany = '', ctx: FilingCtx = NO_FILING): CallRow {
  const type = typeOf(m, o)
  const folder = filedFolder(c, m, o, ctx, leadCompany)
  const title = m?.title || c.title
  const hay = [
    title,
    c.title,
    c.recordedBy?.name,
    m?.folder,
    m?.client,
    folder,
    m?.description,
    ...(m?.tags ?? []),
    typeLabel(type),
    ...guestsOf(c, m).flatMap((g) => [g.name, g.email]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return { call: c, title, meta: m, out: o, type, cat: catOf(type), folder, client: isClientCall(c, m), hay }
}

export type CallTab = 'all' | 'ext' | 'int'
export type CallFilters = { q: string; folder: string; tag: string; cat: string }

export const inTab = (r: CallRow, tab: CallTab) => (tab === 'ext' ? r.client : tab === 'int' ? !r.client : true)

export function filterRows(rows: CallRow[], tab: CallTab, f: CallFilters): CallRow[] {
  const q = f.q.trim().toLowerCase()
  return rows.filter(
    (r) =>
      inTab(r, tab) &&
      (!f.folder || r.folder === f.folder) &&
      (!f.tag || (r.meta?.tags ?? []).includes(f.tag)) &&
      (!f.cat || r.cat === f.cat) &&
      (!q || r.hay.includes(q)),
  )
}

export type CatButton = { key: string; label: string; n: number }

/**
 * The type buttons for a list of calls, one kind each (v121CatBtns): All, then the kinds in the order of the buttons
 * (Client demos, Sales and Internal development always, Client work and Internal meetings once a call has them), the
 * team's own types A to Z, Other, and No type yet, each with how many there are.
 */
export function catButtonsOf(cats: string[], names: TypeNames = {}): CatButton[] {
  const n = (k: string) => cats.filter((c) => c === k).length
  const out = [{ key: '', label: 'All', n: cats.length }]
  for (const [k] of CATS) if (k !== 'other' && (n(k) || CAT_MAIN.includes(k))) out.push({ key: k, label: catLabel(k, names), n: n(k) })
  const mine = [...new Set(cats.filter((k) => k.startsWith('x:')))].sort((a, b) => a.localeCompare(b))
  for (const k of mine) out.push({ key: k, label: catLabel(k), n: n(k) })
  if (n('other')) out.push({ key: 'other', label: catLabel('other', names), n: n('other') })
  if (n('none')) out.push({ key: 'none', label: catLabel('none'), n: n('none') })
  return out
}

/** The type buttons on Calls: each kind of call with how many there are on the tab. */
export function catButtons(rows: CallRow[], tab: CallTab, names: TypeNames = {}): CatButton[] {
  return catButtonsOf(rows.filter((r) => inTab(r, tab)).map((r) => r.cat), names)
}

/** The folder filter's choices: every call's folder, every folder set and the team's own (call_folders, v144), A to Z,
 * No client yet last. */
export function folderChoices(rows: { folder: string }[], metas: CallMeta[], team: string[] = []): string[] {
  const s = new Set<string>()
  rows.forEach((r) => s.add(r.folder))
  metas.forEach((m) => m.folder && s.add(m.folder))
  team.forEach((f) => f && s.add(f))
  return [...s].sort((a, b) => (a === NO_CLIENT ? 1 : b === NO_CLIENT ? -1 : a.localeCompare(b)))
}

export function tagChoices(metas: CallMeta[]): string[] {
  return [...new Set(metas.flatMap((m) => m.tags))].sort()
}

/** Tags as saved: lower case, no '#', spaces as '-', 30 characters each, twelve at most. */
export function cleanTags(v: string): string[] {
  const out: string[] = []
  for (const t of v.split(',')) {
    const x = t.trim().toLowerCase().replace(/^#+/, '').replace(/\s+/g, '-').slice(0, 30)
    if (x && !out.includes(x)) out.push(x)
  }
  return out.slice(0, 12)
}

/** The empty list's line, in the order the current dashboard picks it. */
export function emptyLine(all: CallRow[], tab: CallTab, f: CallFilters): { text: string; clear?: 'filters' | 'cat' } {
  const onTab = all.filter((r) => inTab(r, tab))
  if (f.cat && onTab.length && !f.folder && !f.tag) return { text: 'Nothing under ' + catLabel(f.cat) + ' here yet.', clear: 'cat' }
  if (f.folder || f.tag) return { text: 'No calls match these filters.', clear: 'filters' }
  if (f.q.trim() && onTab.length) return { text: 'No calls match that search.' }
  if (tab === 'ext') return { text: 'No calls with outside guests loaded yet.' }
  if (tab === 'int') return { text: 'No internal calls loaded yet.' }
  return { text: 'No calls yet. Record one in Fathom and refresh.' }
}

// ---------- what goes out: tasks, Slack, HubSpot ----------

/** "- [ ] Send the pricing (Pat, due 2026-11-12)", the open ones only when asked. */
export function tasksText(tasks: Task[], onlyOpen: boolean): string {
  return tasks
    .filter((t) => !onlyOpen || !t.done)
    .map((t) => {
      const extra = [t.owner, t.due ? 'due ' + t.due : ''].filter(Boolean)
      return '- ' + (t.done ? '[x] ' : '[ ] ') + t.text + (extra.length ? ' (' + extra.join(', ') + ')' : '')
    })
    .join('\n')
}

/** The Slack message, ready to edit: the call, the summary, the open next steps, the recording. */
export function slackText(p: { title: string; day: string; type: string; out: CallOutput | null; link: string; names?: TypeNames }): string {
  const sum = p.out?.summary ?? []
  const open = (p.out?.tasks ?? []).filter((t) => !t.done)
  const L = ['*' + p.title + '*' + (p.day ? ' · ' + p.day : '') + (p.type ? ' · ' + typeLabel(p.type, p.names) : '')]
  if (sum.length) L.push('', '*Summary*', sum.map((s) => '• ' + s).join('\n'))
  if (open.length) L.push('', '*Next steps*', open.map((t) => '• ' + t.text + (t.owner ? ' (' + t.owner + (t.due ? ', due ' + t.due : '') + ')' : '')).join('\n'))
  if (p.link) L.push('', '<' + p.link + '|Recording in Fathom>')
  return L.join('\n')
}

/** The client's emails for HubSpot: guests marked client side, or with an email that is not the team's. */
export function crmEmails(guests: Guest[]): string[] {
  return guests.filter((g) => g.email && (g.external || !TEAM_EMAIL.test(g.email))).map((g) => g.email)
}

/** The note HubSpot logs on the contacts. */
export function crmBody(p: { type: string; meta: CallMeta | null; out: CallOutput | null; ftSummary: string; link: string; names?: TypeNames }): string {
  const L: string[] = []
  if (p.type) L.push('Call type: ' + typeLabel(p.type, p.names))
  if (p.meta?.folder) L.push('Folder: ' + p.meta.folder)
  if (p.meta?.tags.length) L.push('Tags: ' + p.meta.tags.map((t) => '#' + t).join(' '))
  if (p.meta?.description) L.push('', 'Notes: ' + p.meta.description)
  const sum = p.out?.status === 'done' ? p.out.summary : []
  if (sum.length) L.push('', 'Summary:', sum.map((s) => '- ' + s).join('\n'))
  else if (p.ftSummary) L.push('', 'Fathom summary:', p.ftSummary.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').slice(0, 4000))
  const tk = tasksText(p.out?.tasks ?? [], true)
  if (tk) L.push('', 'Next steps:', tk)
  if (p.link) L.push('', 'Recording: ' + p.link)
  L.push('', 'Logged from the AI Paragon dashboard.')
  return L.join('\n')
}

/** "3h ago", as the current dashboard says it (apAgo). */
export function agoText(iso: string, now = Date.now()): string {
  const t = Date.parse(iso)
  if (!t) return ''
  const h = Math.round((now - t) / 36e5)
  if (h < 1) return 'just now'
  if (h < 24) return h + 'h ago'
  const d = Math.round(h / 24)
  return d < 30 ? d + 'd ago' : Math.round(d / 30) + 'mo ago'
}
