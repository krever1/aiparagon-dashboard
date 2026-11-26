// Meeting Types and Client Stages (the current dashboard's v145, with v146's fixes). The six meeting stages were one
// fixed list; now the board's columns are the team's Client Stages (renamed, reordered, removed, and stages of the
// team's own, each with a setup: what it is, what it needs, what to do before and after, its deliverables and workflow
// tasks), and the documents are Meeting Types (the six built in plus the team's own, each with what it writes, its
// sections, what it reads and knowledge base context). Kept for the team in ai_settings `catalyst_meeting_types` and
// `catalyst_client_stages`; built-in names stay in `catalyst_stages`. Both apps read and write the same shapes. Pure
// functions over the rows, for the server and the browser.

import { CUSTOM_STAGE, CUSTOM_TYPE, STAGES, type Stage, type StageKey, type StageNames, isStageKey } from './stages'

export type MtItem = {
  name?: string
  doc?: string
  desc?: string
  sections?: string[]
  kb?: string
  kbFiles?: string[]
  hidden?: boolean
  deleted?: boolean
  by?: string
  at?: string
}
export type MeetingTypesSetting = { order?: string[]; items?: Record<string, MtItem> }

export type CsItem = {
  name?: string
  desc?: string
  inputs?: string
  before?: string
  after?: string
  template?: string
  deliverables?: string[]
  tasks?: string[]
  type?: string
  also?: string[]
  c?: string
  deleted?: boolean
  by?: string
  at?: string
}
export type ClientStagesSetting = { order?: string[]; items?: Record<string, CsItem>; removed?: string[]; by?: string; at?: string }

/** {email: {stage: {item id: true}}}: the ticks on each lead's checklist (`d:<n>` deliverables, `t:<n>` tasks). */
export type StageTicks = Record<string, Record<string, Record<string, boolean>>>

export type CatalystConfig = { names: StageNames; mt: MeetingTypesSetting; cs: ClientStagesSetting }

export const EMPTY_CONFIG: CatalystConfig = { names: {}, mt: {}, cs: {} }

export type MeetingType = {
  key: string
  custom: boolean
  /** the meeting (a built-in type is always named as its stage is) */
  name: string
  /** what it writes */
  doc: string
  desc: string
  sections: string[]
  /** knowledge base context: a note, and guide files picked from the knowledge base (their ids) */
  kb: string
  kbFiles: string[]
  hidden: boolean
}

export type StageRec = {
  key: string
  custom: boolean
  removed: boolean
  name: string
  c: string
  desc: string
  /** the meeting type it runs: its own key for a built-in stage, a type of the team's own, or '' */
  type: string
  also: string[]
  inputs: string
  before: string
  after: string
  template: string
  deliverables: string[]
  tasks: string[]
}

/** The colours a stage of the team's own gets, in turn. */
export const STAGE_COLORS = ['#3F7F9F', '#B5654A', '#5E8C3A', '#9A5BA8', '#C29A2E', '#4A6FA5', '#7A6E5D', '#C0567A']

/** What each built-in meeting type writes (V137_TPL's sections). */
export const BUILTIN_SECS: Record<StageKey, string[]> = {
  research: [
    'Company snapshot', 'Prospect profile', 'Recent news and milestones', 'Industry context', 'AI and technology signals',
    'Important considerations', 'Department-by-department notes', 'AI opportunity notes', 'Mission, vision and strategic priorities',
    'Quick intel card', 'Sources used',
  ],
  consultation: [
    'Call objective', 'Pre-call sensitivity flag, when there is one', '1-minute mental prep', 'Open', 'Theme A: Business context',
    'Theme B: Operational pain and bottlenecks', 'Theme C: AI awareness and mindset', 'Theme D: Decision-making and timeline',
    'Pivot and positioning', 'Qualify and close', 'Post-call scoring card',
  ],
  assessment: [
    'AI readiness signal', 'Known pain points', 'Notable quotes', 'Question themes already covered', 'Key rapport angles',
    'Known tech stack', 'Decision-maker notes', 'Compliance flags', 'Content load evidence',
  ],
  proposal: [
    'Presenter script: pre-call prep, then each slide (on screen, what to say, the transition)', 'Objections and what to say',
    'Slide notes for the deck',
    'Client proposal: Executive summary, Where you are today, What we heard, Our recommendation, Scope of work, Timeline and investment, Next steps',
  ],
  onboarding: [
    'What we agreed', 'Goals and how we will measure them', 'The first 30 days', 'Who does what', 'What we need from the client',
    'Risks to watch', 'Questions for the onboarding meeting',
  ],
  review: [
    'What we set out to do', 'What has happened since', 'Results against the goals', 'What is working', 'What is not',
    'What to decide in this meeting', 'Questions to ask',
  ],
}

