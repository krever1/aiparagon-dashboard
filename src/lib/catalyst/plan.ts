// Running a stage, as the current dashboard does it (v136 to v138): what each stage reads, what it needs, the notes a
// run sends and the request each workflow takes. Pure functions: the server builds requests with them and the tests
// check them.

import { type StageKey, type StageNames, isStageKey, stageOfKey } from './stages'

/** What a stage's run reads unless the team changed it on Templates (V137_TPL, with v138's emails and charts). */
export const STAGE_SETUP: Record<
  StageKey,
  { kind: string; type: string; calls: boolean; crm: boolean; questions: boolean | null; charts: boolean | null; reads: string }
> = {
  research: { kind: 'past_brief', type: 'sales', calls: false, crm: true, questions: null, charts: null, reads: 'What is public about the firm, and your house rules' },
  consultation: { kind: 'discovery_template', type: 'discovery', calls: true, crm: true, questions: null, charts: null, reads: 'The prospect brief and your house rules' },
  assessment: {
    kind: 'past_assessment', type: '', calls: true, crm: false, questions: false, charts: null,
    reads: 'The prospect brief, the consultation guide and your house rules',
  },
  proposal: {
    kind: 'proposal_template', type: 'proposal', calls: true, crm: false, questions: null, charts: true,
    reads: 'The assessment report. The client proposal also reads the prospect brief, the consultation guide, your discovery call questions, your past assessment and your house rules',
  },
  onboarding: { kind: 'past_onboarding', type: 'onboarding', calls: true, crm: true, questions: false, charts: true, reads: 'Every document so far and your house rules' },
  review: { kind: 'past_review', type: 'checkin', calls: true, crm: true, questions: false, charts: true, reads: 'Every document so far and your house rules' },
}

export type StageSetup = { type: string; calls: boolean; crm: boolean; questions: boolean | null; emails: boolean; charts: boolean | null }

/** A stage's setup: the team's choices (ai_settings `catalyst_stage_setup`) over the defaults. */
export function setupOf(stage: StageKey, saved: unknown): StageSetup {
  const all = saved && typeof saved === 'object' && !Array.isArray(saved) ? (saved as Record<string, unknown>) : {}
  const o = (all[stage] && typeof all[stage] === 'object' ? all[stage] : {}) as Record<string, unknown>
  const d = STAGE_SETUP[stage]
  const pick = (k: string, def: boolean) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : def)
  return {
    type: typeof o.type === 'string' ? o.type : d.type,
    calls: stage === 'research' ? false : pick('calls', d.calls),
    crm: stage === 'research' ? true : pick('crm', d.crm),
    questions: typeof d.questions === 'boolean' ? pick('questions', d.questions) : null,
    emails: stage === 'research' ? false : pick('emails', true),
    charts: d.charts === null ? null : pick('charts', true),
  }
}

/** What a stage needs before it runs, from the lead's documents (v136Plan). */
export type Plan = {
  /** the stage's document, when it has one: created_at in ms (0 for a link saved on the lead) */
  doneAt: number | null
  /** why it cannot run (the proposal works from the assessment) */
  blocked: string
  /** the document it would work from and does not have: the notes are then required */
  need: string
  /** whether the question asks for meeting notes */
  notes: boolean
}

export type PlanInput = {
  docs: Partial<Record<StageKey, number>>
  /** whether the agents saved a Google Doc of the prospect brief, the consultation guide and the assessment */
  ids: { research: boolean; interview: boolean; anonymized: boolean }
}

export const PROPOSAL_BLOCKED = 'The proposal works from the assessment report, and this lead has none yet. Run the assessment first.'

export function planFor(l: PlanInput, stage: StageKey): Plan {
  const p: Plan = { doneAt: l.docs[stage] ?? null, blocked: '', need: '', notes: stage !== 'research' }
  if (stage === 'consultation' && !l.ids.research) p.need = 'prospect brief'
  if (stage === 'assessment' && (!l.ids.research || !l.ids.interview)) p.need = !l.ids.interview ? 'consultation guide' : 'prospect brief'
  if (stage === 'proposal' && !l.ids.anonymized) p.blocked = PROPOSAL_BLOCKED
  if ((stage === 'onboarding' || stage === 'review') && !Object.keys(l.docs).length) p.need = 'documents'
  return p
}

// ---------- what a run reads ----------

export type Contact = {
  email: string
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  job_title?: string | null
  website?: string | null
  lifecycle_stage?: string | null
  lead_status?: string | null
  hs_id?: string | number | null
}

