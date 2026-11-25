import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { type CallMeta, type FileContact, knownFolders, normMeta } from './calls'
import { teamFoldersOf } from './calls-load'
import { ftList } from './fathom'
import { type InboxContact, type InboxItem, INBOX_DAYS, callItems, clientItems, crmItems, inboxItems } from './inbox'
import type { LeadView } from './view'

// Catalyst's new clients and transcripts, read as the signed-in teammate (v137Load): the HubSpot contacts first seen
// lately, the contacts set aside (ai_settings `catalyst_inbox`), and Fathom's newest calls with their filing
// (call_meta). Fathom is waited for 4 seconds, as on Tasks; when it cannot be read there are no new transcripts.

export type InboxData = {
  items: InboxItem[]
  /** the leads the new transcripts are with, for their question */
  leads: LeadView[]
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

export async function loadInbox(leads: LeadView[], now: number): Promise<InboxData> {
  const supabase = await createClient()
  const since = new Date(now - INBOX_DAYS * 864e5).toISOString()
  const [hs, inbox, ft, contacts, folders, settings] = await Promise.all([
    supabase
      .from('hubspot_contacts')
      .select('email,first_name,last_name,company,job_title,website,first_seen')
      .gte('first_seen', since)
      .order('first_seen', { ascending: false })
      .limit(500),
    supabase.from('ai_settings').select('value').eq('key', 'catalyst_inbox').maybeSingle(),
    ftList(undefined, 4000).catch(() => ({ items: [], next: null })),
    // for new contacts on calls (v144): every contact's company, the folders set on calls and the team's own
    supabase.from('hubspot_contacts').select('email,company').not('company', 'is', null).limit(5000),
    supabase.from('call_meta').select('folder').not('folder', 'is', null).limit(2000),
    supabase.from('ai_settings').select('value').eq('key', 'call_folders').maybeSingle(),
  ])
  const value = inbox.data?.value
  const aside = (value && typeof value === 'object' && (value as { crm?: unknown }).crm) || {}
  const asideCalls = (value && typeof value === 'object' && (value as { calls?: unknown }).calls) || {}
  const emails = new Set(leads.flatMap((l) => l.emails.map((e) => e.toLowerCase())))
  const crm = crmItems((hs.data ?? []) as InboxContact[], emails, aside as Record<string, unknown>, now)

  const metas: Record<string, CallMeta> = {}
  if (ft.items.length) {
    const { data } = await supabase.from('call_meta').select('*').in('call_id', ft.items.map((c) => c.id))
    for (const r of (data ?? []) as Record<string, unknown>[]) metas[str(r.call_id)] = normMeta(r)
  }
  const calls = callItems(ft.items, metas, leads, now)
  const ids = new Set(calls.map((c) => c.leadId))
  const ctx = {
    leads: leads.map((l) => ({ emails: l.emails.map((e) => e.toLowerCase()), company: l.company, name: l.name })),
    contacts: ((contacts.data ?? []) as { email: string | null; company: string | null }[])
      .map((r): FileContact => ({ email: str(r.email).trim(), company: str(r.company).trim() }))
      .filter((r) => r.email && r.company),
    folders: knownFolders(((folders.data ?? []) as Record<string, unknown>[]).map((r) => normMeta({ ...r, call_id: '' })), teamFoldersOf(settings.data?.value)),
  }
  const clients = clientItems(ft.items, metas, ctx, new Set(crm.map((x) => x.email)), asideCalls as Record<string, unknown>, now)
  return { items: inboxItems(crm, calls, clients), leads: leads.filter((l) => ids.has(l.id)) }
}
