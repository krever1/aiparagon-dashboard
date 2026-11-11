'use client'

import { useEffect, useRef, useState } from 'react'
import { Building2, Check, ChevronDown, Plus, X } from 'lucide-react'
import { followAdd, followSet, saveFocus, saveIndustry, termAdd, termRemove } from '@/app/(app)/intel-tracker/actions'
import { Dialog } from '@/components/ui/dialog'
import { dayText } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import {
  type Competitor, FOCUS_CATS, FOCUS_THEMES, type Focus, TERMS_MAX, type Terms, focusAddProblem, focusClean, followFor, kindOf, linksOf, termsFlat,
  themeLabel,
} from '@/lib/pipeline/intel'
import { btn, ghost, inputCls, linkCls, primary } from './bits'
import { InfoButton } from './intel-info'
import type { Ctx } from './intel-view'

// The Following tab: the industry it reads for (nwIntelIndHtml, e9IndEdit), what it tracks (nwFocusHtml), and who and
// what it reads (v96FollowRender as v111 left it: accounts followed for ads only sit apart, with Read their posts too).

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s)
const who = (e: string) => e.split('@')[0]

export function FollowingTab({ ctx }: { ctx: Ctx }) {
  const { data } = ctx
  const [ind, setInd] = useState(false)
  const p = data.profile
  return (
    <div data-testid="following" className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-panel px-3 py-2.5 text-[14px] text-ink-2" data-testid="reads-for">
        <Building2 size={17} aria-hidden="true" className="text-ink-3" />
        <span>
          Reads for <b className="text-ink">{p.industry || 'no industry set yet'}</b>
          {p.targetMarket ? ', selling to ' + clip(p.targetMarket, 140) : ''}.
        </span>
        <button type="button" className={linkCls + ' ml-auto'} onClick={() => setInd(true)}>
          Change
        </button>
      </div>
      <FocusCard key={JSON.stringify(data.focus)} focus={data.focus} />
      <Follows ctx={ctx} />
      {ind ? <IndustryDialog industry={p.industry} market={p.targetMarket} onClose={() => setInd(false)} /> : null}
    </div>
  )
}

// ---------- the industry it reads for ----------

function IndustryDialog({ industry, market, onClose }: { industry: string; market: string; onClose: () => void }) {
  const [i, setI] = useState(industry)
  const [a, setA] = useState(market)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => {
    first.current?.focus()
  }, [])
  const save = async () => {
    if (!i.trim()) return setErr('Add the industry.')
    setBusy(true)
    const r = await saveIndustry({ industry: i, targetMarket: a }).catch(() => ({ ok: false as const, error: 'Could not save: the dashboard could not be reached' }))
    setBusy(false)
    if (!r.ok) return setErr(r.error)
    onClose()
    toast(r.toast)
  }
  return (
    <Dialog
      open
      onClose={onClose}
      kicker="Pipeline · market reading"
      title="What industry is this run for?"
      width={560}
      footer={
        <>
          <button type="button" className={ghost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primary} disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <p className="mb-3 text-[14px] text-ink-2">The Intel Tracker and the Ad Strategist judge what matters through this. Changes apply from the next run.</p>
      <label className="mb-3 block">
        <span className="mb-1 block text-[13.5px] font-semibold text-ink">Industry</span>
        <input ref={first} className={inputCls} value={i} onChange={(e) => setI(e.target.value)} placeholder="e.g. AI consulting for wealth management firms" />
      </label>
      <label className="block">
        <span className="mb-1 block text-[13.5px] font-semibold text-ink">Who you sell to</span>
        <textarea className={inputCls} rows={2} value={a} onChange={(e) => setA(e.target.value)} placeholder="e.g. Growth-stage RIAs and independent advisory firms" />
      </label>
      <p className="mt-3 text-[13px] text-ink-3">The people, companies, topics, technologies and industries it searches are on the Following tab.</p>
      {err ? (
        <p role="alert" className="mt-2 text-[13.5px] font-semibold text-bad">
          {err}
        </p>
      ) : null}
    </Dialog>
  )
}

// ---------- what it tracks ----------

