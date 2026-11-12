// The ads the Ad Strategist keeps, as the briefs page reads them (nwAdItem, apAdTitle, apAdSources, v99MetaText,
// v96Rank's ad mode, e9HookSrc). Plain functions over rows already read, so the Ad Strategist can share them when it
// moves here.

import { arr, json, num, tokens } from './intel'

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

/** A catalog ad's template tokens, such as {{product.name}} (AP_TPL_RE). */
const TPL = /\{\{\s*[\w.]+\s*\}\}/

/** A catalog ad whose copy is only template tokens (apAdIsDynamic). */
export const isDynamic = (a: { hook?: unknown; body?: unknown }) => TPL.test(str(a.hook)) || TPL.test(str(a.body))

/** An ad's title: a catalog ad by its advertiser, else its hook, else its body (apAdTitle). */
export function adTitle(a: { hook?: unknown; body?: unknown; advertiser_name?: unknown }): string {
  if (isDynamic(a)) return 'Dynamic catalog ad · ' + (str(a.advertiser_name).trim() || 'Unknown')
  return (str(a.hook) || str(a.body) || 'Untitled ad').trim()
}

/** A field with template tokens or a placeholder left out (apAdClean). */
export function adClean(v: unknown): string {
  const s = str(v).trim()
  if (!s || TPL.test(s) || /^placeholder\s*->\s*placeholder$/i.test(s)) return ''
  return s
}

/** Days since the ad was last seen, or its own stale count (adStale). */
export function adStale(a: { stale_days?: unknown; last_seen?: unknown }, now: number): number | null {
  if (a.stale_days !== null && a.stale_days !== undefined && a.stale_days !== '') return Number(a.stale_days)
  if (!a.last_seen) return null
  const d = Math.round((now - Date.parse(str(a.last_seen))) / 864e5)
  return Number.isNaN(d) ? null : Math.max(0, d)
}

/** Still running: active, or seen within the last week (adActive). */
export function adActive(a: { is_active?: unknown; stale_days?: unknown; last_seen?: unknown }, now: number): boolean {
  if (a.is_active === true) return true
  const st = adStale(a, now)
  return st !== null && st <= 7
}

/** An ad as the briefs page shows it (nwAdItem): who ran it, whether the team uploaded it, how long it ran. */
export type Ad = {
  id: string
  url: string
  adv: string
  hook: string
  body: string
  cta: string
  offer: string
  copyFormula: string
  patterns: string[]
  /** uploaded by the team, or from the swipe file: hand-picked */
  up: boolean
  sw: boolean
  /** pulled from the Ad Library */
  lib: boolean
  days: number | null
  act: boolean
  score: number | null
  title: string
}

export function adOf(a: Record<string, unknown>, now: number): Ad {
  const up = !!a.uploaded_by
  const sw = str(a.source) === 'swipe_file'
  const ps = num(a.performance_score)
  return {
    id: str(a.id),
    url: str(a.ad_library_url),
    adv: str(a.advertiser_name).trim() || 'Unknown advertiser',
    hook: str(a.hook),
    body: str(a.body),
    cta: str(a.cta),
    offer: str(a.offer_inferred),
    copyFormula: str(a.copy_formula),
    patterns: arr(a.extracted_patterns).map(str),
    up,
    sw,
    lib: !up && !sw,
    days: num(a.days_running),
    act: adActive(a, now),
    score: ps !== null ? Math.round(ps * 100) : null,
    title: adTitle(a),
  }
}

/** A list of ids kept as an array, JSON text or a Postgres array literal (v99Ids). */
export function idsOf(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(str)
  const s = str(v).trim()
  if (!s) return []
  if (s[0] === '[') {
    try {
      const a = JSON.parse(s)
      return Array.isArray(a) ? a.map(str) : []
    } catch {
      return []
    }
  }
  if (s[0] === '{')
    return s
      .slice(1, -1)
      .split(',')
      .map((x) => x.replace(/^"|"$/g, '').trim())
      .filter(Boolean)
  return []
}

/** How an ad in the brief's list was doing, in words (v99MetaText). */
export function metaText(m: unknown, short: boolean): string {
  const out: string[] = []
  for (const t0 of str(m).split(/\s*·\s*/)) {
    const t = t0.trim()
    if (!t) continue
    if (/^proven$/i.test(t)) out.push('proven')
    else if (/^emerging$/i.test(t)) out.push('emerging')
    else if (/^active/i.test(t)) out.push('still running')
    else if (/^(ended|stopped|inactive|paused)/i.test(t)) out.push('stopped running')
    else if (/^8wk_plus$/i.test(t)) out.push('ran 8+ weeks')
    else if (/^6wk_plus$/i.test(t)) out.push('ran 6+ weeks')
    else if (/^under_6wk$/i.test(t)) out.push('under 6 weeks')
    else if (/uploaded|swipe/i.test(t)) {
      // said once, however many of its tags say it (the old page could repeat it)
      if (!out.includes('uploaded by your team')) out.push('uploaded by your team')
    } else {
      const d = /^(\d+)\s*d\b/i.exec(t)
      if (d) {
        if (!short) out.push(d[1] + ' days')
        continue
      }
      const s = /^score\s+([\d.]+)/i.exec(t)
      if (s && !short) out.push('score ' + Number(s[1]).toFixed(2))
    }
  }
  return out.join(', ') || 'listed in the brief'
}

/** An ad the brief's markdown lists under "## 8.", with its record when one has the same link. */
export type Source = { advertiser: string; meta: string; hook: string; url: string; days: number | null; active: boolean | null; recordId: string }

