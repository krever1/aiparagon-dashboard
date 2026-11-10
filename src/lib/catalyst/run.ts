import 'server-only'
import { callN8n, startN8n } from '@/lib/n8n'
import { createClient } from '@/lib/supabase/server'
import { type Lead, type OutRow, docIds, docOf, leadEmails } from './leads'
import {
  type Contact, type GatherCall, type GatherEmail, type ReadRow, type RunEntry, type StageSetup, RUN_HOOKS, RUN_STALE_MS, STAGE_SETUP,
  contactName, crmLine, customBody, prepBody, researchBody, runsFromSetting, setupOf,
} from './plan'
import { type StageKey, type StageNames, stageOfKey } from './stages'

// What a stage run reads, and the run itself, as the current dashboard does it (v136Go, v137Gather, v137Start,
// v137FileUsed, v138MailLoad), on the server: the n8n calls carry the teammate's token, the writes go out as them.

export type Supa = Awaited<ReturnType<typeof createClient>>

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const lower = (v: unknown) => str(v).trim().toLowerCase()
const errText = (e: unknown) => (e instanceof Error ? e.message : str(e)) || 'something went wrong'

export async function readSetting(supabase: Supa, key: string): Promise<unknown> {
  const { data } = await supabase.from('ai_settings').select('value').eq('key', key).maybeSingle()
  return data?.value ?? null
}

// ---------- Fathom ----------

export type FathomCall = {
  id: string
  title: string
  start: string
  end: string
  invitees: { name: string; email: string }[]
  recorder: string
}

function normCall(c: unknown): FathomCall {
  const o = (c ?? {}) as Record<string, unknown>
  const rb = (o.recorded_by ?? {}) as Record<string, unknown>
  const inv = Array.isArray(o.invitees) ? (o.invitees as Record<string, unknown>[]) : []
  return {
    id: str(o.id),
    title: str(o.title || o.meeting_title),
    start: str(o.start || o.created_at),
    end: str(o.end),
    invitees: inv.map((i) => ({ name: str(i?.name), email: str(i?.email) })),
    recorder: lower(rb.email),
  }
}

/** Fathom's newest calls: the first page of its list, as the current dashboard reads it. */
export async function fathomList(): Promise<FathomCall[]> {
  const j = await callN8n<{ ok?: boolean; items?: unknown[]; message?: string }>(
    'fathom-proxy',
    { action: 'list' },
    { what: 'Fathom', workflow: 'Dashboard · Fathom Proxy' },
  )
  if (!j || j.ok === false) throw new Error((j && j.message) || 'Fathom did not answer.')
  return (j.items ?? []).map(normCall).filter((c) => c.id)
}

/** A call's transcript as "Speaker: text" lines. */
export async function fathomTranscript(id: string): Promise<string> {
  const j = await callN8n<{ ok?: boolean; transcript?: { speaker?: unknown; text?: unknown }[]; message?: string }>(
    'fathom-proxy',
    { action: 'transcript', id },
    { what: 'Fathom', workflow: 'Dashboard · Fathom Proxy' },
  )
  if (!j || j.ok === false) throw new Error((j && j.message) || 'Fathom did not answer.')
  return (j.transcript ?? []).map((l) => (l.speaker ? str(l.speaker) + ': ' : '') + str(l.text)).join('\n').trim()
}

type Meta = { call_id: string; lead_email?: string | null; lead_stage?: string | null; guests?: unknown; meeting_type?: string | null }

/** Who was on a call: the guests set on Calls, else Fathom's invitees without the person who recorded it. */
function guestsOf(c: FathomCall, m: Meta | undefined): string[] {
  const set = Array.isArray(m?.guests) ? (m!.guests as Record<string, unknown>[]) : []
  if (set.length) return set.map((g) => lower(g?.email)).filter(Boolean)
  return c.invitees.map((i) => lower(i.email)).filter((e) => e && e !== c.recorder)
}

export type LeadCall = GatherCall & { type: string }

/**
 * The lead's recorded calls, newest first: a guest is one of its emails, the call is not filed under another lead,
 * and it was not set aside.
 */