function FocusCard({ focus }: { focus: Focus }) {
  const [F, setF] = useState(() => ({ themes: focus.themes, custom: focus.custom, cats: focus.cats }))
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [add, setAdd] = useState('')
  const box = useRef<HTMLInputElement>(null)
  const change = (next: typeof F) => {
    setF(next)
    setDirty(true)
    setMsg('')
  }
  const toggleTheme = (t: string) => {
    const on = F.themes.includes(t)
    change({ ...F, themes: FOCUS_THEMES.filter((x) => (x === t ? !on : F.themes.includes(x))) })
  }
  const toggleCat = (c: string) => {
    const on = F.cats.includes(c)
    if (on && F.cats.length === 1) return setMsg('Keep at least one category.')
    change({ ...F, cats: FOCUS_CATS.map((x) => x[0]).filter((x) => (x === c ? !on : F.cats.includes(x))) })
  }
  const addTheme = () => {
    const problem = focusAddProblem(F, add)
    if (problem) {
      setMsg(problem)
      box.current?.focus()
      return
    }
    change({ ...F, custom: [...F.custom, focusClean(add)] })
    setAdd('')
    box.current?.focus()
  }
  const save = async () => {
    if (!F.themes.length && !F.custom.length) return setMsg('Keep at least one theme.')
    setBusy(true)
    const r = await saveFocus({ themes: F.themes, custom: F.custom, categories: F.cats }).catch(() => ({ ok: false as const, error: 'Could not save: the dashboard could not be reached' }))
    setBusy(false)
    if (!r.ok) return setMsg(r.error)
    setDirty(false)
    setMsg('Saved. Changes apply from the next run.')
    toast(r.toast)
  }
  const chip = (on: boolean, label: string, click: () => void) => (
    <button
      key={label}
      type="button"
      aria-pressed={on}
      onClick={click}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12.5px] font-semibold ${on ? 'border-accent bg-accent-soft text-accent-text' : 'border-line bg-panel text-ink-2 hover:border-line-2'}`}
    >
      {on ? <Check size={13} aria-hidden="true" /> : null}
      {label}
    </button>
  )
  return (
    <section className="rounded-lg border border-line bg-panel p-4 shadow-card" data-testid="focus">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-text">What it tracks</p>
          <h3 className="mt-0.5 font-display text-[18px] font-semibold text-ink">Themes and categories</h3>
        </div>
        <span className="text-[13px] text-ink-3">Only posts in these make the organic brief</span>
      </div>
      <p className="mb-1.5 text-[13.5px] font-semibold text-ink">Themes</p>
      <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Themes">
        {FOCUS_THEMES.map((t) => chip(F.themes.includes(t), themeLabel(t), () => toggleTheme(t)))}
        {F.custom.map((c, i) => (
          <span key={c} className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft py-1 pl-2.5 pr-1 text-[12.5px] font-semibold text-accent-text">
            <Check size={13} aria-hidden="true" />
            {c}
            <button
              type="button"
              aria-label={'Remove ' + c}
              title="Remove"
              onClick={() => change({ ...F, custom: F.custom.filter((_, j) => j !== i) })}
              className="grid h-5 w-5 place-items-center rounded-full hover:bg-panel"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <div className="mb-4 flex max-w-[520px] gap-2">
        <input
          ref={box}
          className={inputCls + ' py-1.5 text-[13.5px]'}
          maxLength={40}
          placeholder="Add a theme, for example succession planning"
          aria-label="Add a theme"
          value={add}
          onChange={(e) => setAdd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTheme()
            }
          }}
        />
        <button type="button" className={btn} onClick={addTheme}>
          <Plus size={14} aria-hidden="true" />
          Add
        </button>
      </div>
      <p className="mb-1.5 text-[13.5px] font-semibold text-ink">Organic categories</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Organic categories">
        {FOCUS_CATS.map(([k, l]) => chip(F.cats.includes(k), l, () => toggleCat(k)))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <span className="text-[13px] text-ink-3" data-testid="focus-msg" role="status">
          {msg || (dirty ? 'Not saved yet.' : focus.saved ? 'Saved. Changes apply from the next run.' : 'Tracking every theme and category until you change them.')}
        </span>
        <span className="grow" />
        <button type="button" className={primary} disabled={!dirty || busy} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </section>
  )
}

// ---------- who and what it reads ----------

const TERM: Record<keyof Terms, { l: string; hint: string; ph: string }> = {
  topics: { l: 'Topics', hint: 'Subjects to listen for', ph: 'e.g. AI governance' },
  tech: { l: 'Technologies', hint: 'Tools and platforms', ph: 'e.g. Microsoft Copilot' },
  industries: { l: 'Industries', hint: 'Markets to watch', ph: 'e.g. Wealth management' },
}

function Follows({ ctx }: { ctx: Ctx }) {
  const { data, tz } = ctx
  const [add, setAdd] = useState<'person' | 'company' | null>(null)
  const [termErr, setTermErr] = useState('')
  const rows = data.follow.rows
  const T = data.follow.terms
  const L = { read: data.schedule.read, keep: data.schedule.keep }
  const on = rows.filter((c) => c.status !== 'denied')
  const off = rows.filter((c) => c.status === 'denied')
  const ads = on.filter((c) => followFor(c) === 'ads')
  const reads = on.filter((c) => followFor(c) !== 'ads')
  const ppl = reads.filter((c) => kindOf(c) === 'person')
  const cos = reads.filter((c) => kindOf(c) !== 'person')
  const anyPpl = on.some((c) => kindOf(c) === 'person')
  const anyCos = on.some((c) => kindOf(c) !== 'person')

  const act = async (c: Competitor, change: 'stop' | 'again' | 'kind' | 'posts') => {
    if (change === 'stop') {
      const both = !!c.metaPageId.trim() && followFor(c) !== 'posts'
      const q = both
        ? 'Stop following ' + (c.name || 'this one') + '? From the next run neither agent reads them, posts or ads. To keep pulling only their ads, choose Ads only on the Ad Strategist’s Following tab.'
        : 'Stop following ' + (c.name || 'this one') + '? Their posts are no longer read from the next run. You can follow them again any time.'
      if (!window.confirm(q)) return
    }
    const r = await followSet({ id: c.id, change }).catch(() => ({ ok: false as const, error: 'Could not save: the dashboard could not be reached' }))
    if (!r.ok) return toast(r.error, 'warn')
    toast(r.toast)
  }
  const termGo = async (kind: keyof Terms, input: HTMLInputElement) => {
    const v = input.value.replace(/\s+/g, ' ').trim()
    if (!v) return input.focus()
    setTermErr('')
    input.disabled = true
    const r = await termAdd({ kind, value: v }).catch(() => ({ ok: false as const, error: 'Could not save: the dashboard could not be reached' }))
    input.disabled = false
    if (!r.ok) return setTermErr(r.error)
    input.value = ''
    toast(r.toast)
  }
  const termDel = async (kind: keyof Terms, v: string) => {
    const r = await termRemove({ kind, value: v }).catch(() => ({ ok: false as const, error: 'Could not save: the dashboard could not be reached' }))
    if (!r.ok) return toast(r.error, 'warn')
    toast(r.toast)
  }

  const row = (c: Competitor, stopped = false) => {
    const links = linksOf(c)
    const industry = data.follow.industries[c.name.trim().toLowerCase()]
    return (
      <li key={c.id} className="flex flex-wrap items-center gap-2 border-t border-line px-1 py-2.5 first:border-0" data-testid="follow-row" data-id={c.id}>
        <div className="min-w-0 grow">
          <b className="text-[14px] text-ink">{c.name || 'Unnamed'}</b>
          {industry ? <span className="ml-2 rounded-sm bg-sunk px-1.5 py-0.5 text-[11.5px] font-semibold text-ink-2">{industry}</span> : null}
          <small className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-ink-3">
            {links.length ? (
              links.map((l) => (
                <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline">
                  {l.label} ↗
                </a>
              ))
            ) : (
              <span>web search only</span>
            )}
            {c.createdAt ? <span>added {dayText(c.createdAt, tz) + (c.addedBy ? ' by ' + who(c.addedBy) : '')}</span> : null}
          </small>
        </div>
        {stopped ? (
          <button type="button" className={btn} onClick={() => void act(c, 'again')}>
            Follow again
          </button>
        ) : (
          <span className="flex shrink-0 gap-1">
            <button type="button" className={ghost} title={'Move to ' + (kindOf(c) === 'person' ? 'companies' : 'people')} onClick={() => void act(c, 'kind')}>
              {kindOf(c) === 'person' ? 'Move to companies' : 'Move to people'}
            </button>
            <button type="button" className={ghost} title={'Stop following ' + c.name} onClick={() => void act(c, 'stop')}>
              Stop following
            </button>
          </span>
        )}
      </li>
    )
  }

  const col = (k: keyof Terms) => (
    <div key={k} className="min-w-0" data-testid={'terms-' + k}>
      <b className="block text-[14px] text-ink">{TERM[k].l}</b>
      <small className="block text-[12.5px] text-ink-3">{TERM[k].hint}</small>
      <div className="my-2 flex flex-wrap gap-1.5">
        {T[k].length ? (
          T[k].map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-sunk py-0.5 pl-2.5 pr-1 text-[12.5px] font-semibold text-ink-2">
              {t}
              <button type="button" aria-label={'Remove ' + t} onClick={() => void termDel(k, t)} className="grid h-5 w-5 place-items-center rounded-full hover:bg-line">
                ×
              </button>
            </span>
          ))
        ) : (
          <span className="text-[13px] text-ink-3">None yet</span>
        )}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const input = (e.currentTarget.elements.namedItem('term') as HTMLInputElement) ?? null
          if (input) void termGo(k, input)
        }}
      >
        <input name="term" maxLength={80} placeholder={TERM[k].ph} aria-label={'Add to ' + TERM[k].l.toLowerCase()} className={inputCls + ' py-1.5 text-[13.5px]'} />
        <button type="submit" className={btn}>
          Add
        </button>
      </form>
    </div>
  )

  return (
    <section className="rounded-lg border border-line bg-panel p-4 shadow-card" data-testid="follows">
      <h3 className="font-display text-[18px] font-semibold text-ink">
        Who and what the Intel Tracker reads
        <InfoButton k="folint" L={L} />
      </h3>
      {data.follow.error ? (
        <p role="alert" className="mt-2 text-[13.5px] font-semibold text-bad">
          Could not load the follow list: {data.follow.error}
        </p>
      ) : null}
      <div className="mt-3 grid grid-cols-1 gap-4 min-[861px]:grid-cols-2">
        {(
          [
            ['People', ppl, 'person', anyPpl, 'No people yet. Add someone whose posts are worth reading and replying to.', '+ Add a person'],
            ['Companies', cos, 'company', anyCos, 'No companies yet.', '+ Add a company'],
          ] as const
        ).map(([title, list, kind, any, none, label]) => (
          <section key={kind} className="rounded-md border border-line p-3" data-testid={'follow-' + kind}>
            <div className="mb-1 flex items-center gap-2">
              <b className="text-[14.5px] text-ink">{title}</b>
              <span className="text-[13px] text-ink-3">{list.length}</span>
              <span className="grow" />
              <button type="button" className={btn} onClick={() => setAdd(kind)}>
                {label}
              </button>
            </div>
            {list.length ? <ul>{list.map((c) => row(c))}</ul> : <p className="py-2 text-[13.5px] text-ink-3">{any ? 'None here yet.' : none}</p>}
          </section>
        ))}
      </div>
      {ads.length ? (
        <details className="group mt-3 rounded-md border border-line" data-testid="ads-only">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[14px] font-semibold text-ink">
            Followed for ads only ({ads.length})
            <ChevronDown size={16} aria-hidden="true" className="transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t border-line px-3 py-2">
            <p className="text-[13px] text-ink-3">The Ad Strategist pulls their ads. Their posts are left out here.</p>
            <ul>
              {ads.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 border-t border-line py-2 first:border-0">
                  <div className="min-w-0 grow">
                    <b className="text-[14px] text-ink">{c.name || 'Unnamed'}</b>
                    {c.metaPageId ? (
                      <a href={'https://www.facebook.com/' + c.metaPageId} target="_blank" rel="noopener noreferrer" className="ml-2 text-[12.5px] text-accent-text hover:underline">
                        Facebook ↗
                      </a>
                    ) : null}
                  </div>
                  <button type="button" className={btn} onClick={() => void act(c, 'posts')}>
                    Read their posts too
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </details>
      ) : null}
      <section className="mt-4 border-t border-line pt-4" data-testid="terms">
        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          <b className="text-[14.5px] text-ink">Topics, technologies and industries</b>
          <small className="text-[12.5px] text-ink-3">
            {termsFlat(T).length} of {TERMS_MAX} searches used
          </small>
        </div>
        <div className="grid grid-cols-1 gap-4 min-[861px]:grid-cols-3">{(['topics', 'tech', 'industries'] as const).map(col)}</div>
        <p className="mt-3 text-[13px] text-ink-3">
          Each one is searched on LinkedIn and the web every run, up to {TERMS_MAX} in total. To follow a person or company directly, add them above with
          their LinkedIn link.
        </p>
        {termErr ? (
          <p role="alert" className="mt-2 text-[13.5px] font-semibold text-bad">
            {termErr}
          </p>
        ) : null}
      </section>
      {off.length ? (
        <details className="group mt-3 rounded-md border border-line" data-testid="stopped">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[14px] font-semibold text-ink">
            Stopped following ({off.length})
            <ChevronDown size={16} aria-hidden="true" className="transition-transform group-open:rotate-180" />
          </summary>
          <ul className="border-t border-line px-3">{off.map((c) => row(c, true))}</ul>
        </details>
      ) : null}
      {add ? <FollowDialog kind={add} onClose={() => setAdd(null)} /> : null}
    </section>
  )
}

function FollowDialog({ kind, onClose }: { kind: 'person' | 'company'; onClose: () => void }) {
  const P = kind === 'person'
  const [v, setV] = useState({ name: '', linkedin: '', x: '', website: '', notes: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => {
    first.current?.focus()
  }, [])
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((x) => ({ ...x, [k]: e.target.value }))
  const go = async () => {
    if (!v.name.trim()) return setErr('Add a name.')
    setBusy(true)
    const r = await followAdd({ kind, ...v }).catch(() => ({ ok: false as const, error: 'Could not save: the dashboard could not be reached' }))
    setBusy(false)
    if (!r.ok) return setErr(r.error)
    onClose()
    toast(r.toast)
  }
  const field = (k: keyof typeof v, label: string, ph: string, opt = false, max = 200) => (
    <label className="mb-3 block">
      <span className="mb-1 block text-[13.5px] font-semibold text-ink">
        {label} {opt ? <small className="font-normal text-ink-3">optional</small> : null}
      </span>
      <input ref={k === 'name' ? first : undefined} className={inputCls} maxLength={max} placeholder={ph} value={v[k]} onChange={set(k)} />
    </label>
  )
  return (
    <Dialog
      open
      onClose={onClose}
      kicker="Intel Tracker · Following"
      title={P ? 'Follow a person' : 'Follow a company'}
      width={560}
      footer={
        <>
          <button type="button" className={ghost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primary} disabled={busy} onClick={go}>
            {busy ? 'Saving…' : 'Follow'}
          </button>
        </>
      }
    >
      <p className="mb-3 text-[14px] text-ink-2">
        {P
          ? 'Someone whose posts are worth reading and replying to, like an industry voice or a buyer you want to reach.'
          : 'A competitor or a company your buyers listen to.'}{' '}
        With a LinkedIn link their posts are read directly. Without one, they are found through web search.
      </p>
      {field('name', 'Name', P ? 'e.g. Alex Hormozi' : 'e.g. Acme Advisory', false, 120)}
      {field('linkedin', 'LinkedIn link', P ? 'https://www.linkedin.com/in/…' : 'https://www.linkedin.com/company/…')}
      {field('x', 'X handle', '@handle', true, 80)}
      {P ? null : field('website', 'Website', 'https://', true)}
      {field('notes', 'Why follow them', 'e.g. Posts about AI governance for advisors', true, 300)}
      {err ? (
        <p role="alert" className="text-[13.5px] font-semibold text-bad">
          {err}
        </p>
      ) : null}
    </Dialog>
  )
}
