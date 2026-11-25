'use server'

import { refresh } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { buildLeads } from '@/lib/catalyst/leads'
import { readCatalyst, toView } from '@/lib/catalyst/load'
import { setupOf } from '@/lib/catalyst/plan'
import { readSetting, setStage } from '@/lib/catalyst/run'
import { patchSetting } from '@/lib/catalyst/settings'
import {
  type CsItem, type EditRow, type MtItem, STAGE_COLORS, backInPlace, editProblem, lines, meetingType, meetingTypes, nameOf, newKey, objOf, stageRec,
  stageRecs, txt,
} from '@/lib/catalyst/setup'
import { CUSTOM_STAGE, CUSTOM_TYPE, STAGES, isStageKey } from '@/lib/catalyst/stages'
import { viewStage } from '@/lib/catalyst/view'
import { createClient } from '@/lib/supabase/server'

// Meeting Types and Client Stages (v145, v146): the team's own stages and meeting types, each one's setup, and the
// ticks on a lead's stage checklist. Every save reads its ai_settings row fresh and merges what it changes into it, as
// the current dashboard's v104SetPatch does, so a teammate's save in between is not lost.

export type SetupResult = { ok: true; toast: string; key?: string } | { ok: false; error: string }

const SIGNED_OUT = 'You are signed out. Sign in again.'
const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e)) || 'something went wrong'

/** A built-in stage's (and its meeting type's) name, in `catalyst_stages`: '' for the usual one. */
function nameEntry(key: string, name: string, by: string, at: string) {
  const b = STAGES.find((s) => s.key === key)!
  return { name: name === b.defaultName ? '' : name, by, at }
}

// ---------- Edit stages ----------

/**
 * Save changes (v145StagesSave): the stages in this order with these names; new ones of the team's own with the
 * meeting type they run. Built-in names go to `catalyst_stages`, the rest to `catalyst_client_stages`.
 */
export async function saveStages(input: { rows: EditRow[] }): Promise<SetupResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const rows = (Array.isArray(input?.rows) ? input.rows : []).slice(0, 40).map((r) => ({
    key: String(r?.key ?? ''),
    name: nameOf(r?.name),
    isNew: !!r?.isNew,
    type: CUSTOM_TYPE.test(String(r?.type ?? '')) ? String(r.type) : '',
    c: /^#[0-9a-f]{3,8}$/i.test(String(r?.c ?? '')) ? String(r.c) : '',
  }))
  const bad = editProblem(rows)
  if (bad) return { ok: false, error: bad }
  if (rows.some((r) => !(isStageKey(r.key) || CUSTOM_STAGE.test(r.key)))) return { ok: false, error: 'That is not a stage.' }
  if (new Set(rows.map((r) => r.key)).size !== rows.length) return { ok: false, error: 'Two stages have the same name.' }
  const supabase = await createClient()
  const by = user.email
  const at = new Date().toISOString()
  const order = rows.map((r) => r.key)
  try {
    await patchSetting(supabase, 'catalyst_client_stages', by, (cur) => {
      const items = objOf(cur.items) as Record<string, CsItem>
      const removed = (Array.isArray(cur.removed) ? (cur.removed as string[]) : []).filter((k) => !order.includes(k))
      rows.forEach((r, i) => {
        if (isStageKey(r.key)) return
        items[r.key] = {
          ...objOf(items[r.key]),
          name: r.name,
          by,
          at,
          ...(r.isNew ? { type: r.type, c: r.c || STAGE_COLORS[i % STAGE_COLORS.length] } : {}),
        }
      })
      const prev = Array.isArray(cur.order) ? (cur.order as string[]) : []
      return { order: [...order, ...prev.filter((k) => !order.includes(k))], items, removed, by, at }
    })
    await patchSetting(supabase, 'catalyst_stages', by, () => {
      const x: Record<string, unknown> = {}
      for (const r of rows) if (isStageKey(r.key)) x[r.key] = nameEntry(r.key, r.name, by, at)
      return x
    })
  } catch (e) {
    return { ok: false, error: 'Could not save: ' + msgOf(e) }
  }
  refresh()
  return { ok: true, toast: 'Client stages saved.' }
}

/**
 * Delete a stage (v145StageDel): its leads move to the stage picked first (every row of each), then any other row
 * saved in it, then the stage goes: a built-in one to Removed stages, one of the team's own deleted. Prospect research
 * stays (v146).
 */