export async function leadCalls(supabase: Supa, lead: Lead): Promise<{ calls: LeadCall[]; err: string }> {
  let list: FathomCall[]
  try {
    list = await fathomList()
  } catch (e) {
    return { calls: [], err: errText(e) }
  }
  const meta = new Map<string, Meta>()
  if (list.length) {
    const { data } = await supabase.from('call_meta').select('call_id,lead_email,lead_stage,guests,meeting_type').in('call_id', list.map((c) => c.id))
    for (const m of (data ?? []) as Meta[]) meta.set(str(m.call_id), m)
  }
  const em = leadEmails(lead).map(lower)
  const calls = list
    .filter((c) => {
      const m = meta.get(c.id)
      if (m?.lead_email && !em.includes(lower(m.lead_email))) return false
      return guestsOf(c, m).some((g) => em.includes(g))
    })
    .map((c) => ({ id: c.id, start: c.start, title: c.title, stage: str(meta.get(c.id)?.lead_stage), type: str(meta.get(c.id)?.meeting_type) }))
    .filter((x) => x.stage !== 'none')
    .sort((a, b) => b.start.localeCompare(a.start))
  return { calls, err: '' }
}

// ---------- HubSpot ----------

const CONTACT_COLS = 'email,first_name,last_name,company,job_title,website,lifecycle_stage,lead_status,hs_id'

/** The lead's HubSpot contact: the first one whose email is one of the lead's. */
export async function leadContact(supabase: Supa, lead: Lead): Promise<Contact | null> {
  const emails = leadEmails(lead)
  const asked = [...new Set(emails.flatMap((e) => [e, lower(e)]))]
  const { data } = await supabase.from('hubspot_contacts').select(CONTACT_COLS).in('email', asked).limit(10)
  const rows = (data ?? []) as Contact[]
  for (const e of emails.map(lower)) {
    const c = rows.find((r) => lower(r.email) === e)
    if (c) return c
  }
  return null
}

/** The lead's emails logged in HubSpot (Dashboard · HubSpot Emails Proxy), never the anonymizer's placeholder. */
export async function hubspotEmails(lead: Lead, contact: Contact | null): Promise<{ emails: GatherEmail[]; err: string }> {
  const em = leadEmails(lead)
    .map(lower)
    .filter((e) => e.indexOf('@') > 0 && e !== 'contact@deltaadvisory.com')
  const ids = contact?.hs_id ? [str(contact.hs_id)] : []
  if (!em.length && !ids.length) return { emails: [], err: '' }
  try {
    const r = await callN8n<{ ok?: boolean; items?: Record<string, unknown>[]; message?: string }>(
      'catalyst-emails',
      { action: 'list', emails: em, ids, limit: 8 },
      { what: 'HubSpot Emails', workflow: 'Dashboard · HubSpot Emails Proxy' },
    )
    if (!r || !r.ok) return { emails: [], err: (r && r.message) || 'HubSpot did not answer.' }
    const emails = (r.items ?? [])
      .filter((x) => str(x?.text).trim())
      .map((x) => ({
        at: str(x.at),
        incoming: !!x.incoming,
        subject: str(x.subject),
        from: str(x.from),
        to: Array.isArray(x.to) ? (x.to as unknown[]).map(str) : [],
        text: str(x.text),
      }))
    return { emails, err: '' }
  } catch (e) {
    return { emails: [], err: errText(e) }
  }
}

// ---------- templates ----------

/** The template in use for each kind: the newest active file on Templates. */
export async function templatesInUse(supabase: Supa, kinds: string[]): Promise<Record<string, string>> {
  const { data } = await supabase
    .from('catalyst_sources')
    .select('kind,file_name,active,created_at')
    .in('kind', kinds)
    .order('created_at', { ascending: false })
    .limit(100)
  const out: Record<string, string> = {}
  for (const r of (data ?? []) as { kind: string; file_name: string; active: boolean | null }[]) {
    if (r.active === false || out[r.kind]) continue
    out[r.kind] = str(r.file_name)
  }
  return out
}

// ---------- what a run reads ----------

export type Gathered = {
  stage: StageKey
  setup: StageSetup
  /** the team's setup for every stage, as saved (filing a call takes its stage's meeting type from it) */
  saved: unknown
  template: string | null
  questions: string | null
  crm: Contact | null
  calls: LeadCall[]
  ftErr: string
  emails: GatherEmail[]
  emErr: string
  /** the names of the HubSpot contacts the emails were from or to */
  who: Record<string, string>
}

