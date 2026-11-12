import 'server-only'
import { type SnapItem, snapItems } from '@/lib/touchpoint/approvals'
import { type AdsBriefRow, reviewOf as briefReview } from './briefs'
import { type AdIn, type AdsIn, type Finding, type OrgIn, AD_FMT, adInOf, adPool, orgPool } from './briefs-found'
import { createClient } from '@/lib/supabase/server'
import {
  type Draft, type Note, type Piece, type Req, type Review, briefIdeas, draftOf, draftOrigin, kindOf, noteOf, pieceOf, reqOf, reviewOf,
} from './content'
import { layoutOf } from './briefs'
import {
  type Ask, type BriefPick, type Offer, type Persona, type ProofItem, type Tpl, type Voice, ASK_DAYS, leaveOutOf, offerOf, personaOf, pickBrief, proofOf, tplOf,
} from './content-new'

// The Content Transformation page's data, read as the signed-in teammate on every visit (apCfLoad, e9IdeasLoad,
// nwPiecesLoad and apCpLoad in the current dashboard): the 60 newest requests and drafts (the page lists those made from
// the team's own material; the ones made from the briefs are Marketing Generation's), the drafts' reviews, the library
// (content_pieces not archived), the team's ideas (idea_notes), the newest organic brief's five things, and the days of
// the briefs the drafts were packaged with.

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
type Row = Record<string, unknown>
const rowsOf = (r: { data: unknown }): Row[] => (Array.isArray(r.data) ? (r.data as Row[]) : [])
/** A setting's value as an object: kept as jsonb, or as JSON text. */
function jsonOf(v: unknown): Record<string, unknown> {
  let o = v
  if (typeof o === 'string') {
    try {
      o = JSON.parse(o)
    } catch {
      o = null
    }
  }
  return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : {}
}

export type ContentData = {
  /** the 60 newest requests, newest first */
  reqs: Req[]
  /** the drafts made from the team's own material, newest first */
  drafts: Draft[]
  /** the newest drafts made from the briefs: Marketing Generation's, so a link to one here says where it is */
  briefIds: string[]
  revs: Review[]
  pieces: Piece[]
  notes: Note[]
  brief: { runId: string; createdAt: string; items: SnapItem[] } | null
  /** when each brief a draft was packaged with was written, by its run */
  briefDays: { org: Record<string, string>; ads: Record<string, string> }
  errors: { drafts: string | null; ideas: string | null; pieces: string | null; brief: string | null }
  /** what the New draft form reads */
  form: FormData
  now: number
}

/**
 * What the New draft form reads (v104Load, apVoiceLoad, apTplLoad and apCfLoad's briefs in the current dashboard; never
 * v104SyncDerived, which rewrote house rules as it read): the personas, offers and proof, the newest voice, the team's
 * templates, the parts of the organic brief the team's layout leaves out, what was asked to change on drafts in the last
 * 120 days (with each draft's kind), and the briefs a draft can lead with and the decisions on them. A send reads the
 * same, less the proof and the briefs.
 */
