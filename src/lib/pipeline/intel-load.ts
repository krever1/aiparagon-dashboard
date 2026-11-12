import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { snapItems } from '@/lib/touchpoint/approvals'
import {
  type BriefSets, type CapState, type Competitor, type Five, type Focus, type IntelItem, type Pending, type Schedule, type Terms, type ThemeCount,
  type WhyFull, arr, briefSets, briefThemes, capOf, competitorOf, fiveFor, focusOf, followCounts, itemOf, json, nextRun, num, pendingOf, pickRun,
  ranksOf, runKind, runsOf, scheduleOf, termsOf, themeCounts, themeKey, themeLabel, whoOf, whyFull, whyShort, windowIso,
} from './intel'

// The Intel Tracker's data, read as the signed-in teammate on every visit (nwIntelRuns, nwIntelLoad, v99OrgFor,
// v96FollowLoad and the settings the page reads): the runs, the briefs behind them, the run on screen with its posts
// and replies, who and what it follows, what it tracks, and the custom runs the team started. What each post is in the
// brief for is worked out here, so the page gets lines, not the briefs' markdown.

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
type Row = Record<string, unknown>
const rowsOf = (r: { data: unknown }) => (r.data ?? []) as Row[]

export type PostView = IntelItem & {
  cap: CapState
  /** one line on why it is in the brief or left out ('' while unknown) */
  short: string
  full: WhyFull | null
}

export type ReplyView = {
  id: string
  itemId: string
  competitor: string
  platform: string
  action: string
  sourceUrl: string
  draft: string
  status: string
  createdAt: string
}

/**
 * A run's posts as the pages show them: who wrote each (its author, else the account it follows, else the name the
 * brief gives its link), and why it is in the brief or left out. `brief` is the run's organic brief, null when it has
 * none, undefined when the briefs could not be read.
 */
export function postsOf(itemRows: Row[], compName: Record<string, string>, brief: Row | null | undefined): PostView[] {
  const d0 = brief ? json(brief.data) : {}
  const briefName: Record<string, string> = {}
  for (const x of [...arr(d0.items), ...arr(d0.high_value_items)].map(json)) if (x.url && x.competitor && !briefName[str(x.url)]) briefName[str(x.url)] = str(x.competitor)
  const items = itemRows.map((r) => itemOf(r, whoOf(r, compName[str(r.competitor_id)] ?? '', briefName[str(r.url)] ?? '')))
  const B: BriefSets | null | undefined =
    brief === undefined ? undefined : brief ? briefSets(brief as { run_id: unknown; created_at: unknown; data: unknown; content_md: unknown }) : null
  const ranks = ranksOf(items)
  return items.map((i) => {
    const cap = capOf(i, B)
    return { ...i, cap, short: whyShort(i, cap, B, ranks[i.id]), full: cap === 'wait' ? null : whyFull(i, cap, B, ranks[i.id]) }
  })
}

/** The tracker's drafted replies as the pages show them. */
export function repliesOf(rows: Row[]): ReplyView[] {
  return rows.map((d) => ({
    id: str(d.id),
    itemId: str(d.intel_item_id),
    competitor: str(d.competitor_name || d.competitor),
    platform: str(d.platform),
    action: str(d.action),
    sourceUrl: str(d.source_url),
    draft: str(d.draft),
    status: str(d.status) || 'pending',
    createdAt: str(d.created_at),
  }))
}

export type RunCard = {
  runId: string
  at: string
  ok: boolean
  kind: string
  window: { a: string; z: string | null } | null
  read: number | null
  hv: number | null
  rp: number | null
  themes: string[]
  lead: string
  hasBrief: boolean
}

export type IntelData = {
  /** the run on screen ('' when there is none) */
  run: string
  /** the run a bare address opens: the address names a run only when it is another one */
  latest: string
  runs: { runId: string; at: string; ok: boolean }[]
  library: RunCard[]
  /** themes across the briefed runs: share of each brief's posts */
  across: { runs: { runId: string; at: string }[]; rows: { k: string; l: string; cells: (number | null)[] }[] } | null
  posts: PostView[]
  replies: ReplyView[]
  five: Five[]
  brief: {
    runId: string
    createdAt: string
    window: { a: string; z: string | null } | null
    topThemes: ThemeCount[]
    shifts: { note: string; competitor: string; url: string }[]
  } | null
  /** the run's brief could be read (so In the brief and Not used are known) */
  capKnown: boolean
  stats: { read: number; high: number; reps: number; themes: number; inb: number | null }
  schedule: Schedule & { saved: boolean }
  /** when the schedule fires next, in ms */
  next: number | null
  pending: Pending[]
  /** who and what it follows; counts null when the follow list could not be read */
  follow: { rows: Competitor[]; terms: Terms; industries: Record<string, string>; counts: ReturnType<typeof followCounts> | null; error: string | null }
  focus: Focus
  profile: { id: string | null; industry: string; targetMarket: string }
  error: string | null
  itemsError: string | null
}