/** What a stage's run reads for a lead; with `withText`, the transcripts of the four newest calls too. */
export async function gather(supabase: Supa, lead: Lead, stage: StageKey, withText: boolean): Promise<Gathered> {
  const kind = STAGE_SETUP[stage].kind
  const [setupRaw, uses] = await Promise.all([readSetting(supabase, 'catalyst_stage_setup'), templatesInUse(supabase, [kind, 'discovery_template'])])
  const setup = setupOf(stage, setupRaw)
  const g: Gathered = {
    stage, setup, saved: setupRaw, template: uses[kind] ?? null, questions: setup.questions && uses.discovery_template ? uses.discovery_template : null,
    crm: null, calls: [], ftErr: '', emails: [], emErr: '', who: {},
  }
  const contact = setup.crm || setup.emails ? await leadContact(supabase, lead) : null
  if (setup.crm) g.crm = contact
  await Promise.all([
    setup.calls
      ? (async () => {
          const r = await leadCalls(supabase, lead)
          g.calls = r.calls
          g.ftErr = r.err
          if (withText) {
            await Promise.all(
              g.calls.slice(0, 4).map(async (x) => {
                try {
                  x.text = await fathomTranscript(x.id)
                } catch {
                  x.text = ''
                }
              }),
            )
          }
        })()
      : null,
    setup.emails
      ? (async () => {
          const r = await hubspotEmails(lead, contact)
          g.emails = r.emails
          g.emErr = r.err
          const addrs = [...new Set(r.emails.slice(0, 3).map((m) => lower(m.incoming ? m.from : m.to[0])).filter(Boolean))]
          if (addrs.length) {
            const { data } = await supabase.from('hubspot_contacts').select(CONTACT_COLS).in('email', addrs)
            for (const c of (data ?? []) as Contact[]) g.who[lower(c.email)] = contactName(c)
          }
        })()
      : null,
  ])
  return g
}

export function readRows(g: Gathered): ReadRow[] {
  const u: ReadRow[] = []
  const s = g.stage
  u.push(g.template ? { ok: true, text: 'Template: ' + g.template } : { ok: false, text: 'No template for this stage yet, so the usual sections. Add one on Templates.' })
  if (s !== 'research' && g.setup.calls) {
    if (g.ftErr && !g.calls.length) u.push({ ok: false, text: 'Call transcripts: Fathom could not be read (' + g.ftErr + ').' })
    else if (!g.calls.length) u.push({ ok: false, text: 'No recorded calls with this lead yet.' })
    else
      for (const x of g.calls.slice(0, 4)) {
        u.push({ ok: true, text: 'The call on ', date: x.start, after: ': ' + (x.title || 'untitled') + (x.text === '' ? ' (its transcript could not be read)' : ' (transcript)') })
      }
  }
  if (s !== 'research' && g.setup.emails) {
    if (g.emErr && !g.emails.length) u.push({ ok: false, text: 'Emails: HubSpot could not be read (' + g.emErr + ').' })
    else if (!g.emails.length) u.push({ ok: false, text: 'No emails with this lead logged in HubSpot.' })
    else {
      for (const m of g.emails.slice(0, 3)) {
        const addr = lower(m.incoming ? m.from : m.to[0])
        const who = addr ? g.who[addr] || addr : ''
        u.push({ ok: true, text: 'The email on ', date: m.at, after: (who ? (m.incoming ? ' from ' : ' to ') + who : '') + ': ' + (m.subject || 'no subject') })
      }
      const more = g.emails.length - 3
      if (more > 0) u.push({ ok: true, text: 'and ' + more + ' more email' + (more === 1 ? '' : 's') })
    }
  }
  if (g.setup.crm) {
    u.push(g.crm ? { ok: true, text: 'The CRM record: ' + crmLine(g.crm) } : { ok: false, text: 'No HubSpot contact with this lead’s email.' })
  }
  if (g.questions) u.push({ ok: true, text: 'Your discovery call questions: ' + g.questions })
  u.push({ ok: true, text: STAGE_SETUP[s].reads })
  return u
}

