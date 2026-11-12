// Fill it in for me on New draft (v99AfRequest, v99Fill, v99AfApply and v99FillUndo in the current dashboard, with
// v105's and v110's wrappers): the request Engine 3 · Auto-fill reads, its answer checked, and the form with the answer
// in it, never over what the team typed. Pure: the page, the server and the tests use it.

import { clip } from '@/lib/touchpoint/approvals'
import {
  type BriefPick, type Form, type KindKey, type Material, type Offer, type Persona, type Tpl, type Voice, CT, KINDS, MAX, SRC_TYPES, TEXT_MIN, catOf,
  ctaList, isSample, personaLine, pickOffer, pickPersona, structChoices, typeOf, voiceOpts, withMaterial,
} from './content-new'

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
type Row = Record<string, unknown>
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const cut = (v: unknown, n: number) => str(v).replace(/\s+/g, ' ').trim().slice(0, n)

/** A choice on the form, as the agent is offered it: its value, its words, and for a template what it is for. */
export type Opt = { value: string; label: string; note?: string }
/** The request Engine 3 · Auto-fill reads (the dashboard adds who asks). */
export type FillBody = {
  page: 'ct'
  format: string
  content_type: string
  start: 'idea' | 'source'
  brief_run: string
  organic_run: string
  typed: Record<string, string>
  options: { voice: Opt[]; structure: Opt[]; cta: Opt[] }
}
/** What a fill reads besides the form: the company profile, the templates and the briefs in use. */
export type FillCtx = { personas: Persona[]; offers: Offer[]; templates: Tpl[]; voice: Voice | null; org: BriefPick; ads: BriefPick }

/** The team's own material is in (v99HasOwnSource): a few paragraphs that are not the sample. */
export const ownMaterial = (f: Pick<Form, 'text'>) => !isSample(f.text) && f.text.trim().length >= TEXT_MIN

/** What is being made, from a new idea or from material: an answer for another one is not put in (v99AfKey). */
export function fillKey(f: Pick<Form, 'src' | 'kind' | 'cat'>): string {
  const k = f.kind
  return (f.src === 'idea' ? 'idea' : 'source') + ':' + k + ':' + typeOf(k, catOf(k, f.cat[k]))
}

/** The choices the form offers for a kind: the voices, the structures (with what each template is for), the calls to action. */
export function fillOptions(f: Pick<Form, 'kind' | 'cat' | 'off'>, c: Pick<FillCtx, 'offers' | 'templates' | 'voice'>): FillBody['options'] {
  const k = f.kind
  const t = typeOf(k, catOf(k, f.cat[k]))
  const sc = structChoices(k, t, c.templates)
  const desc = (id: string) => str(c.templates.find((x) => x.id === id)?.description).slice(0, 180)
  return {
    voice: voiceOpts(!!c.voice).map((v) => ({ value: v, label: v })),
    structure: [{ value: '', label: sc.first }, ...sc.shapes, ...sc.templates.map((x) => ({ ...x, note: desc(x.value) }))],
    cta: ctaList(t, pickOffer(f.off, c.offers)).map((v) => ({ value: v, label: v })),
  }
}

/**
 * The request (v99AfRequest): what is being made, from an idea or from material, the briefs in use (the newest
 * approved, else the newest), what the team typed (their idea and who it is for, or their own material), and the
 * choices on the form. Paid ads need an advertisement brief, everything else an organic brief.
 */
export function fillRequest(f: Form, c: FillCtx): { ok: true; body: FillBody } | { ok: false; error: string } {
  const k = f.kind
  const ad = k === 'adcopy'
  const t = typeOf(k, catOf(k, f.cat[k]))
  const idea = f.src === 'idea'
  const ab = c.ads.use
  const ob = c.org.use
  if (ad && !ab) return { ok: false, error: 'There is no advertisement brief yet. Run the Ad Strategist first.' }
  if (!ad && !ob) return { ok: false, error: 'There is no organic brief yet. Run the Intel Tracker first.' }
  const p = pickPersona(f.per, c.personas)
  const own = ownMaterial(f)
  const typed: Record<string, string> = idea
    ? { thesis: f.thesis.trim(), audience: p ? personaLine(p) : f.per === 'any' ? 'Everyone who follows us' : '', pain: '' }
    : { title: own ? f.title.trim() : '', take: own ? f.take.trim() : '', text: own ? f.text.trim().slice(0, 4000) : '' }
  return {
    ok: true,
    body: {
      page: 'ct',
      format: ad ? 'ad' : (CT[t]?.base ?? KINDS[k].base),
      content_type: ad ? 'ad' : t,
      start: idea ? 'idea' : 'source',
      brief_run: ab?.runId ?? '',
      organic_run: ob?.runId ?? '',
      typed,
      options: fillOptions(f, c),
    },
  }
}