export type GatherCall = { id: string; start: string; title: string; stage: string; text?: string }

/** A line of the question's Reads list: words around a date the browser shows in the viewer's own time zone. */
export type ReadRow = { ok: boolean; text: string; date?: string; after?: string }
export type GatherEmail = { at: string; incoming: boolean; subject: string; from: string; to: string[]; text: string }

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

export function contactName(c: Contact): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.email || ''
}

/** "Pat Example · Managing Partner · Example Ridge Advisors · lifecycle stage: lead · lead status: NEW · website: x" */
export function crmLine(c: Contact): string {
  return [
    contactName(c),
    c.job_title,
    c.company,
    c.lifecycle_stage ? 'lifecycle stage: ' + c.lifecycle_stage : '',
    c.lead_status ? 'lead status: ' + c.lead_status : '',
    c.website ? 'website: ' + c.website : '',
  ]
    .map((x) => str(x).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' · ')
}

/** Dates in the notes a run sends: "Nov 4, 2026", in the team's time zone (Pacific). */
export const NOTE_TZ = 'America/Los_Angeles'
export function noteDay(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: NOTE_TZ })
}

export const NOTE_BUDGET = 44_000
export const MAIL_BUDGET = 8_000
export const MAIL_ONE = 3_000

/** The emails as the notes carry them, newest first, within 8,000 characters (3,000 each). */
export function mailBlock(emails: GatherEmail[]): string {
  let left = MAIL_BUDGET
  const out: string[] = []
  for (const x of emails.filter((m) => str(m.text).trim())) {
    if (left < 300) continue
    const head =
      'Email on ' +
      (noteDay(x.at) || 'an unknown day') +
      (x.from ? ' from ' + x.from : '') +
      (x.to && x.to.length ? ' to ' + x.to.join(', ') : '') +
      (x.subject ? ': ' + x.subject : '')
    let t = str(x.text).replace(/\r\n/g, '\n').trim()
    if (t.length > MAIL_ONE) t = t.slice(0, MAIL_ONE) + '\n[the rest of this email is left out]'
    if (head.length + t.length + 2 > left) t = t.slice(0, Math.max(0, left - head.length - 60)) + '\n[the rest of this email is left out]'
    out.push(head + '\n' + t)
    left -= head.length + t.length + 2
  }
  return out.length ? 'EMAILS WITH THE CLIENT (HubSpot, newest first)\n\n' + out.join('\n\n') : ''
}

/**
 * The notes a run sends (v137Note with v138's emails): the team's notes, the CRM record, the emails, then the call
 * transcripts newest first, cut so the whole stays within 44,000 characters. With none of the last three, exactly what
 * was typed.
 */
export function composeNote({
  typed,
  crm,
  calls,
  emails,
  names,
}: {
  typed: string
  crm: Contact | null
  calls: GatherCall[]
  emails: GatherEmail[]
  names: StageNames
}): string {
  const t = str(typed).trim()
  const line = crm ? crmLine(crm) : ''
  const said = calls.filter((x) => x.text)
  const mail = mailBlock(emails)
  if (!line && !said.length && !mail) return t
  const parts: string[] = []
  if (t) parts.push('NOTES FROM THE TEAM\n' + t)
  if (line) parts.push('THE CRM RECORD (HubSpot)\n' + line)
  if (mail) parts.push(mail)
  let left = NOTE_BUDGET - parts.join('\n\n').length - 120
  const out: string[] = []
  for (const x of said) {
    if (left < 300) continue
    const filed = isStageKey(x.stage) ? ' (filed under ' + stageOfKey(x.stage, names).name + ')' : ''
    const head = 'Call on ' + noteDay(x.start) + ': ' + (x.title || 'untitled') + filed
    let body = str(x.text)
    if (head.length + body.length + 2 > left) body = body.slice(0, Math.max(0, left - head.length - 60)) + '\n[the rest of this call is left out]'
    out.push(head + '\n' + body)
    left -= head.length + body.length + 2
  }
  if (out.length) parts.push('WHAT WAS SAID IN THE MEETINGS (call transcripts, newest first)\n\n' + out.join('\n\n'))
  return parts.join('\n\n')
}

// ---------- the requests ----------

