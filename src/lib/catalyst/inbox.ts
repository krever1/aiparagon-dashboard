// Catalyst's new clients and transcripts (v137Load, v137ItemText): a HubSpot contact the sync first saw in the last 14
// days that is not a lead yet, and a recorded call from the last 14 days with a lead among its guests that is not filed
// yet. Today shows them first, each with its question. Pure: the page and the tests both use it.

import { isTeamEmail } from '@/lib/config'
import { type CallMeta, type FtCall, leadOf } from './calls'
import { type StageKey, type StageNames, nextStageKey, stageOfKey } from './stages'
import { type LeadView, viewStage } from './view'

export const INBOX_DAYS = 14

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const lower = (v: unknown) => str(v).trim().toLowerCase()

/** Within the last 14 days (v137Recent). */
export function recent(iso: string, now: number, days = INBOX_DAYS): boolean {
  const t = Date.parse(iso)
  return !!t && now - t <= days * 864e5
}

export type InboxContact = {
  email: string
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  job_title?: string | null
  website?: string | null
  first_seen?: string | null
}

/** A contact's name, else its email (v137Name). */
export const contactNameOf = (c: Pick<InboxContact, 'first_name' | 'last_name' | 'email'>) =>
  [c.first_name, c.last_name].map(str).filter(Boolean).join(' ').trim() || str(c.email)

export type CrmItem = {
  kind: 'crm'
  key: string
  /** in lower case; `raw` as the sync kept it */
  email: string
  raw: string
  name: string
  title: string
  company: string
  website: string
  at: string
}
export type CallItem = {
  kind: 'call'
  key: string
  id: string
  title: string
  start: string
  minutes: number
  leadId: string
  leadName: string
  /** the stage the lead is in, and the one the call would run */
  cur: StageKey
  nx: StageKey
  at: string
}
export type InboxItem = CrmItem | CallItem

/** New clients: contacts first seen lately that are not a lead, not set aside and not the team's. */
export function crmItems(contacts: InboxContact[], leadEmails: Set<string>, aside: Record<string, unknown>, now: number): CrmItem[] {
  const out: CrmItem[] = []
  const seen = new Set<string>()
  for (const c of contacts) {
    const e = lower(c.email)
    if (!e || seen.has(e) || !c.first_seen || !recent(str(c.first_seen), now) || leadEmails.has(e) || aside[e] || isTeamEmail(e)) continue
    seen.add(e)
    out.push({
      kind: 'crm',
      key: 'crm:' + e,
      email: e,
      raw: str(c.email).trim(),
      name: contactNameOf(c),
      title: str(c.job_title),
      company: str(c.company),
      website: str(c.website),
      at: str(c.first_seen),
    })
  }
  return out
}

/** New transcripts: recorded calls lately with a lead among the guests that nobody has filed yet. */
export function callItems(calls: FtCall[], metas: Record<string, CallMeta>, leads: LeadView[], now: number): CallItem[] {
  const out: CallItem[] = []
  for (const c of calls) {
    const at = c.start
    if (!recent(at, now)) continue
    const m = metas[c.id]
    if (m?.lead_stage) continue
    const lead = leadOf(c, m, leads)
    if (!lead) continue
    const cur = viewStage(lead)
    const a = Date.parse(c.start)
    const b = Date.parse(c.end)
    out.push({
      kind: 'call',
      key: 'call:' + c.id,
      id: c.id,
      title: c.title,
      start: c.start,
      minutes: a && b && b > a ? Math.round((b - a) / 60000) : 0,
      leadId: lead.id,
      leadName: lead.name,
      cur,
      nx: nextStageKey(cur),
      at,
    })
  }
  return out
}

/** Both, newest first. */
export const inboxItems = (crm: CrmItem[], calls: CallItem[]): InboxItem[] => [...crm, ...calls].sort((a, b) => b.at.localeCompare(a.at))

const lc = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)

/** What a row says, and its button (v137ItemText); `day` is the call's day as the page draws it ("Nov 4"). */
export function itemText(x: InboxItem, names: StageNames, day: string): { t: string; s: string; b: string } {
  if (x.kind === 'crm') {
    return { t: 'New client from HubSpot: ' + x.name + (x.company ? ', ' + x.company : ''), s: 'Run the pre-meeting prospect brief?', b: 'Run the brief' }
  }
  const cur = stageOfKey(x.cur, names)
  const nx = stageOfKey(x.nx, names)
  const same = x.nx === x.cur
  return {
    t: 'New transcript: your call with ' + x.leadName + (day ? ' on ' + day : ''),
    s: 'In ' + cur.name + '. ' + (same ? 'Run ' + nx.what + ' again with it?' : 'Run the ' + lc(nx.name) + ' stage?'),
    b: same ? 'Run it again' : 'Run ' + lc(nx.name),
  }
}