type RecordRow = Record<string, unknown>

/**
 * The ads behind a brief as its markdown lists them (apAdSources): "1. **Advertiser** - meta", a quoted hook, a link;
 * without that list, the run's own ads by score, at most 12.
 */
export function adSources(md: string, records: RecordRow[], runId: string): Source[] {
  const byUrl: Record<string, RecordRow> = {}
  for (const a of records) if (a.ad_library_url) byUrl[str(a.ad_library_url)] = a
  const out: Source[] = []
  const i = md.search(/##\s*8\./)
  if (i >= 0) {
    let cur: Source | null = null
    for (const ln of md.slice(i).split('\n').slice(1)) {
      if (/^##\s|^---/.test(ln)) break
      const m = /^\s*\d+\.\s+\*\*(.+?)\*\*\s*[‒-―-]\s*(.*)$/.exec(ln)
      if (m) {
        cur = { advertiser: m[1], meta: m[2], hook: '', url: '', days: null, active: null, recordId: '' }
        out.push(cur)
        continue
      }
      if (!cur) continue
      const q = /^\s*"(.*)"\s*$/.exec(ln)
      if (q) {
        cur.hook = q[1]
        continue
      }
      const u = /^\s*(https?:\/\/\S+)/.exec(ln)
      if (u) cur.url = u[1]
    }
    for (const s of out) {
      const a = byUrl[s.url]
      if (!a) continue
      s.recordId = str(a.id)
      s.days = num(a.days_running)
      s.active = a.is_active === true
      if (!s.hook) s.hook = str(a.hook)
    }
  }
  if (!out.length) {
    records
      .filter((a) => str(a.run_id) === runId)
      .sort((a, b) => (Number(b.performance_score) || 0) - (Number(a.performance_score) || 0))
      .slice(0, 12)
      .forEach((a) =>
        out.push({
          advertiser: str(a.advertiser_name) || 'Unknown',
          hook: str(a.hook),
          url: a.ad_library_url && !/^swipe:/.test(str(a.ad_library_url)) ? str(a.ad_library_url) : str(a.destination_url),
          days: num(a.days_running),
          active: a.is_active === true,
          meta: a.uploaded_by ? 'uploaded by your team' : '',
          recordId: str(a.id),
        }),
      )
  }
  return out
}

/** An ad as the matching reads it: its words, its link and its id. */
export type Cand = { url: string; who: string; hook: string; offer: string; days: number | null; text: string; id: string }

export const candOf = (a: Ad): Cand => ({
  url: a.url,
  who: a.adv,
  hook: a.hook,
  offer: a.offer,
  days: a.days,
  text: [a.hook, a.body, a.offer, a.copyFormula, a.patterns.join(' ')].join(' '),
  id: a.id,
})

/**
 * The ads closest to a point (v96Rank's ad mode): shared words (6 at most), 6 more for an ad the brief's snapshot names
 * for that hook, 1 more for an offer point that shares a word with the ad's offer; 2 or more to count, the six best.
 */
export function rankAds(it: { text: string; why?: string; tag?: string }, rows: Cand[], hookUrls: Set<string> | null): Cand[] {
  const q = new Set(tokens(it.text + ' ' + (it.why ?? '')))
  const tag = str(it.tag).toLowerCase()
  const seen = new Set<string>()
  return rows
    .map((r) => {
      const toks = new Set(tokens(r.text))
      let s = 0
      for (const w of q) if (toks.has(w)) s += 1
      s = Math.min(s, 6)
      if (hookUrls && r.url && hookUrls.has(r.url)) s += 6
      if (tag === 'offer' && r.offer && tokens(r.offer).some((w) => q.has(w))) s += 1
      return { r, s }
    })
    .filter((x) => {
      if (x.s < 2) return false
      const k = x.r.url + '|' + x.r.hook
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((a, b) => b.s - a.s || (b.r.days ?? 0) - (a.r.days ?? 0))
    .slice(0, 6)
    .map((x) => x.r)
}

/** The snapshot's sources for a hook (e9HookSrc): the first whose key starts the hook's words, or the other way round. */
export function hookSource(snapshot: unknown, hook: string): { ads: string[]; who: string[]; note: string } | null {
  const s = json(snapshot)
  const list = arr(s.hook_sources).map(json)
  const n = str(hook)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .slice(0, 40)
    .trim()
  if (!n || !list.length) return null
  const hs = list.find((x) => {
    const k = str(x.key)
    return !!k && (n.startsWith(k) || k.startsWith(n))
  })
  return hs ? { ads: arr(hs.ads).map(str), who: arr(hs.who).map(str).filter(Boolean), note: str(hs.note) } : null
}

/** The links of the ads the snapshot names for a point: sources sharing 2 or more words with it. */
export function hookUrlsFor(snapshot: unknown, text: string): Set<string> | null {
  const list = arr(json(snapshot).hook_sources).map(json)
  if (!list.length) return null
  const q = new Set(tokens(text))
  const out = new Set<string>()
  for (const x of list) if (tokens(str(x.key)).filter((w) => q.has(w)).length >= 2) for (const u of arr(x.ads)) out.add(str(u))
  return out
}

/** A run's day from its id when nothing else says when it ran (nwAdRunDate). */
export function runDateOf(run: string): string | null {
  const m = /(\d{4}-\d{2}-\d{2})(?:_(\d{2})(\d{2}))?/.exec(run)
  return m ? m[1] + 'T' + (m[2] || '12') + ':' + (m[3] || '00') + ':00Z' : null
}