// ---------- the answer ----------

export type FillRef = { kind: 'request' | 'file' | 'piece'; id: string; title: string }
export type FillWhy = Partial<Record<'thesis' | 'pick' | 'takeaway' | 'voice' | 'cta' | 'structure', string>>
export type FillAnswer = {
  filled: {
    thesis: string
    audience: string
    proof: string
    proofRef: FillRef | null
    /** the piece of the team's own material it picked, when there was none on the form */
    source: FillRef | null
    takeaway: string
    voice: string
    cta: string
    /** null when it picked none; '' is the usual shape */
    structure: string | null
  }
  why: FillWhy
  basedOn: string
  used: { ad: { runId: string; createdAt: string } | null; org: { runId: string; createdAt: string } | null; lead: 'ad' | 'organic' }
  flags: string[]
}

function refOf(v: unknown): FillRef | null {
  const o = v && typeof v === 'object' ? (v as Row) : null
  const kind = str(o?.kind)
  if (!o || (kind !== 'request' && kind !== 'file' && kind !== 'piece') || !UUID.test(str(o.id))) return null
  return { kind, id: str(o.id), title: cut(o.title, 200) }
}
function briefOf(v: unknown): { runId: string; createdAt: string } | null {
  const o = v && typeof v === 'object' ? (v as Row) : null
  return o && str(o.run_id) ? { runId: str(o.run_id), createdAt: str(o.created_at) } : null
}

/** Auto-fill's answer, checked: known fields only, each cut to what the form keeps. */
export function fillAnswerOf(j: unknown): FillAnswer | null {
  const o = j && typeof j === 'object' ? (j as Row) : null
  if (!o || o.ok !== true) return null
  const F = o.filled && typeof o.filled === 'object' ? (o.filled as Row) : {}
  const W = o.why && typeof o.why === 'object' ? (o.why as Row) : {}
  const U = o.used && typeof o.used === 'object' ? (o.used as Row) : {}
  const why: FillWhy = {}
  for (const key of ['thesis', 'pick', 'takeaway', 'voice', 'cta', 'structure'] as const) {
    const t = cut(W[key], 300)
    if (t) why[key] = t
  }
  return {
    filled: {
      thesis: str(F.thesis).trim().slice(0, MAX.thesis),
      audience: cut(F.audience, 160),
      proof: cut(F.proof, 400),
      proofRef: refOf(F.proof_ref),
      source: refOf(F.source),
      takeaway: cut(F.takeaway, MAX.take),
      voice: cut(F.voice, 160),
      cta: cut(F.cta, 300),
      structure: typeof F.structure === 'string' ? F.structure.slice(0, 160) : null,
    },
    why,
    basedOn: cut(o.based_on, 160),
    used: { ad: briefOf(U.ad_brief), org: briefOf(U.organic_brief), lead: str(U.lead) === 'ad' ? 'ad' : 'organic' },
    flags: (Array.isArray(o.flags) ? o.flags : []).map((x) => cut(x, 400)).filter(Boolean).slice(0, 3),
  }
}

/** Where the material it picked came from (v99KindLine). */
export const kindLine = (k: string) => ({ request: 'material you added before', file: 'your knowledge base', piece: 'your library' })[k] ?? 'your material'

/** The fields a reason can sit under. */
export type NoteKey = 'thesis' | 'proof' | 'text' | 'take' | 'voice' | 'struct' | 'cta' | 'per'
export type Applied = {
  form: Form
  /** what was there before, for Undo */
  snap: Partial<Form>
  notes: Partial<Record<NoteKey, string>>
  /** fields left as typed */
  kept: NoteKey[]
}

/**
 * The form with the answer in it (v99AfApply with v105's and v110's wrappers). The idea, the proof and the takeaway go
 * in only where nothing was typed; with no material of the team's own on the form, the piece it picked comes in whole
 * (and the takeaway goes with the old material); the voice, the call to action and the structure are set when the form
 * offers them. A reason goes under each field it filled. With no personas, who it suggests writing for is said.
 */