/** The sections a meeting type of the team's own writes when it names none. */
export const DEFAULT_SECS = ['Purpose of the meeting', 'What we know so far', 'What changed since the last meeting', 'Questions to ask', 'What to decide']

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

/** Text as the team typed it (v145Txt): line breaks kept, trimmed, cut. */
export function txt(v: unknown, n = 600): string {
  return str(v).replace(/\r\n?/g, '\n').trim().slice(0, n)
}

/** A name (v145Name): spaces collapsed, at most 60 characters. */
export function nameOf(v: unknown): string {
  return str(v).replace(/\s+/g, ' ').trim().slice(0, 60)
}

/** One per line (v145Lines): bullets and numbers taken off, empty lines dropped, 14 at most, 140 characters each. */
export function lines(t: unknown, n = 14): string[] {
  return str(t)
    .split('\n')
    .map((x) => x.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, n)
    .map((x) => x.slice(0, 140))
}

/** A JSON value the database may hand back as an object or as a string. */
export function objOf(v: unknown): Record<string, unknown> {
  let x = v
  if (typeof x === 'string') {
    try {
      x = JSON.parse(x)
    } catch {
      x = null
    }
  }
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {}
}

const strList = (v: unknown, n: number) => (Array.isArray(v) ? v.map(str).filter(Boolean).slice(0, n) : [])

/** A new key for something of the team's own (v145Id): `cs-`, `mt-` or `wf-` and six letters. */
export function newKey(p: 'cs' | 'mt' | 'wf'): string {
  return p + '-' + Math.random().toString(36).slice(2, 8).padEnd(6, '0')
}

function base(k: string) {
  return STAGES.find((s) => s.key === k) ?? null
}

/** The meeting types (v145Types): the six built in, then the team's own; hidden ones only with `all`. */
export function meetingTypes(cfg: CatalystConfig, all = false): MeetingType[] {
  const items = (objOf(cfg.mt).items ?? {}) as Record<string, MtItem>
  const names = cfg.names ?? {}
  const builtIn = STAGES.map((s): MeetingType => {
    const o = objOf(items[s.key]) as MtItem
    return {
      key: s.key,
      custom: false,
      name: txt(names[s.key], 60) || s.defaultName,
      doc: s.doc,
      desc: txt(o.desc) || s.role,
      sections: BUILTIN_SECS[s.key],
      kb: txt(o.kb, 4000),
      kbFiles: strList(o.kbFiles, 6),
      hidden: !!o.hidden,
    }
  })
  const order = Array.isArray(cfg.mt?.order) ? cfg.mt.order.map(str) : Object.keys(items)
  const own = order
    .filter((k, i, a) => CUSTOM_TYPE.test(k) && a.indexOf(k) === i && items[k] && !objOf(items[k]).deleted)
    .map((k): MeetingType => {
      const o = objOf(items[k]) as MtItem
      return {
        key: k,
        custom: true,
        name: txt(o.name, 60) || 'Meeting',
        doc: txt(o.doc, 60) || 'Meeting prep',
        desc: txt(o.desc),
        sections: strList(o.sections, 14),
        kb: txt(o.kb, 4000),
        kbFiles: strList(o.kbFiles, 6),
        hidden: false,
      }
    })
  return [...builtIn, ...own].filter((t) => all || !t.hidden)
}