// ---------- the writes ----------

/**
 * Moves a lead: the stage on every e1_leads row of the person (not the anonymizer's placeholder row, which other leads
 * share), or a new row when it has none.
 */
export async function setStage(supabase: Supa, lead: Lead, stage: StageKey): Promise<void> {
  const now = new Date().toISOString()
  let n = 0
  for (const em of leadEmails(lead)) {
    if (lead.anonEmail && em === lead.anonEmail) continue
    const { data, error } = await supabase.from('e1_leads').update({ stage, updated_at: now }).eq('email', em).select('email')
    if (error) throw new Error(error.message)
    n += data?.length ?? 0
  }
  if (!n) {
    const { error } = await supabase.from('e1_leads').insert({
      email: lead.email, prospect_name: lead.prospect_name || null, company_name: lead.company_name || null, stage, lead_source: 'Dashboard',
    })
    if (error) throw new Error(error.message)
  }
}

/** Files a call under a lead's stage (call_meta), with the stage's meeting type when the call has none. */
export async function fileCall(
  supabase: Supa,
  call: { id: string; type: string },
  email: string,
  stage: StageKey | 'none',
  by: string,
  saved: unknown = null,
) {
  const patch: Record<string, unknown> = { lead_email: email, lead_stage: stage, updated_at: new Date().toISOString(), updated_by: by }
  const type = stage !== 'none' ? setupOf(stage, saved).type : ''
  if (type && !call.type) patch.meeting_type = type
  const { data, error } = await supabase.from('call_meta').update(patch).eq('call_id', call.id).select('call_id')
  if (error) throw new Error(error.message)
  if (!data?.length) {
    const ins = await supabase.from('call_meta').insert({ call_id: call.id, created_at: new Date().toISOString(), ...patch })
    if (ins.error) throw new Error(ins.error.message)
  }
}

/** The calls a run read that were not filed yet go under the stage the lead was in (a failure is left for later). */
export async function fileUsed(supabase: Supa, lead: Lead, g: Gathered | null, stage: StageKey, by: string) {
  for (const x of (g?.calls ?? []).filter((c) => c.text && !c.stage)) {
    try {
      await fileCall(supabase, x, lead.email, stage, by, g?.saved ?? null)
    } catch {
      // the call stays unfiled; the next run files it
    }
  }
}

/** Starts the stage's workflow, only that stage. */
export async function startStage(lead: Lead, outs: OutRow[], stage: StageKey, note: string, g: Gathered | null, names: StageNames) {
  if (stage === 'research') {
    const c = g?.crm
    const l = c
      ? { ...lead, prospect_title: lead.prospect_title || c.job_title || '', company_name: lead.company_name || c.company || '', website: c.website || '' }
      : lead
    return startN8n(RUN_HOOKS.full, researchBody(l))
  }
  if (stage === 'onboarding' || stage === 'review') return startN8n(RUN_HOOKS.prep, prepBody(lead, leadEmails(lead), stage, names, note))
  return startN8n(RUN_HOOKS.custom, customBody(lead, stage, note, docIds(lead, outs)))
}

/**
 * Keeps the run for the whole team (ai_settings `catalyst_runs`): the board shows "Writing …" on every computer until
 * the stage's document lands, or for 45 minutes. Runs older than that are dropped as the list is written.
 */
export async function recordRun(supabase: Supa, lead: Lead, outs: OutRow[], stage: StageKey, by: string) {
  const now = Date.now()
  const cur = runsFromSetting(await readSetting(supabase, 'catalyst_runs'))
  const next: Record<string, RunEntry> = {}
  for (const [e, r] of Object.entries(cur)) if (now - Date.parse(r.t0) <= RUN_STALE_MS) next[e] = r
  for (const e of leadEmails(lead)) delete next[e]
  next[lead.email] = { s: stage, t0: new Date(now).toISOString(), seen: docOf(lead, stageOfKey(stage), outs)?.at ?? 0, by }
  const at = new Date(now).toISOString()
  const { error } = await supabase.from('ai_settings').upsert({ key: 'catalyst_runs', value: next, updated_by: by, updated_at: at }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}
