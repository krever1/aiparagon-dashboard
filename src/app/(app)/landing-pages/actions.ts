'use server'

import { randomInt } from 'node:crypto'
import { refresh } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { arr, json } from '@/lib/pipeline/intel'
import {
  type Approval, type Content, type EditInput, type Kind, type Status, SLUG_TAKEN, SLUG_WORDS, adsApproved, approvalOf, approvedStatus, contentFrom,
  goLiveProblem, isKind, leftOut, okSlug, packageName, pageCode, pageFrom, pageOf, slugFree, slugOf,
} from '@/lib/pipeline/landing'
import { createClient } from '@/lib/supabase/server'

// What the Landing pages page saves, as the signed-in teammate (v115 and v120 in the current dashboard): a page made
// from a funnel's package or a book-a-call campaign, its words and settings, going live (which approves the campaign
// behind it), pausing, and deleting a draft that never went live.

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const SIGNED_OUT = 'You are signed out. Sign in again.'
const ID = /^[\w-]{1,64}$/
type Row = Record<string, unknown>
type Supa = Awaited<ReturnType<typeof createClient>>

export type Choice = { id: string; name: string; kind: Kind; createdAt: string; approval: Approval; page: { id: string; status: Status } | null }

/** The campaigns' ad images each with its newest decision, for book-a-call campaigns not approved by their status. */
async function adsOk(supabase: Supa, runs: string[]): Promise<Record<string, boolean>> {
  if (!runs.length) return {}
  const { data: outs } = await supabase
    .from('agent_outputs')
    .select('run_id,data,created_at')
    .eq('agent', 'low_ticket_content')
    .in('run_id', runs)
    .order('created_at', { ascending: false })
    .limit(80)
  const newest: Record<string, unknown> = {}
  for (const o of (outs ?? []) as Row[]) if (!(str(o.run_id) in newest)) newest[str(o.run_id)] = json(o.data).ad_images
  const files = Object.values(newest).flatMap((imgs) => arr(imgs).map((i) => str(json(i).file)).filter(Boolean))
  const decisions: Record<string, string> = {}
  if (files.length) {
    const { data: fb } = await supabase
      .from('agent_feedback')
      .select('target_id,action,created_at')
      .eq('target_type', 'ad_image_variant')
      .in('target_id', files)
      .order('created_at', { ascending: false })
      .limit(400)
    for (const f of (fb ?? []) as Row[]) if (!(str(f.target_id) in decisions)) decisions[str(f.target_id)] = str(f.action)
  }
  return Object.fromEntries(runs.map((r) => [r, adsApproved(newest[r], decisions)]))
}

/** What can be put live (v115LpNew): the 40 newest packages, where each stands, and the page one already has. */
export async function pickerChoices(): Promise<{ ok: true; choices: Choice[] } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const supabase = await createClient()
  const [fp, lp] = await Promise.all([
    supabase.from('funnel_packages').select('id,run_id,funnel_type,status,setup,created_at').order('created_at', { ascending: false }).limit(40),
    supabase.from('landing_pages').select('id,status,source_id').eq('source_type', 'funnel_package').limit(1000),
  ])
  const err = fp.error || lp.error
  if (err) return { ok: false, error: 'Could not load them: ' + err.message }
  const pkgs = (fp.data ?? []) as Row[]
  const pages = (lp.data ?? []) as Row[]
  const waiting = pkgs.filter((f) => !f.funnel_type && !approvedStatus(f.status)).map((f) => str(f.run_id)).filter(Boolean)
  const ok = await adsOk(supabase, [...new Set(waiting)])
  return {
    ok: true,
    choices: pkgs.map((f) => {
      const has = pages.find((p) => str(p.source_id) === str(f.id))
      return {
        id: str(f.id),
        name: packageName(f),
        kind: isKind(f.funnel_type) ? f.funnel_type : 'book_call',
        createdAt: str(f.created_at),
        approval: approvalOf({ funnel_type: f.funnel_type, status: f.status }, !!ok[str(f.run_id)]),
        page: has ? { id: str(has.id), status: (['live', 'paused'].includes(str(has.status)) ? str(has.status) : 'draft') as Status } : null,
      }
    }),
  }
}