export async function deleteStage(input: { key: string; to: string }): Promise<SetupResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const key = String(input?.key ?? '')
  if (key === 'research') return { ok: false, error: 'Prospect research stays: new leads start there.' }
  const supabase = await createClient()
  const read = await readCatalyst()
  const rec = stageRec(read.config, key)
  if (!rec || rec.removed) return { ok: false, error: 'That stage is gone already. Refresh the page.' }
  const others = read.stages.filter((s) => s.key !== key)
  if (!others.length) return { ok: false, error: 'Keep at least one stage.' }
  const to = others.some((s) => s.key === input?.to) ? String(input.to) : others[0].key
  try {
    const { leads, outs } = buildLeads(read.rows, read.outs)
    for (const l of leads) {
      const v = toView(l, outs, read.runs, Date.now(), read.stages)
      if (viewStage(v) === key) await setStage(supabase, l, to)
    }
    const left = await supabase.from('e1_leads').update({ stage: to, updated_at: new Date().toISOString() }).eq('stage', key)
    if (left.error) throw new Error(left.error.message)
    await patchSetting(supabase, 'catalyst_client_stages', user.email, (cur) => {
      const items = objOf(cur.items) as Record<string, CsItem>
      const order = (Array.isArray(cur.order) && cur.order.length ? (cur.order as string[]) : stageRecs(read.config, true).map((r) => r.key)).filter(
        (x) => x !== key,
      )
      const out: Record<string, unknown> = { order, items }
      if (isStageKey(key)) out.removed = [...(Array.isArray(cur.removed) ? (cur.removed as string[]) : []).filter((x) => x !== key), key]
      else items[key] = { ...objOf(items[key]), deleted: true }
      return out
    })
  } catch (e) {
    return { ok: false, error: 'Could not delete it: ' + msgOf(e) }
  }
  refresh()
  return { ok: true, toast: 'Stage deleted.' }
}

/** Bring back a removed built-in stage, in its usual place (v145StageBack, v146). */
export async function bringBackStage(key: string): Promise<SetupResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!isStageKey(key)) return { ok: false, error: 'That is not a stage.' }
  const supabase = await createClient()
  const read = await readCatalyst()
  try {
    await patchSetting(supabase, 'catalyst_client_stages', user.email, (cur) => {
      const removed = (Array.isArray(cur.removed) ? (cur.removed as string[]) : []).filter((x) => x !== key)
      const base = Array.isArray(cur.order) && cur.order.length ? (cur.order as string[]) : stageRecs(read.config).map((r) => r.key)
      return { removed, order: backInPlace(base, key) }
    })
  } catch (e) {
    return { ok: false, error: 'Could not bring it back: ' + msgOf(e) }
  }
  refresh()
  return { ok: true, toast: 'Stage brought back.' }
}

// ---------- a stage's setup ----------

export type StageSetupInput = {
  name: string
  desc: string
  type: string
  also: string[]
  inputs: string
  before: string
  after: string
  template: string
  deliverables: string
  tasks: string
}

/** Save a stage's setup (v145StageSave). A built-in stage's name goes to `catalyst_stages`. */
export async function saveStageSetup(key: string, input: StageSetupInput): Promise<SetupResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const read = await readCatalyst()
  const rec = stageRec(read.config, String(key))
  if (!rec) return { ok: false, error: 'That stage is gone. Refresh the page.' }
  const name = nameOf(input?.name)
  if (!name) return { ok: false, error: 'Give the stage a name.' }
  if (stageRecs(read.config, true).some((r) => r.key !== rec.key && r.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: 'There is already a stage called ' + name + '.' }
  }
  const by = user.email
  const at = new Date().toISOString()
  const types = meetingTypes(read.config, true).map((t) => t.key)
  const item: CsItem = {
    desc: txt(input.desc),
    inputs: txt(input.inputs),
    before: txt(input.before),
    after: txt(input.after),
    template: txt(input.template, 2000),
    deliverables: lines(txt(input.deliverables, 2000)),
    tasks: lines(txt(input.tasks, 2000)),
    also: (Array.isArray(input.also) ? input.also : []).map(String).filter((k) => types.includes(k)).slice(0, 8),
    by,
    at,
  }
  if (!isStageKey(rec.key)) {
    item.name = name
    item.type = CUSTOM_TYPE.test(String(input.type ?? '')) && types.includes(String(input.type)) ? String(input.type) : ''
  }
  const supabase = await createClient()
  try {
    await patchSetting(supabase, 'catalyst_client_stages', by, (cur) => {
      const items = objOf(cur.items) as Record<string, CsItem>
      items[rec.key] = { ...objOf(items[rec.key]), ...item }
      return { items }
    })
    if (isStageKey(rec.key)) await patchSetting(supabase, 'catalyst_stages', by, () => ({ [rec.key]: nameEntry(rec.key, name, by, at) }))
  } catch (e) {
    return { ok: false, error: 'Could not save: ' + msgOf(e) }
  }
  refresh()
  return { ok: true, toast: name + ' saved.' }
}