export function meetingType(cfg: CatalystConfig, key: string): MeetingType | null {
  return meetingTypes(cfg, true).find((t) => t.key === key) ?? null
}

/**
 * The client stages (v145StageRecs), in the team's order: the six built in (unless removed; Prospect research never is,
 * since new leads start there) and the team's own (`cs-…`, not deleted). `withRemoved` keeps the removed built-in ones,
 * for Edit stages' Removed stages.
 */
export function stageRecs(cfg: CatalystConfig, withRemoved = false): StageRec[] {
  const C = objOf(cfg.cs) as ClientStagesSetting
  const items = objOf(C.items) as Record<string, CsItem>
  const names = cfg.names ?? {}
  const removed = strList(C.removed, 20).filter((k) => k !== 'research' && isStageKey(k))
  const known = [...STAGES.map((s) => s.key as string), ...Object.keys(items).filter((k) => CUSTOM_STAGE.test(k) && items[k] && !objOf(items[k]).deleted)]
  const order = strList(C.order, 60).filter((k, i, a) => known.includes(k) && a.indexOf(k) === i)
  for (const k of known) if (!order.includes(k)) order.push(k)
  return order
    .filter((k) => withRemoved || !removed.includes(k))
    .map((k, i): StageRec => {
      const o = objOf(items[k]) as CsItem
      const b = base(k)
      return {
        key: k,
        custom: !b,
        removed: removed.includes(k),
        name: (b ? txt(names[b.key], 60) : txt(o.name, 60)) || (b ? b.defaultName : 'Stage'),
        c: (typeof o.c === 'string' && /^#[0-9a-f]{3,8}$/i.test(o.c) ? o.c : '') || (b ? b.color : STAGE_COLORS[i % STAGE_COLORS.length]),
        desc: txt(o.desc) || (b ? b.role : ''),
        type: b ? b.key : typeof o.type === 'string' && CUSTOM_TYPE.test(o.type) ? o.type : '',
        also: strList(o.also, 8),
        inputs: txt(o.inputs),
        before: txt(o.before),
        after: txt(o.after),
        template: txt(o.template, 2000),
        deliverables: strList(o.deliverables, 14),
        tasks: strList(o.tasks, 14),
      }
    })
}

export function stageRec(cfg: CatalystConfig, key: string): StageRec | null {
  return stageRecs(cfg, true).find((r) => r.key === key) ?? null
}

/** "Strategy session brief" → "the strategy session brief". */
const theDoc = (d: string) => 'the ' + d.charAt(0).toLowerCase() + d.slice(1)

/**
 * The board's columns (v145Apply): the team's stages. A built-in stage keeps its own agent; a stage of the team's own
 * runs its meeting type through Catalyst · Meeting Prep, or nothing when it has none.
 */
export function teamStages(cfg: CatalystConfig): Stage[] {
  const types = meetingTypes(cfg, true)
  const out = stageRecs(cfg).map((r): Stage => {
    const b = base(r.key)
    if (b) return { ...b, name: r.name, color: r.c, role: r.desc || b.role }
    const t = r.type ? types.find((x) => x.key === r.type && x.custom) : undefined
    const common = { key: r.key, base: null, custom: true, name: r.name, defaultName: r.name, urlCol: null, color: r.c }
    if (!t) return { ...common, mt: '', norun: true, short: r.name, doc: '', what: '', agent: '', from: '', role: r.desc || 'A stage of your own.' }
    return {
      ...common,
      mt: t.key,
      norun: false,
      short: t.doc,
      doc: t.doc,
      what: theDoc(t.doc),
      agent: 'meeting_prep',
      from: 'every document so far and what was said in the meetings',
      role: r.desc || t.desc || 'Prepares the ' + r.name + ' meeting.',
    }
  })
  return out.length ? out : STAGES.map((s) => ({ ...s }))
}

/** The meeting type a stage runs (its own for a built-in stage). */
export function typeOfStage(cfg: CatalystConfig, st: Pick<Stage, 'mt'>): MeetingType | null {
  return st.mt ? meetingType(cfg, st.mt) : null
}

/** The client stages a meeting type runs in: the stage whose type it is, or that lists it among its other types. */
export function stagesOfType(cfg: CatalystConfig, stages: readonly Stage[], key: string): Stage[] {
  return stages.filter((s) => s.mt === key || (stageRec(cfg, s.key)?.also ?? []).includes(key))
}

/**
 * What a Meeting Prep run sends beyond v136's body (v136PrepBody, wrapped by v145): the sections to write (the stage's
 * own output template, else a type of the team's own, two or more) and what the meeting is for.
 */
export function prepExtras(cfg: CatalystConfig, st: Pick<Stage, 'key' | 'mt'>): { sections?: string[]; purpose?: string } {
  const r = stageRec(cfg, st.key)
  const t = st.mt ? meetingType(cfg, st.mt) : null
  const secs = r && r.template ? lines(r.template) : t && t.custom ? t.sections : []
  const out: { sections?: string[]; purpose?: string } = {}
  if (secs.length >= 2) out.sections = secs
  const purpose = [r?.desc ?? '', t && t.custom ? t.desc : '']
    .filter(Boolean)
    .map((x) => x.replace(/[.\s]+$/, ''))
    .join('. ')
  if (purpose) out.purpose = purpose.slice(0, 600)
  return out
}

/** What a stage of the team's own reads, always (its V137_TPL `always`). */
export function customAlways(t: Pick<MeetingType, 'kb' | 'kbFiles'> | null): string {
  return 'Every document so far, your house rules' + (t && (t.kb || t.kbFiles.length) ? ' and its knowledge base context' : '')
}

/** The sections a stage of the team's own writes (its meeting type's, else the usual five). */
export function customSecs(t: Pick<MeetingType, 'sections'> | null): string[] {
  return t && t.sections.length ? t.sections : DEFAULT_SECS
}

/** The team's settings from the three ai_settings rows. */
export function configFrom(names: StageNames, mt: unknown, cs: unknown): CatalystConfig {
  return { names, mt: objOf(mt) as MeetingTypesSetting, cs: objOf(cs) as ClientStagesSetting }
}

/** The ticks, as saved. */
export function ticksFrom(v: unknown): StageTicks {
  return objOf(v) as StageTicks
}

/** One lead's ticks for one stage. */
export function ticksOf(all: StageTicks, email: string, stage: string): Record<string, boolean> {
  const e = objOf(all[email]) as Record<string, Record<string, boolean>>
  return objOf(e[stage]) as Record<string, boolean>
}

// ---------- Edit stages: what the dialog saves ----------

export type EditRow = { key: string; name: string; isNew?: boolean; type?: string; c?: string }

/** The checks before Edit stages saves (v145StagesSave): at least one stage, every one named, no two alike. */
export function editProblem(rows: EditRow[]): string {
  if (!rows.length) return 'Keep at least one stage.'
  const names = rows.map((r) => nameOf(r.name))
  if (names.some((n) => !n)) return 'Every stage needs a name.'
  const low = names.map((n) => n.toLowerCase())
  if (low.some((n, i) => low.indexOf(n) !== i)) return 'Two stages have the same name.'
  if (!rows.some((r) => r.key === 'research')) return 'Prospect research stays: new leads start there.'
  return ''
}

/** A stage brought back goes to its usual place: before the next built-in stage that is still there (v146). */
export function backInPlace(order: string[], key: string): string[] {
  const o = order.filter((x) => x !== key)
  const bi = STAGES.findIndex((s) => s.key === key)
  const nx = STAGES.slice(bi + 1)
    .map((s) => s.key as string)
    .find((x) => o.includes(x))
  if (nx) o.splice(o.indexOf(nx), 0, key)
  else o.push(key)
  return o
}