/** The workflows a stage run starts (webhook paths under /webhook/). */
export const RUN_HOOKS = {
  /** Lead AI Research Agent (Erica): the prospect brief */
  full: '870a1ffa-cbc6-4085-894a-6f3bc90a40f2',
  /** Engine 1 Custom Run (Erica): the consultation guide, the assessment and the proposal */
  custom: 'e1-custom-run-erica',
  /** Catalyst · Meeting Prep: the onboarding plan and the client review brief */
  prep: 'catalyst-meeting-prep',
} as const

/** Where Engine 1 Custom Run starts for each of its stages. */
export const ENTRY: Partial<Record<StageKey, string>> = { consultation: 'interview_script', assessment: 'anonymizer', proposal: 'growth_plan' }

export type RunLead = {
  email: string
  prospect_name?: string | null
  prospect_title?: string | null
  company_name?: string | null
  firm_type?: string | null
  firm_size?: string | null
  website?: string | null
  phone?: string | null
}

/** The lead's details every run takes (v120Body's base). */
export function baseFields(l: RunLead) {
  const n = str(l.prospect_name).trim().split(/\s+/)
  return {
    firstName: n[0] || '',
    lastName: n.slice(1).join(' '),
    prospectName: str(l.prospect_name),
    prospectTitle: str(l.prospect_title),
    firmName: str(l.company_name),
    companyName: str(l.company_name),
    companyUrl: str(l.website),
    website: str(l.website),
    emailAddress: l.email,
    email: l.email,
    phone: str(l.phone),
    firmType: str(l.firm_type),
    firmSize: str(l.firm_size),
  }
}

/** The prospect brief (the full run, stopping after research): the intake form's fields, no notes. */
export function researchBody(l: RunLead, hearAboutUs = 'Dashboard run') {
  return {
    ...baseFields(l),
    hearAboutUs,
    whatBringsYouHere: '',
    aiInterests: [] as string[],
    currentAIStage: '',
    preferredFollowUp: '',
    only: true,
    stage: 'research',
  }
}

/** The consultation guide, the assessment or the proposal: Engine 1 Custom Run from the stage, and only that stage. */
export function customBody(
  l: RunLead,
  stage: 'consultation' | 'assessment' | 'proposal',
  note: string,
  ids: { researchDocId: string; interviewDocId: string; anonymizedDocId: string },
) {
  return { ...baseFields(l), ...ids, entry: ENTRY[stage]!, transcript: note || '', extraDoc: '', from: 'board', only: true, stage }
}

/** The onboarding plan or the client review brief (Catalyst · Meeting Prep). */
export function prepBody(l: RunLead, emails: string[], stage: 'onboarding' | 'review', names: StageNames, note: string) {
  const st = stageOfKey(stage, names)
  return {
    leadEmail: l.email,
    email: l.email,
    emails,
    prospectName: str(l.prospect_name),
    prospectTitle: str(l.prospect_title),
    companyName: str(l.company_name),
    firmType: str(l.firm_type),
    firmSize: str(l.firm_size),
    stage,
    stageName: st.name,
    docName: st.doc,
    transcript: note || '',
    from: 'board',
  }
}

// ---------- runs in progress ----------

/** A run that writes nothing for 45 minutes stops showing as running (a failed n8n run saves nothing). */
export const RUN_STALE_MS = 45 * 60 * 1000

/** A run started from the dashboard, kept for the whole team (ai_settings `catalyst_runs`, by the lead's email). */
export type RunEntry = { s: StageKey; t0: string; seen: number; by?: string }

export function runsFromSetting(value: unknown): Record<string, RunEntry> {
  const out: Record<string, RunEntry> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [email, v] of Object.entries(value as Record<string, unknown>)) {
    const r = v as Record<string, unknown>
    if (!r || !isStageKey(r.s) || !Date.parse(str(r.t0))) continue
    out[email] = { s: r.s, t0: str(r.t0), seen: Number(r.seen) || 0, by: str(r.by) || undefined }
  }
  return out
}

/** The run in progress for a lead, if any: not stale, and its stage's document not written since it started. */
export function runOf(
  l: { emails: string[]; docs: Partial<Record<StageKey, number>> },
  runs: Record<string, RunEntry>,
  now: number,
): { s: StageKey; t0: string } | null {
  const email = l.emails.find((e) => runs[e])
  const r = email ? runs[email] : null
  if (!r) return null
  if (now - Date.parse(r.t0) > RUN_STALE_MS) return null
  const d = l.docs[r.s]
  if (d !== undefined && d > r.seen) return null
  return { s: r.s, t0: r.t0 }
}
