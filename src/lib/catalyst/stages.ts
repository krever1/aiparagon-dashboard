// Catalyst's six meeting stages, as the current dashboard has them since v136 (V136_STAGES). Each stage writes one
// document, the prep for that meeting. Only `name` can be changed by the team (ai_settings `catalyst_stages`); the
// rest is fixed. Plain data, read on the server and in the browser.

export const STAGE_KEYS = ['research', 'consultation', 'assessment', 'proposal', 'onboarding', 'review'] as const
export type StageKey = (typeof STAGE_KEYS)[number]

export type Stage = {
  key: StageKey
  /** the meeting, as the team names it (the usual name until renamed) */
  name: string
  /** the usual name */
  defaultName: string
  /** the document, short, on buttons: "Run prospect brief", "✓ Prospect brief ready" */
  short: string
  /** the document's name */
  doc: string
  /** what a run writes, in a sentence: "Writing the consultation guide" */
  what: string
  /** the agent whose agent_outputs row is the stage's document (onboarding and review: meeting_prep, by data.stage) */
  agent: 'lead_research' | 'interview_script' | 'anonymizer' | 'growth_plan' | 'meeting_prep'
  /** the lead's column that also counts as the document, when an older run saved only a link */
  urlCol: 'lead_research_url' | 'interview_url' | 'assessment_url' | 'growth_plan_url' | null
  color: string
  /** "It works from ..." */
  from: string
  /** what the stage's agent does (the Overview's card) */
  role: string
}

const STAGE_LIST: Stage[] = [
  {
    key: 'research', name: 'Prospect research', defaultName: 'Prospect research', short: 'Prospect brief',
    doc: 'Pre-meeting prospect brief', what: 'the pre-meeting prospect brief', agent: 'lead_research',
    urlCol: 'lead_research_url', color: '#4F7DC0',
    from: 'the lead’s details and what is public about the firm',
    role: 'Researches the firm and the person before the first meeting.',
  },
  {
    key: 'consultation', name: 'Discovery consultation', defaultName: 'Discovery consultation', short: 'Consultation guide',
    doc: 'Consultation guide', what: 'the consultation guide', agent: 'interview_script', urlCol: 'interview_url',
    color: '#6C5DD3',
    from: 'the prospect brief and what was said in the first meeting',
    role: 'Writes the questions for the discovery consultation, from the brief and the first meeting.',
  },
  {
    key: 'assessment', name: 'Assessment', defaultName: 'Assessment', short: 'Assessment', doc: 'Assessment report',
    what: 'the assessment report', agent: 'anonymizer', urlCol: 'assessment_url', color: '#C08A2E',
    from: 'the prospect brief, the consultation guide and what was said in the consultation',
    role: 'Turns the consultation into an assessment and recommendations, with the firm masked for later agents.',
  },
  {
    key: 'proposal', name: 'Proposal', defaultName: 'Proposal', short: 'Proposal', doc: 'Proposal presentation',
    what: 'the proposal presentation and the client proposal', agent: 'growth_plan', urlCol: 'growth_plan_url',
    color: '#2E7D5B',
    from: 'the assessment report; the client proposal also uses the prospect brief, the consultation guide, your templates and what was said in the meetings',
    role: 'Writes the proposal presentation from the assessment, then the client proposal from everything before it.',
  },
  {
    key: 'onboarding', name: 'Onboarding', defaultName: 'Onboarding', short: 'Onboarding plan', doc: 'Onboarding plan',
    what: 'the onboarding plan', agent: 'meeting_prep', urlCol: null, color: '#2E8B83',
    from: 'every document so far, the proposal above all, and what was said in the meetings',
    role: 'Prepares the onboarding meeting: what was agreed, the first weeks, who does what.',
  },
  {
    key: 'review', name: 'Client review', defaultName: 'Client review', short: 'Review brief', doc: 'Client review brief',
    what: 'the client review brief', agent: 'meeting_prep', urlCol: null, color: '#8A6BB5',
    from: 'every document so far and what was said in the meetings',
    role: 'Prepares the client review: what was planned, what happened since, what to decide next.',
  },
]

export const STAGES: readonly Stage[] = STAGE_LIST

