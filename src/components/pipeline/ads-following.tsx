'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, Plus, Sparkles, Users, X } from 'lucide-react'
import { followForAds, saveAdsFollow, saveIndustries, setFollowFor, stopAds } from '@/app/(app)/ad-strategist/actions'
import { Dialog } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import {
  AD_TYPES, COUNTRIES, IND_MAX, KW_MAX, type AdsFollow, advertisers, chipClean, chipProblem, forAds, industryFrom, industryOf, libSearch, pageUrl,
} from '@/lib/pipeline/ad-strategist'
import { type Competitor, followFor, kindOf } from '@/lib/pipeline/intel'
import { Tag, btn, ghost, inputCls, linkCls, primary, selectCls } from './bits'
import type { ACtx } from './ads-view'

// The Ad Strategist's Following tab (v111FolHtml): the accounts whose ads it pulls, the searches and filters it runs
// (ai_settings ads_follow), and what each advertiser sells (ad_industries, ad_industries_ai), with the window that sets
// them (v96IndEditOpen).

const OFF = 'Could not reach the dashboard. Try again in a minute.'
const card = 'rounded-lg border border-line bg-panel p-4 shadow-card'
const kick = 'text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-text'
const head = 'font-display text-[19px] font-semibold text-ink'

export function FollowingTab({ ctx }: { ctx: ACtx }) {
  return (
    <div data-testid="following">
      <div className="mb-4 flex items-start gap-3 rounded-md border border-line bg-panel px-3 py-2.5 text-[14px] text-ink-2">
        <Users size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-accent-text" />
        <span>
          <b className="text-ink">Who and what the Ad Strategist reads.</b> Each run pulls the ads of the accounts below from the Meta Ad Library, scores them and
          builds the ads brief.
        </span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3.5">
        <Accounts ctx={ctx} />
        <Filters saved={ctx.data.adsFollow} />
        <Industries ctx={ctx} />
      </div>
    </div>
  )
}

// ---------- accounts ----------