export type FormData = {
  personas: Persona[]
  offers: Offer[]
  proof: ProofItem[]
  voice: Voice | null
  templates: Tpl[]
  leaveOut: string[]
  asks: Ask[]
  org: BriefPick
  ads: BriefPick
  /** the five things of the organic brief a draft leads with */
  orgItems: SnapItem[]
  /** the team's default plans, by plan key (ai_settings build_plans) */
  plans: Record<string, unknown>
  /** what the newest briefs found (step 2): the organic findings, and the ads briefs' with the ads of each type */
  found: { org: Finding[]; ads: Finding[]; nOrg: number; error: string | null }
  error: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Supa = Awaited<ReturnType<typeof createClient>>

export async function loadForm(supabase: Supa, now: number, opts: { send?: boolean } = {}): Promise<FormData> {
  const send = !!opts.send
  const none = Promise.resolve({ data: [] as Row[], error: null })
  const since = new Date(now - ASK_DAYS * 864e5).toISOString()
  const [pe, of, pr, vo, tp, st, ak, ib, cb] = await Promise.all([
    supabase.from('client_personas').select('id,name,role,firm,size,pain,is_default,archived').order('created_at', { ascending: true }).limit(100),
    supabase.from('offers').select('id,name,price,price_label,timeline,action,whats_included,is_default,archived').order('created_at', { ascending: false }).limit(100),
    send ? none : supabase.from('client_proof').select('name,status,source,expires_on,archived').order('created_at', { ascending: true }).limit(200),
    supabase.from('brand_voice').select('created_at,tone').order('created_at', { ascending: false }).limit(1),
    supabase.from('doc_templates').select('id,name,format,description,sections,rules,example_text,active,uses').order('created_at', { ascending: true }).limit(200),
    supabase.from('ai_settings').select('key,value').in('key', ['brief_structure', 'build_plans']),
    supabase
      .from('agent_feedback')
      .select('target_id,feedback,created_at')
      .eq('target_type', 'draft_review')
      .eq('action', 'changes')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(300),
    send ? none : supabase.from('agent_outputs').select('run_id,created_at').eq('agent', 'intel_tracker').eq('output_type', 'intel_brief').order('created_at', { ascending: false }).limit(10),
    send ? none : supabase.from('creative_briefs').select('run_id,created_at').order('created_at', { ascending: false }).limit(12),
  ])
  // one row per run, newest first
  const perRun = (r: { data: unknown }) => {
    const seen = new Set<string>()
    return rowsOf(r).filter((x) => {
      const k = str(x.run_id)
      if (!k || seen.has(k)) return false
      seen.add(k)
      return true
    })
  }
  const orgRows = perRun(ib)
  const adRows = perRun(cb)
  const runs = [...orgRows, ...adRows].map((r) => str(r.run_id))
  const targets = [...new Set(rowsOf(ak).map((r) => str(r.target_id)))].filter((x) => UUID.test(x))
  const [dk, dec] = await Promise.all([
    targets.length ? supabase.from('agent_outputs').select('id,data').in('id', targets).limit(300) : none,
    runs.length
      ? supabase.from('agent_feedback').select('target_id,action,created_at').eq('target_type', 'brief_approval').in('target_id', runs).order('created_at', { ascending: false }).limit(300)
      : none,
  ])
  // each draft's kind, as the asks on it are sorted (its own kind first)
  const kinds: Record<string, string> = {}
  for (const r of rowsOf(dk)) kinds[str(r.id)] = kindOf(draftOf(r))
  const decided: Record<string, string> = {}
  for (const r of rowsOf(dec)) if (!(str(r.target_id) in decided)) decided[str(r.target_id)] = str(r.action)
  const brief = (rows: Row[]) => pickBrief(rows.map((r) => ({ runId: str(r.run_id), createdAt: str(r.created_at), decision: decided[str(r.run_id)] ?? '' })))
  const org = brief(orgRows)
  const ads = brief(adRows)

  // the five things of the organic brief a draft leads with, from its snapshot, else its TL;DR
  let orgItems: SnapItem[] = []
  if (!send && org.use) {
    const [md, sn] = await Promise.all([
      supabase.from('agent_outputs').select('content_md').eq('agent', 'intel_tracker').eq('output_type', 'intel_brief').eq('run_id', org.use.runId).order('created_at', { ascending: false }).limit(1),
      supabase.from('agent_outputs').select('snapshot').eq('run_id', org.use.runId).not('snapshot', 'is', null).order('created_at', { ascending: false }).limit(5),
    ])
    const snap = rowsOf(sn).map((r) => r.snapshot)
    orgItems = briefIdeas(str(rowsOf(md)[0]?.content_md), snap.find((s) => briefIdeas('', s).length) ?? null)
  }
  const st0 = rowsOf(st).find((r) => r.key === 'brief_structure')?.value
  const found = send ? { org: [], ads: [], nOrg: 0, error: null } : await loadFound(supabase, orgRows, adRows, decided, st0)
  const live = (r: Row) => r.archived !== true && r.archived !== 'true'
  const v = rowsOf(vo)[0]
  const msg = (...es: ({ message: string } | null)[]) => es.filter(Boolean).map((e) => e!.message)[0] ?? null
  return {
    personas: rowsOf(pe).filter(live).map(personaOf),
    offers: rowsOf(of).filter(live).map(offerOf),
    proof: rowsOf(pr).filter(live).map(proofOf),
    voice: v ? { createdAt: str(v.created_at), tone: Array.isArray(v.tone) ? (v.tone as unknown[]).map(str).filter(Boolean) : [] } : null,
    templates: rowsOf(tp)
      .filter((r) => r.active !== false && r.active !== 'false')
      .map(tplOf),
    leaveOut: leaveOutOf(st0),
    plans: jsonOf(rowsOf(st).find((r) => r.key === 'build_plans')?.value),
    asks: rowsOf(ak)
      .map((r) => ({ feedback: str(r.feedback), createdAt: str(r.created_at), kind: kinds[str(r.target_id)] ?? '' }))
      .filter((a) => a.feedback.trim()),
    org,
    ads,
    orgItems,
    found,
    error: msg(pe.error, of.error, tp.error, vo.error, ak.error, st.error, dec.error),
  }
}

/**
 * What the briefs found (v111's pools): the six newest organic briefs (their markdown, data and snapshot), the three
 * newest ads briefs (their parts, snapshot and the sections their review hid), and the best ads of each type the Ad
 * Strategist read (by score, then the longest running; the old page took them from the 1,000 newest).
 */
async function loadFound(supabase: Supa, orgRows: Row[], adRows: Row[], decided: Record<string, string>, structure: unknown): Promise<FormData['found']> {
  const none = Promise.resolve({ data: [] as Row[], error: null })
  const oRuns = orgRows.slice(0, 6).map((r) => str(r.run_id))
  const aRuns = adRows.slice(0, 3).map((r) => str(r.run_id))
  const runs = [...oRuns, ...aRuns]
  const fmts = Object.values(AD_FMT)
  const [ob, ab, sn, rv, ...ads] = await Promise.all([
    oRuns.length
      ? supabase.from('agent_outputs').select('run_id,created_at,content_md,data').eq('agent', 'intel_tracker').eq('output_type', 'intel_brief').in('run_id', oRuns).order('created_at', { ascending: false }).limit(30)
      : none,
    aRuns.length
      ? supabase
          .from('creative_briefs')
          .select('run_id,created_at,winning_hooks,winning_offers,core_pain_points,objection_themes,differentiation_angle')
          .in('run_id', aRuns)
          .order('created_at', { ascending: false })
          .limit(15)
      : none,
    runs.length ? supabase.from('agent_outputs').select('run_id,snapshot').not('snapshot', 'is', null).in('run_id', runs).order('created_at', { ascending: false }).limit(60) : none,
    aRuns.length ? supabase.from('agent_outputs').select('run_id,data').eq('agent', 'ad_strategist').in('run_id', aRuns).order('created_at', { ascending: false }).limit(30) : none,
    ...fmts.map((f) =>
      supabase
        .from('winner_creatives')
        .select('id,run_id,advertiser_name,hook,body,cta,format,performance_score,days_running')
        .in('format', [...f])
        .order('performance_score', { ascending: false, nullsFirst: false })
        .order('days_running', { ascending: false, nullsFirst: false })
        .limit(16),
    ),
  ])
  const first = (r: { data: unknown }) => {
    const o: Record<string, Row> = {}
    for (const x of rowsOf(r)) if (!(str(x.run_id) in o)) o[str(x.run_id)] = x
    return o
  }
  const snaps: Record<string, unknown> = {}
  for (const r of rowsOf(sn)) if (!(str(r.run_id) in snaps) && snapItems(r.snapshot)) snaps[str(r.run_id)] = r.snapshot
  const hidden: Record<string, string[]> = {}
  for (const r of rowsOf(rv)) {
    const k = str(r.run_id)
    if (k in hidden) continue
    const rev = briefReview(jsonOf(r.data))
    if (rev) hidden[k] = rev.hidden
  }
  const O = first(ob)
  const org: OrgIn[] = oRuns
    .filter((r) => O[r])
    .map((r) => ({ run: r, date: str(O[r].created_at), ok: decided[r] === 'approved', md: str(O[r].content_md), data: jsonOf(O[r].data), snapshot: snaps[r] ?? null }))
  const A = first(ab)
  const briefs: AdsIn[] = aRuns
    .filter((r) => A[r])
    .map((r) => ({ row: A[r] as unknown as AdsBriefRow, ok: decided[r] === 'approved', snapshot: snaps[r] ?? null, hidden: hidden[r] ?? [] }))
  const adList: AdIn[] = ads.flatMap((x) => rowsOf(x).map(adInOf)).filter((a): a is AdIn => !!a)
  const L = (k: 'org' | 'ads') => layoutOf(structure, k).off
  const msg = [ob, ab, sn, rv, ...ads].map((x) => x.error?.message).find(Boolean) ?? null
  return { org: orgPool(org, L('org')), ads: adPool(briefs, adList, L('ads')), nOrg: org.length, error: msg }
}

export async function loadContent(now = Date.now()): Promise<ContentData> {
  const supabase = await createClient()
  const formP = loadForm(supabase, now).catch((e: unknown): FormData => ({
    personas: [],
    offers: [],
    proof: [],
    voice: null,
    templates: [],
    leaveOut: [],
    asks: [],
    org: { use: null, newest: null },
    ads: { use: null, newest: null },
    orgItems: [],
    plans: {},
    found: { org: [], ads: [], nOrg: 0, error: null },
    error: e instanceof Error ? e.message : String(e),
  }))
  const [rq, df, pc, nt, ib] = await Promise.all([
    supabase
      .from('content_requests')
      .select('id,created_at,updated_at,requested_by,start_mode,format,content_type,title,source_type,status,error,output_id')
      .order('created_at', { ascending: false })
      .limit(60),
    supabase
      .from('agent_outputs')
      .select('id,run_id,title,created_at,data')
      .eq('agent', 'content_generation')
      .eq('output_type', 'content_draft')
      .order('created_at', { ascending: false })
      .limit(60),
    supabase.from('content_pieces').select('*').neq('status', 'archived').order('updated_at', { ascending: false }).limit(200),
    supabase.from('idea_notes').select('*').order('created_at', { ascending: false }).limit(200),
    supabase
      .from('agent_outputs')
      .select('run_id,created_at,content_md')
      .eq('agent', 'intel_tracker')
      .eq('output_type', 'intel_brief')
      .order('created_at', { ascending: false })
      .limit(1),
  ])
  const reqs = rowsOf(rq).map(reqOf)
  const all = rowsOf(df).map(draftOf)
  const drafts = all.filter((d) => draftOrigin(d, reqs) === 'mine')
  const i0 = rowsOf(ib)[0]

  // what the first reads point to: the drafts' reviews, the newest organic brief's snapshot, and the briefs the drafts
  // were packaged with
  const none = Promise.resolve({ data: [] as Row[], error: null })
  const ids = all.map((d) => d.id)
  const orgRuns = [...new Set(drafts.map((d) => d.brief.intelRun).filter(Boolean))]
  const adRuns = [...new Set(drafts.map((d) => d.brief.adRun).filter(Boolean))]
  const [rv, sn, ob, ab] = await Promise.all([
    ids.length
      ? supabase
          .from('agent_feedback')
          .select('id,target_id,action,feedback,author,created_at')
          .eq('target_type', 'draft_review')
          .in('target_id', ids)
          .order('created_at', { ascending: false })
          .limit(500)
      : none,
    i0
      ? supabase.from('agent_outputs').select('snapshot').eq('run_id', str(i0.run_id)).not('snapshot', 'is', null).order('created_at', { ascending: false }).limit(5)
      : none,
    orgRuns.length ? supabase.from('agent_outputs').select('run_id,created_at').eq('agent', 'intel_tracker').eq('output_type', 'intel_brief').in('run_id', orgRuns).limit(100) : none,
    adRuns.length ? supabase.from('creative_briefs').select('run_id,created_at').in('run_id', adRuns).limit(100) : none,
  ])
  const days = (r: { data: unknown }) => {
    const o: Record<string, string> = {}
    for (const x of rowsOf(r)) if (!(str(x.run_id) in o)) o[str(x.run_id)] = str(x.created_at)
    return o
  }
  // the newest snapshot that reads, as e9SnapLoad keeps it
  const snap = rowsOf(sn).map((r) => r.snapshot)
  const items = i0 ? briefIdeas(str(i0.content_md), snap.find((s) => briefIdeas('', s).length) ?? null) : []

  const msg = (...es: ({ message: string } | null)[]) => es.filter(Boolean).map((e) => e!.message)[0] ?? null
  return {
    reqs,
    drafts,
    briefIds: all.filter((d) => !drafts.includes(d)).map((d) => d.id),
    revs: rowsOf(rv).map(reviewOf),
    pieces: rowsOf(pc).map(pieceOf),
    notes: rowsOf(nt).map(noteOf),
    brief: i0 ? { runId: str(i0.run_id), createdAt: str(i0.created_at), items } : null,
    briefDays: { org: days(ob), ads: days(ab) },
    form: await formP,
    errors: {
      drafts: msg(df.error, rq.error, rv.error),
      ideas: msg(nt.error),
      pieces: msg(pc.error),
      brief: msg(ib.error),
    },
    now,
  }
}