/** The stages that count as clients (the strip's Clients tile). */
export const CLIENT_STAGES: readonly StageKey[] = ['onboarding', 'review']

/** The team's names, as saved: {stage: name}; an empty or missing name is the usual one. */
export type StageNames = Partial<Record<StageKey, string>>

export const STAGE_NAME_MAX = 40

export function isStageKey(k: unknown): k is StageKey {
  return typeof k === 'string' && (STAGE_KEYS as readonly string[]).includes(k)
}

/** A name as the team typed it: spaces collapsed, trimmed, at most 40 characters. */
export function cleanName(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, STAGE_NAME_MAX)
}

/** The stages with the team's names. */
export function stagesNamed(names: StageNames = {}): Stage[] {
  return STAGE_LIST.map((s) => ({ ...s, name: cleanName(names[s.key]) || s.defaultName }))
}

/** The stage a new call moves a lead to: the next one; in Client review, the review again. */
export function nextStageKey(cur: StageKey): StageKey {
  const i = STAGES.findIndex((s) => s.key === cur)
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1].key : cur
}

export function stageOfKey(key: StageKey, names: StageNames = {}): Stage {
  return stagesNamed(names).find((s) => s.key === key) as Stage
}

/** The card's run button: "Run prospect brief", "Run consultation guide", ... */
export function runLabel(s: Pick<Stage, 'short'>): string {
  return 'Run ' + s.short.charAt(0).toLowerCase() + s.short.slice(1)
}

/** The team's names from the ai_settings row value ({stage: {name, by, at}}, or that as a JSON string). */
export function namesFromSetting(value: unknown): StageNames {
  let v = value
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v)
    } catch {
      v = null
    }
  }
  const out: StageNames = {}
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out
  for (const k of STAGE_KEYS) {
    const entry = (v as Record<string, unknown>)[k]
    const name = entry && typeof entry === 'object' ? cleanName((entry as Record<string, unknown>).name) : ''
    if (name) out[k] = name
  }
  return out
}

const FIRM_TYPES: Record<string, string> = {
  ria: 'RIA',
  bd: 'Broker-dealer',
  advisory: 'Advisory firm',
  family_office: 'Family office',
  wealth: 'Wealth manager',
}

/** A firm type as the board shows it (ria → RIA; anything else in words, first letter capital). */
export function firmTypeLabel(t: string | null | undefined): string {
  const raw = String(t ?? '').trim()
  if (!raw) return ''
  const known = FIRM_TYPES[raw.toLowerCase()]
  if (known) return known
  const words = raw.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** The fit pill's colour: green for strong, red for weak or disqualified, amber for anything else. */
export function fitTone(fit: string | null | undefined): 'good' | 'bad' | 'warn' | null {
  const f = String(fit ?? '').trim()
  if (!f) return null
  if (/strong/i.test(f)) return 'good'
  if (/weak|disq/i.test(f)) return 'bad'
  return 'warn'
}

/** The older five-document list (E1_STAGES): the follow-up guide is no stage's, but a lead can still have one. */
export const FOLLOW_UP = {
  agent: 'discovery_call' as const,
  urlCol: 'discovery_url' as const,
  name: 'Follow-up guide',
}

/** "lead_source" → "Lead source"; "ai" stays AI. */
export function labelCase(s: string | null | undefined): string {
  const t = String(s ?? '').replace(/[-_]+/g, ' ').trim()
  return (t ? t.charAt(0).toUpperCase() + t.slice(1) : t).replace(/\bai\b/gi, 'AI')
}

/** Assets under management as saved ("10m-50m", "under-10m") in words: "$10M to $50M AUM", "Under $10M AUM". */
export function firmSizeLabel(s: string | null | undefined): string {
  const t = String(s ?? '').trim()
  if (!t) return ''
  const m = /^(under-)?(\d+)(m|b)(?:-(\d+)(m|b))?$/i.exec(t)
  if (!m) return labelCase(t)
  const u = (n: string, x: string) => '$' + n + x.toUpperCase()
  if (m[1]) return 'Under ' + u(m[2], m[3]) + ' AUM'
  return m[4] ? u(m[2], m[3]) + ' to ' + u(m[4], m[5]) + ' AUM' : u(m[2], m[3]) + ' AUM'
}