/** Ads only, or Ads and posts (v111ForSeg). */
function ForSeg({ value, label, onPick, busy }: { value: 'ads' | 'both'; label: string; onPick: (f: 'ads' | 'both') => void; busy?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-panel p-0.5">
      {(
        [
          ['ads', 'Ads only'],
          ['both', 'Ads and posts'],
        ] as const
      ).map(([k, l]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          disabled={busy}
          onClick={() => value !== k && onPick(k)}
          className={`rounded-sm px-2.5 py-1 text-[12.5px] font-semibold ${value === k ? 'bg-action text-action-ink' : 'text-ink-2 hover:bg-sunk'}`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

function IndTag({ ctx, name }: { ctx: ACtx; name: string }) {
  const t = industryOf(ctx.data.ind, name)
  if (!t) return null
  const from = industryFrom(ctx.data.ind, name)
  return (
    <Tag gold={from === 'agent'} title={from === 'agent' ? 'Suggested by the agent' : 'Set by you'}>
      {t}
    </Tag>
  )
}

function Accounts({ ctx }: { ctx: ACtx }) {
  const { data } = ctx
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  if (data.followsError) {
    return (
      <section className={card} data-testid="fol-accounts">
        <p className={kick}>Accounts</p>
        <p role="alert" className="mt-1 text-[14px] text-bad">
          Could not read who you follow: {data.followsError}
        </p>
      </section>
    )
  }
  const rows = data.follows.filter((c) => c.status !== 'denied')
  const on = rows.filter(forAds)
  const off = rows.filter((c) => !forAds(c))

  const pick = async (c: Competitor, f: 'ads' | 'both' | 'posts') => {
    setBusy(c.id)
    const r = await setFollowFor({ id: c.id, f }).catch(() => ({ ok: false as const, error: OFF }))
    setBusy(null)
    if (!r.ok) return toast(r.error, 'warn')
    if (r.toast) toast(r.toast)
  }
  const stop = async (c: Competitor) => {
    const q =
      followFor(c) === 'ads'
        ? 'Stop following ' + (c.name || 'this account') + '? Neither agent reads them from the next run.'
        : 'Stop pulling ' + (c.name || 'this account') + '’s ads? The Intel Tracker still reads their posts.'
    if (!window.confirm(q)) return
    setBusy(c.id)
    const r = await stopAds({ id: c.id }).catch(() => ({ ok: false as const, error: OFF }))
    setBusy(null)
    if (!r.ok) return toast(r.error, 'warn')
    toast(r.toast)
  }

  return (
    <section className={card} data-testid="fol-accounts">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className={kick}>Accounts</p>
          <h3 className={head}>
            Followed for ads <span className="text-ink-3">{on.length}</span>
          </h3>
        </div>
        {!adding ? (
          <button type="button" className={btn} onClick={() => setAdding(true)}>
            <Plus size={14} aria-hidden="true" />
            Add an account
          </button>
        ) : null}
      </div>
      {adding ? <AddAccount onDone={() => setAdding(false)} /> : null}
      {on.length ? (
        <ul className="grid gap-2">
          {on.map((c) => {
            const f = followFor(c) === 'ads' ? 'ads' : 'both'
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-md bg-sunk px-3 py-2" data-testid="fol-acc" data-id={c.id}>
                <b className="text-[14px] text-ink">{c.name || 'Account'}</b>
                <Tag>{kindOf(c) === 'person' ? 'Person' : 'Company'}</Tag>
                <IndTag ctx={ctx} name={c.name} />
                <a href={pageUrl(c.metaPageId)} target="_blank" rel="noopener noreferrer" className={linkCls + ' text-[13px]'}>
                  Facebook page
                  <ArrowUpRight size={13} aria-hidden="true" />
                </a>
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  <ForSeg value={f} label={'What ' + (c.name || 'this account') + ' is followed for'} busy={busy === c.id} onPick={(x) => void pick(c, x)} />
                  <button type="button" className={ghost} disabled={busy === c.id} onClick={() => void stop(c)}>
                    {f === 'ads' ? 'Stop following' : 'Stop reading ads'}
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-[13.5px] text-ink-2">No account has a Facebook page yet, so the Ad Strategist has no ads to pull. Add one above.</p>
      )}
      {off.length ? (
        <details className="mt-3 rounded-md border border-line" data-testid="fol-posts-only">
          <summary className="cursor-pointer px-3 py-2 text-[14px]">
            <b className="text-ink">Followed for posts only</b> <span className="text-ink-3">{off.length}</span>
          </summary>
          <div className="border-t border-line px-3 py-2">
            <p className="mb-2 text-[13px] text-ink-3">The Intel Tracker reads these. Add a page or switch their ads on to pull their ads too.</p>
            <ul className="grid gap-2">
              {off.map((c) => (
                <PostsOnly key={c.id} ctx={ctx} c={c} busy={busy === c.id} onPull={() => void pick(c, 'both')} />
              ))}
            </ul>
          </div>
        </details>
      ) : null}
      <p className="mt-3 text-[13px] text-ink-3">Ads only: just the Ad Strategist reads them. Ads and posts: the Intel Tracker reads their posts too.</p>
    </section>
  )
}

function PostsOnly({ ctx, c, busy, onPull }: { ctx: ACtx; c: Competitor; busy: boolean; onPull: () => void }) {
  const [page, setPage] = useState('')
  const [saving, setSaving] = useState(false)
  const add = async () => {
    setSaving(true)
    const r = await followForAds({ id: c.id, name: c.name, page, kind: c.followKind, forWhat: 'ads' }).catch(() => ({ ok: false as const, error: OFF }))
    setSaving(false)
    if (!r.ok) return toast(r.error, 'warn')
    setPage('')
    toast(r.toast)
  }
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md bg-sunk px-3 py-2" data-testid="fol-off" data-id={c.id}>
      <b className="text-[14px] text-ink">{c.name || 'Account'}</b>
      <Tag>{kindOf(c) === 'person' ? 'Person' : 'Company'}</Tag>
      <IndTag ctx={ctx} name={c.name} />
      {c.metaPageId.trim() ? (
        <>
          <a href={pageUrl(c.metaPageId)} target="_blank" rel="noopener noreferrer" className={linkCls + ' text-[13px]'}>
            Facebook page
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
          <button type="button" className={btn + ' ml-auto'} disabled={busy} onClick={onPull}>
            Pull their ads too
          </button>
        </>
      ) : (
        <>
          <a href={libSearch(c.name)} target="_blank" rel="noopener noreferrer" className={linkCls + ' text-[13px]'}>
            Find in the Ad Library
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
          <span className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
            <input
              className={inputCls + ' w-[220px] max-w-full py-1.5 text-[13.5px]'}
              placeholder="Facebook page link"
              aria-label={'Facebook page for ' + (c.name || 'this account')}
              value={page}
              onChange={(e) => setPage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void add()
              }}
            />
            <button type="button" className={btn} disabled={saving} onClick={() => void add()}>
              {saving ? 'Adding…' : 'Add page'}
            </button>
          </span>
        </>
      )}
    </li>
  )
}

/** The add form (v111AccSave): what is typed stays when the follow fails. */
function AddAccount({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [page, setPage] = useState('')
  const [kind, setKind] = useState<'company' | 'person'>('company')
  const [forWhat, setForWhat] = useState<'ads' | 'both'>('ads')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => {
    first.current?.focus()
  }, [])
  const go = async () => {
    setErr('')
    setBusy(true)
    const r = await followForAds({ name, page, kind, forWhat }).catch(() => ({ ok: false as const, error: OFF }))
    setBusy(false)
    if (!r.ok) return setErr(r.error)
    onDone()
    toast(r.toast)
  }
  return (
    <div className="mb-3 rounded-md border border-line p-3" data-testid="add-account">
      <div className="grid grid-cols-1 gap-3 min-[641px]:grid-cols-2">
        <label className="grid gap-1 text-[13.5px] font-semibold text-ink">
          Name
          <input ref={first} className={inputCls} placeholder="e.g. ClickFunnels" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="grid gap-1 text-[13.5px] font-semibold text-ink">
          <span>
            Facebook page <small className="font-normal text-ink-3">link or page ID</small>
          </span>
          <input
            className={inputCls}
            placeholder="facebook.com/their-page"
            value={page}
            onChange={(e) => setPage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void go()
            }}
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        <div role="radiogroup" aria-label="Kind" className="inline-flex rounded-md border border-line bg-panel p-0.5">
          {(
            [
              ['company', 'Company'],
              ['person', 'Person or influencer'],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={`rounded-sm px-2.5 py-1 text-[12.5px] font-semibold ${kind === k ? 'bg-action text-action-ink' : 'text-ink-2 hover:bg-sunk'}`}
            >
              {l}
            </button>
          ))}
        </div>
        <ForSeg value={forWhat} label="Follow for" onPick={setForWhat} />
      </div>
      <p className="mt-2 text-[13px] text-ink-3">
        Not sure of the page?{' '}
        <a href={libSearch(name)} target="_blank" rel="noopener noreferrer" className={linkCls + ' text-[13px]'}>
          Find them in the Meta Ad Library
          <ArrowUpRight size={13} aria-hidden="true" />
        </a>{' '}
        and copy the page link from one of their ads.
      </p>
      {err ? (
        <p role="alert" className="mt-2 rounded-sm bg-bad-soft px-3 py-2 text-[13.5px] text-bad">
          {err}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button type="button" className={primary} disabled={busy} onClick={() => void go()}>
          {busy ? 'Saving…' : 'Follow'}
        </button>
        <button type="button" className={ghost} onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ---------- searches and filters ----------

function Chips({ list, max, ph, onAdd, onDrop }: { list: string[]; max: number; ph: string; onAdd: (v: string) => string; onDrop: (i: number) => void }) {
  const [v, setV] = useState('')
  const box = useRef<HTMLInputElement>(null)
  const add = () => {
    const problem = onAdd(v)
    if (problem === 'short') return box.current?.focus()
    if (!problem) {
      setV('')
      box.current?.focus()
    }
  }
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {list.length ? (
          list.map((x, i) => (
            <span key={x} className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft py-0.5 pr-1 pl-2.5 text-[13px] font-semibold text-accent-text">
              {x}
              <button type="button" aria-label={'Remove ' + x} onClick={() => onDrop(i)} className="grid h-5 w-5 place-items-center rounded-full hover:bg-panel">
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          ))
        ) : (
          <span className="text-[13px] text-ink-3">None yet</span>
        )}
      </div>
      <div className="flex max-w-[460px] gap-2">
        <input
          ref={box}
          className={inputCls + ' py-1.5 text-[14px]'}
          maxLength={60}
          placeholder={ph}
          aria-label={ph}
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
        />
        <button type="button" className={btn} disabled={list.length >= max} onClick={add}>
          <Plus size={14} aria-hidden="true" />
          Add
        </button>
      </div>
    </div>
  )
}

/** The searches and filters, a draft until Save (what the team saved shows on the next visit). */
function Filters({ saved }: { saved: AdsFollow }) {
  const [F, setF] = useState(saved)
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const change = (p: Partial<AdsFollow>) => {
    setF((x) => ({ ...x, ...p }))
    setDirty(true)
    setMsg('')
  }
  const adder = (key: 'keywords' | 'industries', max: number) => (raw: string) => {
    const v = chipClean(raw)
    if (v.length < 2) return 'short'
    const problem = chipProblem(F[key], v, max)
    if (problem) {
      setMsg(problem)
      return problem
    }
    change({ [key]: [...F[key], v] })
    return ''
  }
  const save = async () => {
    setBusy(true)
    const r = await saveAdsFollow({ keywords: F.keywords, industries: F.industries, types: F.types, active: F.active, country: F.country }).catch(() => ({
      ok: false as const,
      error: OFF,
    }))
    setBusy(false)
    if (!r.ok) return setMsg(r.error)
    setDirty(false)
    setMsg(r.toast)
    toast('Saved.')
  }
  return (
    <section className={card} data-testid="fol-filters">
      <p className={kick}>Searches and filters</p>
      <h3 className={head + ' mb-3'}>What else to look for</h3>
      <div className="grid gap-4">
        <div>
          <b className="mb-1.5 block text-[13.5px] text-ink">
            Topics and keywords <small className="font-normal text-ink-3">searched in the Meta Ad Library, up to {KW_MAX}</small>
          </b>
          <Chips
            list={F.keywords}
            max={KW_MAX}
            ph="e.g. AI automation"
            onAdd={adder('keywords', KW_MAX)}
            onDrop={(i) => change({ keywords: F.keywords.filter((_, j) => j !== i) })}
          />
        </div>
        <div>
          <b className="mb-1.5 block text-[13.5px] text-ink">
            Industries to watch <small className="font-normal text-ink-3">up to {IND_MAX}</small>
          </b>
          <Chips
            list={F.industries}
            max={IND_MAX}
            ph="e.g. Wealth management"
            onAdd={adder('industries', IND_MAX)}
            onDrop={(i) => change({ industries: F.industries.filter((_, j) => j !== i) })}
          />
        </div>
        <div>
          <b className="mb-1.5 block text-[13.5px] text-ink">
            Ad types <small className="font-normal text-ink-3">none picked means all of them</small>
          </b>
          <div className="flex flex-wrap gap-1.5">
            {AD_TYPES.map(([k, l]) => {
              const on = F.types.includes(k)
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => change({ types: AD_TYPES.map((t) => t[0]).filter((t) => (t === k ? !on : F.types.includes(t))) })}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[13px] font-semibold ${
                    on ? 'border-accent bg-accent-soft text-accent-text' : 'border-line bg-panel text-ink-2 hover:border-line-2'
                  }`}
                >
                  {on ? <Check size={13} aria-hidden="true" /> : null}
                  {l}
                </button>
              )
            })}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 min-[641px]:grid-cols-2">
          <div>
            <b className="mb-1.5 block text-[13.5px] text-ink">Which ads</b>
            <div role="radiogroup" aria-label="Which ads" className="inline-flex rounded-md border border-line bg-panel p-0.5">
              {(
                [
                  ['active', 'Running now'],
                  ['all', 'Running or stopped'],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={F.active === k}
                  onClick={() => change({ active: k })}
                  className={`rounded-sm px-2.5 py-1 text-[12.5px] font-semibold ${F.active === k ? 'bg-action text-action-ink' : 'text-ink-2 hover:bg-sunk'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <label className="grid gap-1.5">
            <b className="text-[13.5px] text-ink">
              Country <small className="font-normal text-ink-3">for the searches</small>
            </b>
            <select className={selectCls + ' w-fit'} value={F.country} onChange={(e) => change({ country: e.target.value })}>
              {COUNTRIES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-line pt-3">
        <span role="status" className="mr-auto text-[13.5px] text-ink-3" data-testid="fol-status">
          {msg || (dirty ? 'Not saved yet.' : 'The next run follows these.')}
        </span>
        <button type="button" className={primary} disabled={!dirty || busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </section>
  )
}

// ---------- industries ----------

function Industries({ ctx }: { ctx: ACtx }) {
  const names = advertisers(ctx.data.pool).sort((a, b) => a.localeCompare(b))
  const { busy, msg, missing } = ctx.ind
  return (
    <section className={card} data-testid="fol-industries">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className={kick}>Industries</p>
          <h3 className={head}>What each advertiser sells</h3>
        </div>
        <span className="flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={busy || !missing.length} onClick={ctx.ind.suggest}>
            <Sparkles size={14} aria-hidden="true" />
            {busy ? 'Working them out…' : 'Suggest the missing ones'}
          </button>
          <button type="button" className={ghost} onClick={ctx.openInd}>
            Edit
          </button>
        </span>
      </div>
      {msg ? (
        <p role="status" className="mb-3 text-[13.5px] text-ink-2">
          {msg}
        </p>
      ) : null}
      {names.length ? (
        <ul className="grid grid-cols-1 gap-2 min-[641px]:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]" data-testid="ind-list">
          {names.map((n) => {
            const t = industryOf(ctx.data.ind, n)
            const from = industryFrom(ctx.data.ind, n)
            return (
              <li key={n} className="grid gap-0.5 rounded-md bg-sunk px-3 py-2 text-[13.5px]">
                <b className="text-ink">{n}</b>
                <span className={t ? 'text-ink-2' : 'text-ink-3'}>{t || 'Not worked out yet'}</span>
                {from ? <small className="text-[12px] text-ink-3">{from === 'agent' ? 'Suggested by the agent' : 'Set by you'}</small> : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-[13.5px] text-ink-3">No ads yet, so no advertisers.</p>
      )}
    </section>
  )
}

/**
 * What industry is each advertiser in? (v96IndEditOpen with v111's suggestions): a box per advertiser, the agent's
 * suggestion filled in where nobody typed one. Only the boxes changed are saved, so a suggestion left alone stays the
 * agent's (the old window saved every one as the team's), and an emptied box takes the agent's away too.
 */
export function IndustriesDialog({ ctx, onClose, onSuggest }: { ctx: ACtx; onClose: () => void; onSuggest: () => void }) {
  const M = ctx.data.ind
  const names = advertisers(ctx.data.pool).sort((a, b) => a.localeCompare(b))
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(names.map((n) => [n, industryOf(M, n)])))
  const [changed, setChanged] = useState<Record<string, boolean>>({})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setErr('')
    const changes = Object.fromEntries(names.filter((n) => changed[n]).map((n) => [n, vals[n] ?? '']))
    setBusy(true)
    const r = await saveIndustries({ changes }).catch(() => ({ ok: false as const, error: OFF }))
    setBusy(false)
    if (!r.ok) return setErr(r.error)
    onClose()
    toast(r.toast)
  }
  return (
    <Dialog
      open
      onClose={onClose}
      kicker="Ad Strategist"
      title="What industry is each advertiser in?"
      width={620}
      footer={
        <>
          {ctx.ind.missing.length ? (
            <>
              <button type="button" className={btn} onClick={onSuggest} disabled={ctx.ind.busy}>
                <Sparkles size={14} aria-hidden="true" />
                Suggest the missing ones
              </button>
              <span className="grow" />
            </>
          ) : null}
          <button type="button" className={ghost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primary} disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <p className="mb-3 text-[14px] text-ink-2">Shown on the top ads and on every ad, and you can filter by it. The agent suggests them; what you type here wins.</p>
      {names.length ? (
        <div className="grid max-h-[52vh] grid-cols-1 gap-3 overflow-y-auto pr-1 min-[561px]:grid-cols-2" data-testid="ind-edit">
          {names.map((n) => {
            const agent = !changed[n] && industryFrom(M, n) === 'agent'
            return (
              <label key={n} className="grid gap-1 text-[13.5px] font-semibold text-ink">
                {n}
                <input
                  className={inputCls + (agent ? ' border-accent bg-accent-soft' : '')}
                  maxLength={80}
                  placeholder="e.g. Payroll software"
                  value={vals[n] ?? ''}
                  onChange={(e) => {
                    setVals((x) => ({ ...x, [n]: e.target.value }))
                    setChanged((x) => ({ ...x, [n]: true }))
                  }}
                />
                {agent ? <small className="font-normal text-accent-text">Suggested by the agent</small> : null}
              </label>
            )
          })}
        </div>
      ) : (
        <p className="text-[14px] text-ink-3">No advertisers on this run yet.</p>
      )}
      {err ? (
        <p role="alert" className="mt-3 rounded-sm bg-bad-soft px-3 py-2 text-[13.5px] text-bad">
          {err}
        </p>
      ) : null}
    </Dialog>
  )
}
