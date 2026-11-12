'use client'

import { type ReactNode, useState } from 'react'
import { AlertTriangle, Check, Eye, Pause, Plus, Trash2 } from 'lucide-react'
import { deletePage, savePage } from '@/app/(app)/landing-pages/actions'
import { Drawer } from '@/components/ui/drawer'
import { toast } from '@/components/ui/toast'
import { type Page, FIELDS, PUBLIC_HOST, goText, holes, kindName, leftNote, previewHref } from '@/lib/pipeline/landing'
import { btn, ghost, inputCls, primary } from './bits'
import { pagePill } from './landing-dialogs'

// The editor (v115LpEdit, v115EdRead, v115LpSave, v115LpDel as v116 and v120 left them): the page's name and address,
// the top of the page, more on the page, the form, after sign-up and the lead pipeline switch, the review flags to tick,
// then Delete (a draft that never went live), Preview, Pause, Save and Put it live. A page whose campaign is not approved
// asks first, and the second click approves the campaign on the way live.

const OFF = 'Could not reach the dashboard. Try again in a minute.'

type Pair = { k: number; a: string; b: string }

// keys for the sections and questions, so React keeps each box with its own pair while one is removed
let seq = 0
const pair = (a: string, b: string): Pair => ({ k: ++seq, a, b })

function Field({ label, hint, hintId, children }: { label: string; hint?: string; hintId?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-[13.5px] font-semibold text-ink">
      <span>
        {label}
        {hint ? ' ' : null}
        {hint ? (
          <small id={hintId} className="ml-1.5 font-normal text-ink-3">
            {hint}
          </small>
        ) : null}
      </span>
      {children}
    </label>
  )
}

const Kicker = ({ children }: { children: ReactNode }) => <p className="mt-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-text">{children}</p>