/** A page from a package (v115LpFromPkg): its page if it has one, else a new draft with a code for its ads. */
export async function makePage(input: { id: string; tz?: string }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const id = str(input?.id)
  if (!ID.test(id)) return { ok: false, error: 'Could not make the page: that funnel is gone' }
  const supabase = await createClient()
  const [one, has] = await Promise.all([
    supabase.from('funnel_packages').select('*').eq('id', id).limit(1),
    supabase.from('landing_pages').select('id').eq('source_type', 'funnel_package').eq('source_id', id).limit(1),
  ])
  if (one.error) return { ok: false, error: 'Could not make the page: ' + one.error.message }
  const existing = ((has.data ?? []) as Row[])[0]
  if (existing) return { ok: true, id: str(existing.id) }
  const pkg = ((one.data ?? []) as Row[])[0]
  if (!pkg) return { ok: false, error: 'Could not make the page: that funnel is gone' }
  let tz = str(input?.tz)
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz || undefined })
  } catch {
    tz = ''
  }
  const x = pageFrom(pkg, tz || undefined)
  const code = pageCode(() => randomInt(0, 1 << 30) / (1 << 30))
  const { data: slugRows } = await supabase.from('landing_pages').select('slug').limit(5000)
  const taken = ((slugRows ?? []) as Row[]).map((r) => str(r.slug))
  const base = slugOf(x.title)
  // a page made meanwhile with the same address: the next one along
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = {
      slug: slugFree(base, taken),
      title: x.title,
      status: 'draft',
      kind: x.kind,
      source_type: 'funnel_package',
      source_id: str(pkg.id),
      source_run: str(pkg.run_id) || null,
      content: { ...x.content, flags: x.flags },
      ads: x.ads.map((a) => ({ code: code + '-A' + a.n, ...a })),
      add_to_pipeline: x.kind !== 'newsletter_signup',
      created_by: user.email,
      updated_by: user.email,
    }
    const { data, error } = await supabase.from('landing_pages').insert(row).select('id')
    if (!error && data?.[0]) {
      refresh()
      return { ok: true, id: str((data[0] as Row).id) }
    }
    if (error?.code === '23505') {
      taken.push(row.slug)
      continue
    }
    return { ok: false, error: 'Could not make the page: ' + (error?.message ?? 'nothing came back') }
  }
  return { ok: false, error: 'Could not make the page: ' + SLUG_TAKEN }
}

export type SaveInput = {
  id: string
  title: string
  slug: string
  boxes: EditInput
  add: boolean
  /** live or paused; none keeps the page as it is */
  status: 'live' | 'paused' | null
  /** "I checked these" */
  checked: boolean
  /** the second click on Approve and put it live */
  approve: boolean
}

export type Saved =
  | { ok: true; slug: string; status: Status; approvedNow: boolean; left: number; ads: number }
  | { ok: false; error: string; ask?: 'sent_back' | 'not_approved' }

/** The campaign behind a page, read fresh (v120Camp): whether it is approved, and whether it was sent back. */
async function campaignOf(supabase: Supa, sourceId: string) {
  if (!sourceId) return null
  const { data, error } = await supabase.from('funnel_packages').select('id,run_id,funnel_type,status').eq('id', sourceId).limit(1)
  if (error) throw new Error(error.message)
  const f = ((data ?? []) as Row[])[0]
  if (!f) return null
  let ok = approvedStatus(f.status)
  if (!ok && !f.funnel_type && str(f.run_id)) ok = !!(await adsOk(supabase, [str(f.run_id)]))[str(f.run_id)]
  return { f, ok, sentBack: !!f.funnel_type && str(f.status) === 'draft' }
}

/**
 * Save a page (v115LpSave): its address checked, its boxes read back, the checks before it goes (or stays) live, the
 * campaign approved on its way live (v120: the first click asks, the second approves), then the page itself.
 */