export function applyFill(f: Form, a: FillAnswer, m: Material | null, c: Pick<FillCtx, 'personas' | 'offers' | 'templates' | 'voice'>): Applied {
  const F = a.filled
  const Y = a.why
  let x: Form = { ...f }
  const snap: Partial<Form> = {}
  const notes: Partial<Record<NoteKey, string>> = {}
  const kept: NoteKey[] = []
  const keep = (...keys: (keyof Form)[]) => {
    for (const key of keys) if (!(key in snap)) (snap as Row)[key] = f[key]
  }
  if (f.src === 'idea') {
    if (F.thesis) {
      if (f.thesis.trim()) kept.push('thesis')
      else {
        keep('thesis')
        x.thesis = F.thesis
        if (Y.thesis) notes.thesis = Y.thesis
      }
    }
    if (F.proof && F.proofRef) {
      if (f.proof.trim()) kept.push('proof')
      else {
        keep('proof')
        x.proof = (F.proof + ' (from ' + kindLine(F.proofRef.kind) + ': “' + clip(F.proofRef.title, 60) + '”)').slice(0, MAX.proof)
      }
    }
  } else {
    if (F.source && m && !ownMaterial(f)) {
      keep('text', 'title', 'titleFrom', 'type', 'url', 'fileName', 'take')
      x = withMaterial({ ...x, take: '' }, { text: m.text, title: m.title, url: m.url, type: SRC_TYPES.some((t) => t[0] === m.type) ? m.type : 'other' })
      notes.text = 'Picked from ' + kindLine(F.source.kind) + ': “' + clip(F.source.title || m.title, 70) + '”.' + (Y.pick ? ' ' + Y.pick : '')
    }
    if (F.takeaway) {
      if (x.take.trim()) kept.push('take')
      else {
        keep('take')
        x.take = F.takeaway
        if (Y.takeaway) notes.take = Y.takeaway
      }
    }
  }
  const k: KindKey = f.kind
  const t = typeOf(k, catOf(k, f.cat[k]))
  if (F.cta && ctaList(t, pickOffer(f.off, c.offers)).includes(F.cta)) {
    keep('cta')
    x.cta = F.cta
    if (Y.cta) notes.cta = Y.cta
  }
  if (F.voice && voiceOpts(!!c.voice).includes(F.voice)) {
    keep('voice')
    x.voice = F.voice
    if (Y.voice) notes.voice = Y.voice
  }
  if (F.structure !== null) {
    const sc = structChoices(k, t, c.templates)
    if (F.structure === '' || [...sc.shapes, ...sc.templates].some((s) => s.value === F.structure)) {
      keep('struct')
      x.struct = F.structure
      if (Y.structure) notes.struct = Y.structure
    }
  }
  if (F.audience && !c.personas.length) notes.per = 'The agent suggests writing for: ' + clip(F.audience, 120) + '. Add them as a persona to use it.'
  return { form: x, snap, notes, kept }
}

/** "the organic brief of 5 Nov", and the advertisement brief first when it leads (v99AfFrom). */
export function fillFrom(used: FillAnswer['used'], day: (iso: string) => string): string {
  const ad = used.ad ? 'the advertisement brief of ' + day(used.ad.createdAt) : ''
  const org = used.org ? 'the organic brief of ' + day(used.org.createdAt) : ''
  return (used.lead === 'ad' ? [ad, org] : [org]).filter(Boolean).join(' and ') || 'the newest brief'
}

/** What a fill does, for the form as it is (v99AfIntro with v105's idea line, without the problem field it had). */
export function fillIntro(f: Pick<Form, 'src' | 'kind' | 'text'>): string {
  const lead = f.kind === 'adcopy' ? 'advertisement brief' : 'organic brief'
  if (f.src === 'idea')
    return (
      'It drafts a key idea from the newest ' +
      lead +
      ', in line with your mission and the persona and offer picked, then fills in the voice, the call to action and the structure. Make the idea yours before you generate.'
    )
  if (ownMaterial(f)) return 'It keeps the source you added and fills in the takeaway, the voice, the call to action and the structure from the newest ' + lead + '.'
  return 'It picks the piece of your own material that best fits what the newest ' + lead + ' found, then fills in the takeaway, the voice, the call to action and the structure.'
}

/** The fill's own words for the ways it can fail before or after it asks (v99Fill). */
export const FILL_MSG = {
  timeout: 'The agent took too long to answer. Try again in a minute.',
  network: 'Could not reach n8n. Check your connection and try again.',
  off: 'Auto-fill is switched off in n8n. Turn on “Engine 3 · Auto-fill” and try again.',
  unauthorized: 'Sign in with an AI Paragon account to use this.',
  failed: 'The agent could not fill it in this time. Try again.',
  changed: 'You changed what you are making while it was reading. Fill it in again.',
  material: 'The piece it picked could not be loaded. Try again, or paste your source.',
} as const