// ---------- meeting types ----------

export type KbFile = { id: string; name: string }

/** The knowledge base files a meeting type can include (v145KbList): the newest 60 in the knowledge base. */
export async function kbFiles(): Promise<{ ok: true; files: KbFile[] } | { ok: false; error: string }> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  const supabase = await createClient()
  let r = await supabase.from('guide_files').select('id,file_name').eq('in_kb', true).order('created_at', { ascending: false }).limit(60)
  if (r.error) r = await supabase.from('guide_files').select('id,file_name').order('created_at', { ascending: false }).limit(60)
  if (r.error) return { ok: true, files: [] }
  return { ok: true, files: ((r.data ?? []) as Record<string, unknown>[]).map((f) => ({ id: String(f.id), name: String(f.file_name ?? '') || 'Untitled' })) }
}

export type TypeInfo = { files: KbFile[]; reads: { calls: boolean; crm: boolean; emails: boolean } }

/** What a meeting type's window needs besides the type (v145TypeOpen): the knowledge base files, and what it reads. */
export async function typeInfo(key: string): Promise<{ ok: true; info: TypeInfo } | { ok: false; error: string }> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  const [kb, saved] = await Promise.all([kbFiles(), readSetting(await createClient(), 'catalyst_stage_setup')])
  const k = String(key ?? '')
  const su = k ? setupOf(k, saved) : { calls: true, crm: true, emails: true }
  return { ok: true, info: { files: kb.ok ? kb.files : [], reads: { calls: su.calls, crm: su.crm, emails: su.emails } } }
}

export type TypeInput = {
  name: string
  doc: string
  desc: string
  sections: string
  kb: string
  /** the files ticked, and the ones the window listed (a file not listed stays, v146) */
  kbFiles: string[]
  shown: string[]
  reads: { calls: boolean; crm: boolean; emails: boolean } | null
}

/** Save a meeting type, or add one of the team's own (v145TypeSave, v146). */
export async function saveMeetingType(key: string, input: TypeInput): Promise<SetupResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const read = await readCatalyst()
  const k = String(key ?? '')
  if (k && !meetingType(read.config, k)) return { ok: false, error: 'That meeting type is gone. Refresh the page.' }
  const custom = !k || CUSTOM_TYPE.test(k)
  const name = nameOf(input?.name)
  const doc = nameOf(input?.doc)
  if (!name) return { ok: false, error: 'Give the meeting a name.' }
  if (custom && !doc) return { ok: false, error: 'Say what it writes, e.g. ' + name + ' brief.' }
  if (meetingTypes(read.config, true).some((t) => t.key !== k && t.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: 'There is already a meeting type called ' + name + '.' }
  }
  if (!custom && stageRecs(read.config, true).some((r) => r.key !== k && r.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: 'There is already a client stage called ' + name + '. Renaming this meeting renames its stage too.' }
  }
  const key2 = k || newKey('mt')
  const by = user.email
  const at = new Date().toISOString()
  const shown = (Array.isArray(input.shown) ? input.shown : []).map(String)
  const was = k ? (meetingType(read.config, k)?.kbFiles ?? []) : []
  const picked = (Array.isArray(input.kbFiles) ? input.kbFiles : []).map(String).filter((x) => /^[\w-]{1,80}$/.test(x))
  const item: MtItem = { name, desc: txt(input.desc), kb: txt(input.kb, 4000), kbFiles: [...was.filter((x) => !shown.includes(x)), ...picked].slice(0, 6), by, at }
  if (custom) {
    item.doc = doc
    item.sections = lines(txt(input.sections, 3000))
  }
  const supabase = await createClient()
  try {
    await patchSetting(supabase, 'catalyst_meeting_types', by, (cur) => {
      const items = objOf(cur.items) as Record<string, MtItem>
      items[key2] = { ...objOf(items[key2]), ...item }
      const out: Record<string, unknown> = { items }
      if (custom) out.order = [...(Array.isArray(cur.order) ? (cur.order as string[]) : []).filter((x) => x !== key2), key2]
      return out
    })
    if (key2 !== 'research' && input.reads) {
      const r = input.reads
      await patchSetting(supabase, 'catalyst_stage_setup', by, (cur) => ({
        [key2]: { ...objOf(cur[key2]), calls: !!r.calls, crm: !!r.crm, emails: !!r.emails, by, at },
      }))
    }
    if (!custom) await patchSetting(supabase, 'catalyst_stages', by, () => ({ [key2]: nameEntry(key2, name, by, at) }))
  } catch (e) {
    return { ok: false, error: 'Could not save: ' + msgOf(e) }
  }
  refresh()
  return { ok: true, key: key2, toast: k ? name + ' saved.' : name + ' added. Pick it in a client stage’s setup to run it.' }
}