export async function savePage(input: SaveInput): Promise<Saved> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const id = str(input?.id)
  if (!ID.test(id)) return { ok: false, error: 'That is not a page.' }
  const status = input?.status === 'live' || input?.status === 'paused' ? input.status : null
  const slug = str(input?.slug).trim().toLowerCase()
  if (!okSlug(slug)) return { ok: false, error: SLUG_WORDS }
  const supabase = await createClient()
  const { data: rows, error } = await supabase.from('landing_pages').select('*').eq('id', id).limit(1)
  if (error) return { ok: false, error: 'Could not save: ' + error.message }
  const row = ((rows ?? []) as Row[])[0]
  if (!row) return { ok: false, error: 'Could not save: the page is gone' }
  const p = pageOf(row)
  const { data: clash } = await supabase.from('landing_pages').select('id').eq('slug', slug).neq('id', id).limit(1)
  if ((clash ?? []).length) return { ok: false, error: SLUG_TAKEN }

  const boxes = input?.boxes ?? ({} as EditInput)
  const c: Content = contentFrom(p.content, boxes)
  const left = leftOut(arr(boxes.sections).map((s) => ({ title: str(json(s).title), body: str(json(s).body) })), arr(boxes.faq).map((f) => ({ q: str(json(f).q), a: str(json(f).a) })))
  const goingLive = status === 'live' || (!status && p.status === 'live')
  if (goingLive) {
    const problem = goLiveProblem(c, p.kind, !!input?.checked)
    if (problem) return { ok: false, error: problem }
  }

  let approvedNow = false
  if (status === 'live') {
    let camp: Awaited<ReturnType<typeof campaignOf>> = null
    try {
      camp = await campaignOf(supabase, str(row.source_type) === 'funnel_package' ? str(row.source_id) : '')
    } catch (e) {
      return { ok: false, error: 'Could not check the campaign behind this page: ' + (e instanceof Error ? e.message : String(e)) }
    }
    if (camp && !camp.ok) {
      if (!input?.approve) {
        return {
          ok: false,
          ask: camp.sentBack ? 'sent_back' : 'not_approved',
          error: camp.sentBack
            ? 'This campaign was sent back for changes. Putting the page live approves it anyway.'
            : 'This campaign is not approved yet. Putting the page live approves it.',
        }
      }
      const now = new Date().toISOString()
      const { data: done, error: e2 } = await supabase.from('funnel_packages').update({ status: 'approved', updated_at: now }).eq('id', str(camp.f.id)).select('id')
      if (e2 || !done?.length) return { ok: false, error: 'Could not approve the campaign, so the page did not go live: ' + (e2?.message ?? 'Supabase did not save it') }
      // a record of who approved it and how (errors here do not undo the approval, as before)
      await supabase.from('agent_feedback').insert({
        agent: camp.f.funnel_type ? 'funnel_builder' : 'low_ticket_content',
        target_type: 'funnel_package',
        target_id: str(camp.f.id),
        action: 'approved',
        feedback: 'Approved by putting its landing page live (/go/' + slug + ')',
        author: user.email,
      })
      approvedNow = true
    }
  }

  const now = new Date().toISOString()
  const body: Row = {
    title: (str(input?.title).trim() || p.title).slice(0, 120),
    slug,
    content: c,
    add_to_pipeline: input?.add !== false,
    updated_by: user.email,
    updated_at: now,
  }
  if (status) body.status = status
  if (status === 'live' && !p.publishedAt) body.published_at = now
  const { data: saved, error: e3 } = await supabase.from('landing_pages').update(body).eq('id', id).select('id,slug,status')
  if (e3) return { ok: false, error: e3.code === '23505' || /duplicate/i.test(e3.message) ? SLUG_TAKEN : 'Could not save: ' + e3.message }
  const s = ((saved ?? []) as Row[])[0]
  if (!s) return { ok: false, error: 'Could not save: nothing came back' }
  refresh()
  const st = str(s.status)
  return { ok: true, slug: str(s.slug), status: st === 'live' || st === 'paused' ? st : 'draft', approvedNow, left, ads: p.ads.length }
}

/** Delete a draft that never went live (v115LpDel); the database keeps any other page. */
export async function deletePage(input: { id: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const id = str(input?.id)
  if (!ID.test(id)) return { ok: false, error: 'Could not delete it: that is not a page' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('landing_pages').delete().eq('id', id).eq('status', 'draft').is('published_at', null).select('id')
  if (error) return { ok: false, error: 'Could not delete it: ' + error.message }
  // the old page said Deleted even when nothing went (a page that went live meanwhile)
  if (!data?.length) return { ok: false, error: 'Could not delete it: only a draft that has never been live can be deleted' }
  refresh()
  return { ok: true }
}
