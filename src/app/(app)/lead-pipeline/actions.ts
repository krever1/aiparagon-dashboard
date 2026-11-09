'use server'

import { refresh } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { DOC_ID } from '@/lib/catalyst/doc-format'
import { STAGES, type StageNames, cleanName, namesFromSetting } from '@/lib/catalyst/stages'
import { callN8n } from '@/lib/n8n'
import { createClient } from '@/lib/supabase/server'

export type SaveNamesResult = { ok: true; names: StageNames } | { ok: false; error: string }

const asObject = (v: unknown): Record<string, unknown> => {
  let x = v
  if (typeof x === 'string') {
    try {
      x = JSON.parse(x)
    } catch {
      x = null
    }
  }
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {}
}

/**
 * Rename stages: the team's names for the six meetings, for everyone (ai_settings `catalyst_stages`). The row is read
 * fresh and merged, so another teammate's save in between is not lost; each stage keeps who named it and when. A name
 * that is the usual one is stored empty, as the current dashboard does.
 */
export async function saveStageNames(input: Record<string, string>): Promise<SaveNamesResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'you are signed out, so sign in again' }
  const supabase = await createClient()
  const cur = await supabase.from('ai_settings').select('value').eq('key', 'catalyst_stages').maybeSingle()
  if (cur.error) return { ok: false, error: cur.error.message }
  const base = asObject(cur.data?.value)
  const at = new Date().toISOString()
  const value: Record<string, unknown> = { ...base }
  for (const s of STAGES) {
    const name = cleanName(input?.[s.key]) || s.defaultName
    value[s.key] = { ...asObject(base[s.key]), name: name === s.defaultName ? '' : name, by: user.email, at }
  }
  const { error } = await supabase
    .from('ai_settings')
    .upsert({ key: 'catalyst_stages', value, updated_by: user.email, updated_at: at }, { onConflict: 'key' })
  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true, names: namesFromSetting(value) }
}

export type ReadDocResult = { ok: true; kind: 'pdf' | 'doc'; text: string } | { ok: false; error: string }

/**
 * Read here, for a document with no saved text: the Google Doc (or the PDF in Drive) read through the Dashboard · Doc
 * Reader workflow, as the signed-in teammate.
 */
export async function readDocument(id: string): Promise<ReadDocResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You are signed out. Sign in again to read documents.' }
  if (!DOC_ID.test(String(id))) return { ok: false, error: 'That is not a Google Doc or a Drive file.' }
  try {
    const j = await callN8n<{ ok?: boolean; kind?: string; text?: unknown; message?: string }>(
      'doc-reader',
      { id },
      { what: 'Document', workflow: 'Dashboard · Doc Reader' },
    )
    if (!j || j.ok === false) return { ok: false, error: (j && j.message) || 'Could not read that document.' }
    return { ok: true, kind: j.kind === 'pdf' ? 'pdf' : 'doc', text: String(j.text ?? '') }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not read that document.' }
  }
}
