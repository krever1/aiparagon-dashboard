import 'server-only'
import { leadId } from '@/lib/catalyst/lead-id'
import { PORTED } from '@/lib/nav'
import { createClient } from '@/lib/supabase/server'
import { type FbPlace, type FbRow, fbPlace, normRow } from './feedback'

// The feedback notes (v144FbLoad), read as the signed-in teammate: the newest 300 in dashboard_comments with a target_key
// fb:…, and where each page is (its name and its address; a lead's page by its name in e1_leads).

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

export async function readFeedback(): Promise<{ ok: true; rows: FbRow[]; places: Record<string, FbPlace> } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('dashboard_comments')
    .select('id,target_key,author,body,created_at,resolved,resolved_by,anchor_text')
    .like('target_key', 'fb:%')
    .order('created_at', { ascending: false })
    .limit(300)
  if (error) return { ok: false, error: error.message }
  const rows = ((data ?? []) as Record<string, unknown>[]).map(normRow)
  const keys = [...new Set(rows.map((r) => r.target_key))]
  const emails = [...new Set(keys.map((k) => k.split(':').slice(2).join(':').toLowerCase()).filter(Boolean))]
  const names: Record<string, string> = {}
  if (emails.length) {
    const got = await supabase.from('e1_leads').select('email,prospect_name').in('email', emails)
    for (const r of (got.data ?? []) as { email: string; prospect_name: string | null }[]) names[str(r.email).toLowerCase()] = str(r.prospect_name)
  }
  const places: Record<string, FbPlace> = {}
  for (const k of keys) places[k] = fbPlace(k, (e) => ({ id: leadId({ prospect_name: names[e] || '', email: e }), name: names[e] || '' }), PORTED)
  return { ok: true, rows, places }
}