/** One brief for each run, the newest. */
function newestPerRun(rows: Row[]): Row[] {
  const seen = new Set<string>()
  return rows.filter((o) => {
    const r = str(o.run_id)
    if (!r || seen.has(r)) return false
    seen.add(r)
    return true
  })
}

export async function loadIntel(asked: string | null, now = Date.now()): Promise<IntelData> {
  const supabase = await createClient()
  const [rn, br, co, st, pr] = await Promise.all([
    supabase.from('runs').select('run_id,status,started_at,finished_at,run_date,stats').eq('agent', 'intel_tracker').order('started_at', { ascending: false, nullsFirst: false }).limit(40),
    supabase
      .from('agent_outputs')
      .select('run_id,created_at,data,content_md')
      .eq('agent', 'intel_tracker')
      .eq('output_type', 'intel_brief')
      .order('created_at', { ascending: false })
      .limit(14),
    supabase
      .from('competitors')
      .select('id,name,handle_linkedin,handle_x,meta_page_id,website,status,follow_kind,follow_for,added_by,created_at,notes')
      .order('created_at', { ascending: true })
      .limit(500),
    supabase.from('ai_settings').select('key,value').in('key', ['agent_runs', 'intel_focus', 'intel_follow', 'intel_keywords', 'ad_industries', 'intel_runs']),
    supabase.from('company_profile').select('id,industry,target_market').limit(1),
  ])
  const errors = [rn.error, br.error].filter(Boolean).map((e) => e!.message)
  const setting = (k: string) => (st.data ?? []).find((r: { key: string }) => r.key === k)?.value

  let briefs = newestPerRun(rowsOf(br))
  const runs = runsOf(rowsOf(rn), briefs.map((b) => ({ run_id: str(b.run_id), created_at: str(b.created_at) })))
  const latest = pickRun(runs, briefs.map((b) => ({ run_id: str(b.run_id) })), null)
  const run = pickRun(runs, briefs.map((b) => ({ run_id: str(b.run_id) })), asked)

  // the run on screen: its posts, its replies, and its brief when it is older than the ones read
  const [it, dr, ob] = await Promise.all([
    run
      ? supabase.from('intel_items').select('*').eq('run_id', run).order('engagement_score', { ascending: false, nullsFirst: false }).limit(400)
      : Promise.resolve({ data: [] as Row[], error: null }),
    run
      ? supabase.from('engagement_drafts').select('*').eq('run_id', run).order('created_at', { ascending: false }).limit(300)
      : Promise.resolve({ data: [] as Row[], error: null }),
    run && !briefs.some((b) => b.run_id === run)
      ? supabase
          .from('agent_outputs')
          .select('run_id,created_at,data,content_md')
          .eq('agent', 'intel_tracker')
          .eq('output_type', 'intel_brief')
          .eq('run_id', run)
          .order('created_at', { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [] as Row[], error: null }),
  ])
  briefs = [...briefs, ...rowsOf(ob)]
  const briefOf = (r: string) => briefs.find((b) => b.run_id === r) ?? null

  // the briefs' snapshots ("five things, one minute"), the newest that reads
  const briefRuns = briefs.map((b) => str(b.run_id))
  const sn = briefRuns.length
    ? await supabase.from('agent_outputs').select('run_id,snapshot').not('snapshot', 'is', null).in('run_id', briefRuns).order('created_at', { ascending: false }).limit(60)
    : { data: [] as Row[], error: null }
  const snaps: Record<string, unknown> = {}
  for (const r of rowsOf(sn)) if (!(str(r.run_id) in snaps) && snapItems(r.snapshot)) snaps[str(r.run_id)] = r.snapshot

  // who wrote each post, and which brief it went into: none when the run has no brief; unknown when the briefs could
  // not be read
  const follow = rowsOf(co).map(competitorOf)
  const compName: Record<string, string> = {}
  for (const c of follow) compName[c.id] = c.name
  const B0 = briefOf(run)
  const d0 = B0 ? json(B0.data) : {}
  const posts = postsOf(rowsOf(it), compName, br.error ? undefined : B0)
  const items: IntelItem[] = posts
  const replies = repliesOf(rowsOf(dr))

  const five = fiveFor(snaps[run], str(B0?.content_md), items)

  // the header's numbers (nwIntelStats)
  const r0 = runs.find((r) => r.runId === run)
  const rs = r0?.stats ?? {}
  const known = !br.error
  const stats = {
    read: items.length || num(rs.items) || num(d0.n_items) || 0,
    high: items.length ? items.filter((i) => i.val === 'high').length : num(rs.high_value) || num(d0.n_high_value) || 0,
    reps: replies.length || num(rs.drafts) || num(d0.n_engagement_drafts) || 0,
    themes: (items.length ? themeCounts(items) : briefThemes(d0.top_themes)).filter((t) => t.n >= 3).length,
    inb: known ? posts.filter((p) => p.cap === 'in' || p.cap === 'run').length : null,
  }

  const win = (d: Record<string, unknown>) => {
    const a = windowIso(d.window_start)
    return a ? { a, z: windowIso(d.window_end) } : null
  }

  // the run library: the 12 newest runs
  const library: RunCard[] = runs.slice(0, 12).map((r) => {
    const b = briefOf(r.runId)
    const d = b ? json(b.data) : {}
    const f = b ? fiveFor(snaps[r.runId], str(b.content_md), []) : []
    return {
      runId: r.runId,
      at: r.at,
      ok: r.ok,
      kind: runKind(d),
      window: win(d),
      read: num(r.stats.items) ?? (r.runId === run && items.length ? items.length : null),
      hv: num(r.stats.high_value) ?? num(d.n_high_value),
      rp: num(r.stats.drafts) ?? num(d.n_engagement_drafts),
      themes: arr(d.top_themes)
        .map(json)
        .slice(0, 3)
        .map((t) => themeLabel(t.theme) + ' · ' + str(t.count)),
      lead: f[0]?.text ?? '',
      hasBrief: !!b,
    }
  })

  // themes across runs: the share of each brief's posts, for the six newest briefed runs of those 12
  const briefed = runs
    .slice(0, 12)
    .filter((r) => briefOf(r.runId))
    .slice(0, 6)
  const cells: Record<string, Record<string, number | null>> = {}
  const labels: Record<string, string> = {}
  for (const r of briefed) {
    const d = json(briefOf(r.runId)!.data)
    const n = num(d.n_items) ?? 0
    for (const t of arr(d.top_themes).map(json)) {
      const k = themeKey(t.theme)
      labels[k] = themeLabel(t.theme)
      cells[k] = { ...cells[k], [r.runId]: n ? Math.round(100 * Math.min(1, (num(t.count) ?? 0) / n)) : null }
    }
  }
  const keys = Object.keys(cells)
    .sort((a, b) => Object.keys(cells[b]).length - Object.keys(cells[a]).length || a.localeCompare(b))
    .slice(0, 10)
  const across =
    briefed.length > 1 && keys.length
      ? {
          runs: briefed.map((r) => ({ runId: r.runId, at: r.at })),
          rows: keys.map((k) => ({ k, l: labels[k], cells: briefed.map((r) => (r.runId in cells[k] ? cells[k][r.runId] : null)) })),
        }
      : null

  const schedule = scheduleOf(setting('agent_runs'))
  const terms = termsOf(setting('intel_follow'), setting('intel_keywords'))
  const industries: Record<string, string> = {}
  for (const [k, v] of Object.entries(json(setting('ad_industries')))) if (str(v).trim()) industries[k.trim().toLowerCase()] = str(v).trim()
  const p0 = (pr.data ?? [])[0] as Row | undefined

  return {
    run,
    latest,
    runs: runs.map((r) => ({ runId: r.runId, at: r.at, ok: r.ok })),
    library,
    across,
    posts,
    replies,
    five,
    brief: B0
      ? {
          runId: str(B0.run_id),
          createdAt: str(B0.created_at),
          window: win(d0),
          topThemes: briefThemes(d0.top_themes),
          shifts: arr(d0.sophistication_shifts)
            .map(json)
            .filter((s) => s.note)
            .slice(0, 4)
            .map((s) => ({ note: str(s.note), competitor: str(s.competitor), url: str(s.url) })),
        }
      : null,
    capKnown: known,
    stats,
    schedule,
    next: nextRun(schedule, now),
    pending: pendingOf(setting('intel_runs'), now).filter((p) => !runs.some((r) => r.runId === p.runId)),
    follow: { rows: follow, terms, industries, counts: co.error ? null : followCounts(follow, terms), error: co.error?.message ?? null },
    focus: focusOf(setting('intel_focus')),
    profile: { id: p0 ? str(p0.id) : null, industry: str(p0?.industry), targetMarket: str(p0?.target_market) },
    error: errors.length ? errors[0] : null,
    itemsError: it.error?.message ?? null,
  }
}