/** Hide a built-in meeting type from the list, or show it again (v145TypeHide). */
export async function hideMeetingType(key: string, hide: boolean): Promise<SetupResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!isStageKey(key)) return { ok: false, error: 'Only a built-in meeting type can be hidden.' }
  try {
    await patchSetting(await createClient(), 'catalyst_meeting_types', user.email, (cur) => {
      const items = objOf(cur.items) as Record<string, MtItem>
      items[key] = { ...objOf(items[key]), hidden: !!hide }
      return { items }
    })
  } catch (e) {
    return { ok: false, error: 'Could not save: ' + msgOf(e) }
  }
  refresh()
  return { ok: true, toast: hide ? 'Hidden from the list. Its stage still runs it.' : 'Shown again.' }
}

/** Delete a meeting type of the team's own (v145TypeDel); the stages that ran it run nothing until another is picked. */
export async function deleteMeetingType(key: string): Promise<SetupResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!CUSTOM_TYPE.test(String(key))) return { ok: false, error: 'Only a meeting type of your own can be deleted.' }
  const read = await readCatalyst()
  const using = stageRecs(read.config, true).filter((r) => r.type === key)
  const supabase = await createClient()
  try {
    await patchSetting(supabase, 'catalyst_meeting_types', user.email, (cur) => {
      const items = objOf(cur.items) as Record<string, MtItem>
      items[key] = { ...objOf(items[key]), deleted: true }
      return { items, order: (Array.isArray(cur.order) ? (cur.order as string[]) : []).filter((x) => x !== key) }
    })
    if (using.length) {
      await patchSetting(supabase, 'catalyst_client_stages', user.email, (cur) => {
        const items = objOf(cur.items) as Record<string, CsItem>
        for (const r of using) items[r.key] = { ...objOf(items[r.key]), type: '' }
        return { items }
      })
    }
  } catch (e) {
    return { ok: false, error: 'Could not delete it: ' + msgOf(e) }
  }
  refresh()
  return { ok: true, toast: 'Meeting type deleted.' }
}

// ---------- a lead's stage checklist ----------

/** A tick on a lead's deliverables or workflow tasks, for the team (`catalyst_stage_ticks`, v145Tick). */
export async function tickStage(input: { email: string; stage: string; id: string; on: boolean }): Promise<SetupResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const email = String(input?.email ?? '')
  const stage = String(input?.stage ?? '')
  const id = String(input?.id ?? '')
  if (!email || email.length > 320 || !(isStageKey(stage) || CUSTOM_STAGE.test(stage)) || !/^[dt]:\d{1,2}$/.test(id)) {
    return { ok: false, error: 'That is not a checklist item.' }
  }
  try {
    await patchSetting(await createClient(), 'catalyst_stage_ticks', user.email, (cur) => {
      const e = objOf(cur[email])
      return { [email]: { ...e, [stage]: { ...objOf(e[stage]), [id]: !!input.on } } }
    })
  } catch (e) {
    return { ok: false, error: 'Could not save the tick: ' + msgOf(e) }
  }
  return { ok: true, toast: '' }
}
