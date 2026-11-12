'use server'

import { getCurrentUser } from '@/lib/auth'
import { CHUNK, type Existing, type Mode, checkRow, dbWrite } from '@/lib/pipeline/ad-testing-import'
import { createClient } from '@/lib/supabase/server'

// Import a CSV, as the signed-in teammate (v106ExLoad and v106ImpGo in the current dashboard): the results already
// logged, to match a file's rows against, and the rows written a hundred at a time. A result synced from the ad
// platforms is never matched or changed: the next sync would undo it.

const SIGNED_OUT = 'You are signed out. Sign in again.'
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
type Row = Record<string, unknown>

/** Every result logged here (not only the 500 the page shows), 5,000 at most, to match against. */
export async function importExisting(): Promise<{ ok: true; ex: Existing[] } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('content_results')
    .select('id,kind,title,platform,posted_on,period_start,attribution')
    .or('attribution.is.null,attribution.neq.api')
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error) return { ok: false, error: error.message }
  return {
    ok: true,
    ex: ((data ?? []) as Row[]).map((r) => ({
      id: str(r.id),
      kind: r.kind === 'ad' ? 'ad' : 'post',
      title: str(r.title),
      platform: str(r.platform),
      postedOn: str(r.posted_on),
      periodStart: str(r.period_start),
    })),
  }
}

/**
 * Writes up to a hundred of the import's rows: the new ones in one go, then each one that matched a result already
 * logged. Every row is checked again here; a match that is gone or synced meanwhile is left alone.
 */
export async function importChunk(
  input: { mode: Mode; rows: unknown[] },
): Promise<{ ok: true; added: number; updated: number } | { ok: false; error: string; done: number }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT, done: 0 }
  const mode: Mode = input?.mode === 'leads' ? 'leads' : 'rows'
  const raw = Array.isArray(input?.rows) ? input.rows.slice(0, CHUNK) : []
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const rows = raw.map((r) => checkRow(r, mode, today)).filter((r) => r !== null)
  if (rows.length !== raw.length) return { ok: false, error: 'Some rows could not be read. Check which column holds what, then try again.', done: 0 }
  const { add, upd } = dbWrite(rows, mode, user.email, now.toISOString())
  const supabase = await createClient()
  if (add.length) {
    const { error } = await supabase.from('content_results').insert(add)
    if (error) return { ok: false, error: error.message, done: 0 }
  }
  let updated = 0
  let done = add.length
  for (const [id, patch] of upd) {
    const { data, error } = await supabase.from('content_results').update(patch).eq('id', id).or('attribution.is.null,attribution.neq.api').select('id')
    if (error) return { ok: false, error: error.message, done }
    updated += (data ?? []).length
    done++
  }
  return { ok: true, added: add.length, updated }
}
