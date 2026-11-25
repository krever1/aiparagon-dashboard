import 'server-only'
import { readSetting, type Supa } from './run'
import { objOf } from './setup'

/**
 * Change a team setting (ai_settings) the way the current dashboard's v104SetPatch does: read the row fresh, let `fn`
 * say what changes at its top level, and save the merge, so a teammate's save in between is not lost.
 */
export async function patchSetting(
  supabase: Supa,
  key: string,
  by: string,
  fn: (cur: Record<string, unknown>) => Record<string, unknown> | null,
): Promise<Record<string, unknown>> {
  const cur = objOf(await readSetting(supabase, key))
  const add = fn(JSON.parse(JSON.stringify(cur)))
  if (!add) return cur
  const value = { ...cur, ...add }
  const { error } = await supabase.from('ai_settings').upsert({ key, value, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
  return value
}