export function Editor({ page: p, onClose, onAds }: { page: Page; onClose: () => void; onAds: () => void }) {
  const c = p.content
  const th = c.thanks ?? {}
  const was = !!p.publishedAt
  const showWhen = p.kind === 'webinar' || !!c.when || !!c.presenter
  const showOften = p.kind === 'newsletter_signup' || !!c.how_often
  const showProof = (c.proof ?? []).length > 0
  const flags = (c.flags ?? []).map(String).filter(Boolean)
  const questions = c.questions ?? []
  const saved = holes(c)
  const [f, setF] = useState(() => ({
    title: p.title,
    slug: p.slug,
    headline: c.headline ?? '',
    sub: c.subheadline ?? '',
    when: c.when ?? '',
    presenter: c.presenter ?? '',
    often: c.how_often ?? '',
    who: c.who ?? '',
    bullets: (c.bullets ?? []).join('\n'),
    proof: (c.proof ?? []).join('\n'),
    cta: c.cta ?? '',
    thh: th.headline ?? '',
    thb: th.body ?? '',
    thc: th.cta ?? '',
    thu: th.url ?? '',
  }))
  const [secs, setSecs] = useState<Pair[]>(() => (c.sections ?? []).map((s) => pair(s.title ?? '', s.body ?? '')))
  const [faq, setFaq] = useState<Pair[]>(() => (c.faq ?? []).map((x) => pair(x.q ?? '', x.a ?? '')))
  const [fields, setFields] = useState<string[]>(() => ['email', ...(c.fields ?? [])])
  const [off, setOff] = useState<string[]>(() => questions.filter((q) => q.off).map((q) => q.key))
  const [add, setAdd] = useState(p.addToPipeline)
  const [checked, setChecked] = useState(was)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [ask, setAsk] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))

  const run = async (status: 'live' | 'paused' | null, preview: boolean) => {
    if (busy) return
    // the preview's tab opens on the click, so no popup blocker stops it; the page goes into it once saved
    const w = preview ? window.open('about:blank', '_blank') : null
    if (w) w.opener = null
    setBusy(true)
    setMsg(status === 'live' && ask ? 'Approving the campaign…' : 'Saving…')
    const r = await savePage({
      id: p.id,
      title: f.title,
      slug: f.slug,
      add,
      status,
      checked,
      approve: status === 'live' && ask,
      boxes: {
        headline: f.headline,
        subheadline: f.sub,
        who: f.who,
        when: showWhen ? f.when : undefined,
        presenter: showWhen ? f.presenter : undefined,
        how_often: showOften ? f.often : undefined,
        proof: showProof ? f.proof : undefined,
        bullets: f.bullets,
        sections: secs.map((s) => ({ title: s.a, body: s.b })),
        faq: faq.map((x) => ({ q: x.a, a: x.b })),
        fields,
        off,
        cta: f.cta,
        thanks: { headline: f.thh, body: f.thb, cta: f.thc, url: f.thu },
      },
    }).catch(() => ({ ok: false as const, error: 'Could not save: ' + OFF, ask: undefined }))
    setBusy(false)
    if (!r.ok) {
      w?.close()
      if (r.ask) setAsk(true)
      return setMsg(r.error)
    }
    setAsk(false)
    if (preview) {
      const href = new URL(previewHref({ id: p.id, slug: r.slug, status: r.status }), window.location.origin).href
      if (w) w.location.href = href
      else window.open(href, '_blank', 'noopener')
      return setMsg((r.status === 'live' ? 'Saved, so visitors see it now. The preview opens in a new tab.' : 'Saved. The preview opens in a new tab.') + leftNote(r.left))
    }
    onClose()
    const done = status === 'live' ? 'It is live at ' + goText(r.slug) : status === 'paused' ? 'Paused. The page now says it is not taking sign-ups.' : 'Saved'
    toast((r.approvedNow ? 'Campaign approved. ' : '') + (r.left ? done.replace(/\.?$/, '.') + leftNote(r.left) : done))
    if (status === 'live' && r.ads) setTimeout(onAds, 250)
  }

  const del = async () => {
    if (!window.confirm('Delete the draft "' + (p.title || p.slug) + '"? It has never been live.')) return
    const r = await deletePage({ id: p.id }).catch(() => ({ ok: false as const, error: 'Could not delete it: ' + OFF }))
    if (!r.ok) return toast(r.error, 'warn')
    onClose()
    toast('Deleted')
  }

  const pairs = (kind: 'sec' | 'faq') => {
    const list = kind === 'sec' ? secs : faq
    const setList = kind === 'sec' ? setSecs : setFaq
    const [pa, pb] = kind === 'sec' ? ['Heading (optional)', 'What it says'] : ['Question', 'Answer']
    return (
      <div className="grid gap-2" data-testid={kind === 'sec' ? 'ed-sections' : 'ed-faq'}>
        {list.map((x, i) => (
          <div key={x.k} role="group" aria-label={(kind === 'sec' ? 'Section ' : 'Question ') + (i + 1)} className="grid gap-1.5 rounded-md border border-line p-2.5">
            <input className={inputCls} aria-label={pa} placeholder={pa} value={x.a} onChange={(e) => setList(list.map((y) => (y.k === x.k ? { ...y, a: e.target.value } : y)))} />
            <textarea
              className={inputCls}
              aria-label={pb}
              placeholder={pb}
              rows={kind === 'sec' ? 3 : 2}
              value={x.b}
              onChange={(e) => setList(list.map((y) => (y.k === x.k ? { ...y, b: e.target.value } : y)))}
            />
            <button type="button" className="justify-self-start text-[13px] font-semibold text-accent-text hover:underline" onClick={() => setList(list.filter((y) => y.k !== x.k))}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className={btn + ' justify-self-start'} onClick={() => setList([...list, pair('', '')])}>
          <Plus size={14} aria-hidden="true" />
          {kind === 'sec' ? 'Add a section' : 'Add a question'}
        </button>
      </div>
    )
  }

  const tick = (on: boolean, label: string, change: (v: boolean) => void, opts: { disabled?: boolean; data?: string } = {}) => (
    <label key={opts.data ?? label} className="inline-flex items-center gap-2 text-[14px] text-ink" data-f={opts.data}>
      <input type="checkbox" className="h-4 w-4 accent-[var(--color-action)]" checked={on} disabled={opts.disabled} onChange={(e) => change(e.target.checked)} />
      {label}
    </label>
  )

  return (
    <Drawer
      open
      onClose={onClose}
      label="landing-editor"
      eyebrow={kindName(p.kind) + ' · ' + (p.status === 'live' ? 'Live' : p.status === 'paused' ? 'Paused' : 'Draft')}
      title={p.title || p.slug}
      meta={pagePill(p)}
      footer={
        <div className="grid w-full gap-2">
          <p role="status" aria-live="polite" className="min-h-[1.2em] text-[13.5px] font-semibold text-ink-2" data-testid="editor-msg">
            {msg}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {p.status === 'draft' && !p.publishedAt ? (
              <button type="button" className={ghost} onClick={() => void del()}>
                <Trash2 size={15} aria-hidden="true" />
                Delete
              </button>
            ) : null}
            <button type="button" className={btn} disabled={busy} title={p.status === 'live' ? 'Saves the page, so visitors see the change now' : undefined} onClick={() => void run(null, true)}>
              <Eye size={15} aria-hidden="true" />
              {p.status === 'live' ? 'Save and preview' : 'Preview'}
            </button>
            <span className="grow" />
            {p.status === 'live' ? (
              <button type="button" className={btn} disabled={busy} onClick={() => void run('paused', false)}>
                <Pause size={15} aria-hidden="true" />
                Pause
              </button>
            ) : null}
            <button type="button" className={p.status === 'live' ? primary : btn} disabled={busy} onClick={() => void run(null, false)}>
              Save
            </button>
            {p.status !== 'live' ? (
              <button type="button" className={primary} disabled={busy} onClick={() => void run('live', false)}>
                <Check size={15} aria-hidden="true" />
                {ask ? 'Approve and put it live' : 'Put it live'}
              </button>
            ) : null}
          </div>
        </div>
      }
    >
      <div className="grid gap-3.5 py-1" data-testid="editor-body">
        {saved.length ? (
          <p className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn-soft px-3 py-2.5 text-[14px] text-ink-2" data-testid="editor-holes">
            <AlertTriangle size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
            <span>
              <b className="text-ink">Fill these in before it goes live:</b> {saved.join(', ')}
            </span>
          </p>
        ) : null}
        <Field label="Name in the dashboard">
          <input className={inputCls} value={f.title} onChange={set('title')} />
        </Field>
        <Field label="Address" hint={was ? 'Changing it breaks the links already in your ads' : undefined} hintId="ed-slug-hint">
          <span className="flex items-center gap-1.5">
            <span className="shrink-0 text-[13.5px] font-normal text-ink-3">{PUBLIC_HOST}/go/</span>
            <input className={inputCls} spellCheck={false} aria-label="Address" aria-describedby={was ? 'ed-slug-hint' : undefined} value={f.slug} onChange={set('slug')} />
          </span>
        </Field>

        <Kicker>The top of the page</Kicker>
        <Field label="Headline">
          <input className={inputCls} value={f.headline} onChange={set('headline')} />
        </Field>
        <Field label="Under the headline">
          <textarea className={inputCls} rows={3} value={f.sub} onChange={set('sub')} />
        </Field>
        {showWhen ? (
          <>
            <Field label="When">
              <input className={inputCls} placeholder="Thursday 6 November, 11am Pacific" value={f.when} onChange={set('when')} />
            </Field>
            <Field label="Who presents">
              <input className={inputCls} value={f.presenter} onChange={set('presenter')} />
            </Field>
          </>
        ) : null}
        {showOften ? (
          <Field label="How often">
            <input className={inputCls} placeholder="Every two weeks" value={f.often} onChange={set('often')} />
          </Field>
        ) : null}
        <Field label="Who it is for" hint="optional">
          <input className={inputCls} value={f.who} onChange={set('who')} />
        </Field>
        <Field label="Points" hint="one per line">
          <textarea className={inputCls} rows={4} value={f.bullets} onChange={set('bullets')} />
        </Field>
        {showProof ? (
          <Field label="Proof" hint="one per line">
            <textarea className={inputCls} rows={3} value={f.proof} onChange={set('proof')} />
          </Field>
        ) : null}

        <Kicker>More on the page</Kicker>
        <div className="grid gap-1.5">
          <span className="text-[13.5px] font-semibold text-ink">Sections</span>
          {pairs('sec')}
        </div>
        <div className="grid gap-1.5">
          <span className="text-[13.5px] font-semibold text-ink">Questions people ask</span>
          {pairs('faq')}
        </div>

        <Kicker>The form</Kicker>
        <div role="group" aria-label="The form's fields" className="flex flex-wrap gap-x-4 gap-y-2">
          {FIELDS.map(([k, label]) =>
            tick(k === 'email' || fields.includes(k), label, (v) => setFields((x) => (v ? [...x, k] : x.filter((y) => y !== k))), { disabled: k === 'email', data: k }),
          )}
        </div>
        {questions.length ? (
          <div className="grid gap-1.5">
            <span className="text-[13.5px] font-semibold text-ink">
              Qualifying questions<small className="ml-1.5 font-normal text-ink-3">from the campaign, all optional for the visitor</small>
            </span>
            <div role="group" aria-label="Qualifying questions" className="grid gap-1.5">
              {questions.map((q) => tick(!off.includes(q.key), q.label, (v) => setOff((x) => (v ? x.filter((y) => y !== q.key) : [...x, q.key])), { data: q.key }))}
            </div>
          </div>
        ) : null}
        <Field label="Button">
          <input className={inputCls} value={f.cta} onChange={set('cta')} />
        </Field>

        <Kicker>After they sign up</Kicker>
        <Field label="Headline">
          <input className={inputCls} aria-label="After sign-up headline" value={f.thh} onChange={set('thh')} />
        </Field>
        <Field label="Text">
          <textarea className={inputCls} rows={2} value={f.thb} onChange={set('thb')} />
        </Field>
        <Field label="Button" hint="optional">
          <input className={inputCls} aria-label="After sign-up button" value={f.thc} onChange={set('thc')} />
        </Field>
        <Field
          label="Button link"
          hint={p.kind === 'book_call' ? 'your booking link, needed to go live' : p.kind === 'download' ? 'the file they get, needed to go live' : 'optional'}
        >
          <input className={inputCls} placeholder={p.kind === 'book_call' ? 'https://calendly.com/...' : 'https://...'} value={f.thu} onChange={set('thu')} />
        </Field>

        <div className="mt-1 flex items-start justify-between gap-4 rounded-md border border-line px-3 py-2.5">
          <span>
            <b className="block text-[14px] text-ink">Add sign-ups to the lead pipeline</b>
            <small className="text-[13px] text-ink-3">As New leads in Catalyst, ready for lead research. Everyone also goes to HubSpot.</small>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={add}
            aria-label="Add sign-ups to the lead pipeline"
            onClick={() => setAdd(!add)}
            className={`relative mt-1 h-[22px] w-[38px] shrink-0 rounded-full transition-colors ${add ? 'bg-action' : 'bg-line-2'}`}
          >
            <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-panel transition-all ${add ? 'left-[19px]' : 'left-[3px]'}`} />
          </button>
        </div>

        {flags.length ? (
          <div className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn-soft px-3 py-2.5 text-[14px] text-ink-2" data-testid="editor-flags">
            <AlertTriangle size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
            <span className="grid gap-1.5">
              <b className="text-ink">Check before it goes live:</b>
              <ul className="list-disc pl-5">
                {flags.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
              {tick(checked, 'I checked these', setChecked)}
            </span>
          </div>
        ) : null}
      </div>
    </Drawer>
  )
}
