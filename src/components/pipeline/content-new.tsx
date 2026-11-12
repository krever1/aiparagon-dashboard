'use client'

import { type Dispatch, type ReactNode, type SetStateAction, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  AlertTriangle, BarChart3, BookOpen, Check, CheckCircle2, ChevronDown, Clock, Copy, FileText, Info, Layers, Lightbulb, Link2, Loader2, Mail, Megaphone,
  MessageSquare, Newspaper, PenLine, Play, Plus, Repeat, Sparkles, Upload, Users, X,
} from 'lucide-react'
import { approveItems, undoItems } from '@/app/(app)/approvals/actions'
import {
  type CallPick, contentCallText, contentCalls, fillItIn, materialFor, readLink, retryRequest, sendRequest,
} from '@/app/(app)/content-transformation/actions'
import { ErrorNotice } from '@/components/catalyst/bits'
import { Dialog } from '@/components/ui/dialog'
import { dayText } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import type { Note } from '@/lib/pipeline/content'
import { type FillAnswer, FILL_MSG, type NoteKey, applyFill, fillFrom, fillIntro, fillKey } from '@/lib/pipeline/content-fill'
import { FILE_MSG, fileTitle, guessType } from '@/lib/pipeline/content-files'
import type { ContentData } from '@/lib/pipeline/content-load'
import { type Step, builtinSteps, samePlan, teamSteps } from '@/lib/pipeline/content-plan'
import {
  type Answer, type Form, type Prefill, type Q, type Src, CATS, GROUPS, KINDS, MAX, SAMPLE, SRCS, SRC_TYPES, TEXT_MAX, type Use, adTypeLine, afterSend,
  answersOf, baseParts, blankForm, briefUse, catOf, ctaList, ctaOf, feedbackUse, getsOf, hintOf, materialLine, materialUse, mustOf, mustSuggest, num, offerChoices, offerSum,
  personaSum, pickOffer, pickPersona, planKeyOf, prefillOf, questionsOf, readyOf, structChoices, structOf, typeOf, voiceOf, voiceOpts, voiceUse, withMaterial, wordCount,
} from '@/lib/pipeline/content-new'
import { briefHref } from '@/lib/touchpoint/approvals'
import { btn, inputCls, linkCls, primary, selectCls } from './bits'
import { type CallList, FathomPanel, type Msg, UploadPanel, Why } from './content-material'
import { OUT_TIP, legacy } from './content-view'
import { PlanPreview } from './content-new-preview'
import { type PlanView, PlanPane } from './content-plan'
import { ReadError, readFileText } from './content-read'

// New draft (nwCtFormHtml and nwCtSide as v105, v111, v113 and v126 left them): what is being made and its category,
// the material (a file read in this browser, pasted or read from a link, a Fathom call's transcript, or a new idea;
// video and audio are still transcribed in the current dashboard), the details (who it is for, the kind's questions,
// the takeaway or the proof, what it must use, notes, and More options: voice, structure, the offer and the call to
// action), Fill it in for me (v99), and the side: what comes back, what it will use, Generate and the draft on its
// way. The form stays as it was while another tab is looked at. A link can fill it in (an idea from Ideas, a piece to
// use, a call from Calls, the strategy read's Create): the address asks once, then goes back to bare.

const ICONS: Record<string, typeof PenLine> = {
  pen: PenLine,
  news: Newspaper,
  mail: Mail,
  megaphone: Megaphone,
  chart: BarChart3,
  book: BookOpen,
  file: FileText,
  checkCircle: CheckCircle2,
  clock: Clock,
  layers: Layers,
  users: Users,
  play: Play,
  repeat: Repeat,
  plus: Plus,
  upload: Upload,
  copy: Copy,
  msg: MessageSquare,
  bulb: Lightbulb,
}
const lbl = 'block text-[13.5px] font-semibold text-ink'
const small = 'ml-1.5 text-[12.5px] font-normal text-ink-3'
const chipCls = (on: boolean, sm = false) =>
  `inline-flex items-center gap-1.5 rounded-full border font-semibold ${sm ? 'px-2.5 py-0.5 text-[13px]' : 'px-3 py-1 text-[13.5px]'} ${
    on ? 'border-accent bg-accent-soft text-accent-text' : 'border-line bg-panel text-ink-2 hover:border-line-2'
  }`
/** The step the material is in, for the line under Generate (step 2 until the briefs' findings take it, in 4d). */
const MATERIAL_STEP = 2

export type Watch = { id: string; title: string; t0: number }
/** Fill it in for me: not asked, reading, did not work, or done (with what to put back on Undo). */
type FillState =
  | { st: 'idle' }
  | { st: 'busy'; key: string }
  | { st: 'err'; key: string; msg: string }
  | { st: 'done'; key: string; answer: FillAnswer; snap: Partial<Form>; kept: boolean }
type Props = {
  data: ContentData
  now: number
  tz: string | undefined
  kicks: Record<string, string>
  setKicks: Dispatch<SetStateAction<Record<string, string>>>
  onReview: (draftId: string) => void
}

/** What a prefill puts in the form at once; a piece or a request's material comes after, from the server. */
function applyPre(x: Form, p: Prefill, notes: Note[]): Form {
  const f: Form = { ...x }
  if (p.kind) f.kind = p.kind
  if (p.src) f.src = p.src
  if (p.thesis !== null) {
    f.thesis = p.thesis
    f.note = null
  }
  const n = p.note ? notes.find((x) => x.id === p.note) : undefined
  if (n) Object.assign(f, { thesis: n.note, note: n.id, src: 'idea' })
  // a call's title comes with its transcript
  if (p.title !== null && !p.call) f.title = p.title
  if (p.take !== null) f.take = p.take
  return f
}

export function NewDraft({ data, now, tz, kicks, setKicks, onReview }: Props) {
  const D = data.form
  const sp = useSearchParams()
  const [f, setF] = useState<Form>(() => {
    const p = prefillOf(sp)
    return p ? applyPre(blankForm(), p, data.notes) : blankForm()
  })
  const up = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [watch, setWatch] = useState<Watch | null>(null)
  const [preview, setPreview] = useState(false)
  const [mustTyped, setMustTyped] = useState('')
  const [linkMsg, setLinkMsg] = useState<{ text: string; tone: 'busy' | 'err' | 'ok' } | null>(null)
  const [reading, setReading] = useState(false)
  const [sampleMsg, setSampleMsg] = useState('')
  const [fileBusy, setFileBusy] = useState(false)
  const [fileMsg, setFileMsg] = useState<Msg | null>(null)
  const [calls, setCalls] = useState<CallList>({ st: 'idle' })
  // a call asked for by the address loads by itself, so the list stays shut
  const [callsOpen, setCallsOpen] = useState(() => !prefillOf(sp)?.call)
  const [fill, setFill] = useState<FillState>({ st: 'idle' })
  const [notes, setNotes] = useState<Partial<Record<NoteKey, string>>>({})
  const [moreOpen, setMoreOpen] = useState(false)
  const [info, setInfo] = useState(false)
  const [planEdits, setPlanEdits] = useState<Record<string, Step[]>>({})
  const fRef = useRef(f)
  useEffect(() => {
    fRef.current = f
  })
  const detailsRef = useRef<HTMLElement>(null)
  const thesisRef = useRef<HTMLTextAreaElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const takeRef = useRef<HTMLInputElement>(null)
  const urlRef = useRef<HTMLInputElement>(null)
  const mustRef = useRef<HTMLInputElement>(null)

  // a link that fills the form in: applied once when the address asks (the same link again applies again)
  const pre = prefillOf(sp)
  const [applied, setApplied] = useState(() => (pre ? pre.sig : ''))
  const [asked, setAsked] = useState<{ n: number; pre: Prefill | null }>(() => ({ n: pre ? 1 : 0, pre }))
  if (pre && pre.sig !== applied) {
    setApplied(pre.sig)
    setF((x) => applyPre(x, pre, data.notes))
    setAsked((a) => ({ n: a.n + 1, pre }))
    if (pre.call) setCallsOpen(false)
  }
  if (!pre && applied) setApplied('')
  useEffect(() => {
    const p = asked.pre
    if (!asked.n || !p) return
    let live = true
    // the address goes back to New draft, so a reload does not fill the form in again
    window.history.replaceState(null, '', '/content-transformation')
    if (p.note && !data.notes.some((n) => n.id === p.note)) toast('That idea is not on file any more.', 'warn')
    if (p.say) toast(p.say)
    const focus = p.src === 'idea' ? thesisRef : p.src === 'paste' && !p.use ? textRef : null
    window.requestAnimationFrame(() => focus?.current?.focus({ preventScroll: true }))
    if (p.use) {
      void materialFor((p.use.kind === 'piece' ? 'piece:' : 'req:') + p.use.id).then((r) => {
        if (!live) return
        if (!r.ok) return toast(r.error, 'warn')
        setF((x) => ({ ...withMaterial(x, { text: r.text, title: r.title, url: r.url, type: SRC_TYPES.some((t) => t[0] === r.type) ? r.type : x.type }), src: 'paste' }))
        window.requestAnimationFrame(() => takeRef.current?.focus({ preventScroll: true }))
      })
    }
    if (p.call) {
      void contentCallText(p.call).then((r) => {
        if (!live) return
        if (!r.ok) return toast(r.error, 'warn')
        if (!r.text) return toast('Fathom has no transcript for this call, so there is nothing to draft from.', 'warn')
        setF((x) => withMaterial({ ...x, src: 'fathom' }, { text: r.text, title: p.title ?? '', url: p.link, guess: 'call' }))
        toast('Call transcript loaded as the source')
        window.requestAnimationFrame(() => takeRef.current?.focus({ preventScroll: true }))
      })
    }
    return () => {
      live = false
    }
    // runs once per prefill the address asks for
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked.n])

  const k = f.kind
  const K = KINDS[k]
  const cat = catOf(k, f.cat[k])
  const t = typeOf(k, cat)
  const per = pickPersona(f.per, D.personas)
  const off = pickOffer(f.off, D.offers)
  const ctas = ctaList(t, off)
  const cta = ctaOf(f.cta, t, off)
  const voices = voiceOpts(!!D.voice)
  const voice = voiceOf(f.voice, !!D.voice)
  const sc = structChoices(k, t, D.templates)
  const struct = structOf(f.struct, k, t, D.templates)
  const A = answersOf(k, f.answers[k])
  const ready = readyOf(f)
  const idea = f.src === 'idea'
  const day = (iso: string) => dayText(iso, tz)
  const ctx = { email: '', personas: D.personas, offers: D.offers, templates: D.templates, voice: D.voice, leaveOut: D.leaveOut, asks: D.asks, now }
  // the plan (v121): the edits kept for this kind and structure, else the team's default, else the template's own parts
  const parts = baseParts(f, ctx)
  const builtin = builtinSteps(parts.sections)
  const pkey = planKeyOf(f, D)
  const team = teamSteps(D.plans, pkey)
  const dflt = team ? team.steps : builtin
  const edited = planEdits[pkey]
  const plan: PlanView = {
    key: pkey,
    steps: edited ?? dflt,
    changed: !!edited && !samePlan(edited, dflt),
    team: !!team && !edited,
    template: parts.template,
  }
  const setAnswer = (id: string, v: Answer) => setF((x) => ({ ...x, answers: { ...x.answers, [x.kind]: { ...answersOf(x.kind, x.answers[x.kind]), [id]: v } } }))

  const pickSrc = (s: Src) => {
    up({ src: s })
    if (s === 'fathom') {
      setCallsOpen(true)
      loadCalls(false)
    }
    window.requestAnimationFrame(() => {
      if (s === 'idea') thesisRef.current?.focus({ preventScroll: true })
      if (s === 'paste' && !textRef.current?.value) textRef.current?.focus({ preventScroll: true })
    })
  }
  const sample = () => {
    up({ type: SAMPLE.type, title: SAMPLE.title, titleFrom: SAMPLE.title, text: SAMPLE.text, take: SAMPLE.take, url: '', fileName: '' })
    setLinkMsg(null)
    setSampleMsg('Sample loaded. Swap in your own material for a real draft.')
  }
  const read = async () => {
    const u = f.url.trim()
    if (!u) {
      setLinkMsg({ text: 'Paste a link first.', tone: 'err' })
      urlRef.current?.focus()
      return
    }
    if (f.text.trim().length > 40 && !window.confirm('Replace what is in Source text with the text from this link?')) return
    setReading(true)
    setLinkMsg({ text: 'Reading the page…', tone: 'busy' })
    const r = await readLink(u).catch(() => ({ ok: false as const, error: 'Could not reach n8n. Check your connection and try again.', title: '' }))
    setReading(false)
    if (!r.ok) {
      setLinkMsg({ text: r.error, tone: 'err' })
      const title = r.title
      if (title) setF((x) => (x.title.trim() ? x : { ...x, title }))
      return
    }
    const type = r.kind === 'youtube' ? (/podcast|episode|\bep\.?\s*\d/i.test(r.title) ? 'podcast' : 'transcript') : 'article'
    setF((x) => withMaterial(x, { text: r.text, title: r.title, type, url: r.url }))
    setNotes((n) => ({ ...n, text: undefined }))
    setSampleMsg('')
    setLinkMsg({
      text: 'Read ' + num(r.words) + ' words from ' + (r.host || 'the page') + (r.cut ? ', the first part of a long page' : '') + '. Check the text, then generate.',
      tone: 'ok',
    })
  }
  /** A file dropped or picked on Upload, read in this browser (apCfFile). */
  const onFile = async (file: File) => {
    if (fileBusy) return
    setFileBusy(true)
    setFileMsg({ text: 'Reading ' + file.name + '…', tone: 'busy' })
    try {
      const t = await readFileText(file)
      setF((x) => withMaterial({ ...x, src: 'upload' }, { text: t, title: fileTitle(file.name), fileName: file.name, guess: guessType(file.name, file.type) }))
      setNotes((n) => ({ ...n, text: undefined }))
      setSampleMsg('')
      setLinkMsg(null)
      setFileMsg({ text: 'Loaded ' + file.name + (t.length > TEXT_MAX ? ' (first 120,000 characters)' : ''), tone: 'ok' })
    } catch (e) {
      const text = e instanceof ReadError ? e.message : 'Could not read that file. Paste the text instead.'
      setFileMsg({ text, tone: 'err', out: text === FILE_MSG.media })
    } finally {
      setFileBusy(false)
    }
  }
  /** The Fathom call tab's list: read when the tab opens, again after a minute. */
  const loadCalls = (force: boolean) => {
    if (calls.st === 'loading') return
    if (!force && calls.st === 'done' && calls.res.ok && now - calls.at < 60_000) return
    setCalls({ st: 'loading' })
    void contentCalls()
      .catch(() => ({ ok: false as const, error: 'Could not reach the dashboard. Try again in a minute.', code: '' }))
      .then((res) => setCalls({ st: 'done', at: Date.now(), res }))
  }
  /** A call picked: its transcript is the material (apCfUseCall). */
  const pickCall = async (c: CallPick): Promise<boolean> => {
    const r = await contentCallText(c.id).catch(() => ({ ok: false as const, error: 'Could not reach the dashboard. Try again in a minute.' }))
    if (!r.ok) {
      toast(r.error, 'warn')
      return false
    }
    if (!r.text) {
      toast('Fathom has no transcript for this call.', 'warn')
      return false
    }
    setF((x) => withMaterial({ ...x, src: 'fathom' }, { text: r.text, title: c.title, url: c.url, guess: 'call' }))
    setNotes((n) => ({ ...n, text: undefined }))
    setSampleMsg('')
    toast('Call transcript loaded as the source')
    window.requestAnimationFrame(() => takeRef.current?.focus({ preventScroll: true }))
    return true
  }
  /** Fill it in for me (v99Fill): the agent fills the form from the newest briefs and what the team has on file. */
  const runFill = async () => {
    if (fill.st === 'busy') return
    const key = fillKey(f)
    setFill({ st: 'busy', key })
    setNotes({})
    const top = detailsRef.current?.getBoundingClientRect().top
    if (top !== undefined && top < 70) detailsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    const r = await fillItIn(fRef.current).catch(() => ({ ok: false as const, error: 'Could not reach the dashboard. Try again in a minute.' }))
    const now = fRef.current
    if (!r.ok) return setFill({ st: 'err', key: fillKey(now), msg: r.error })
    if (fillKey(now) !== key) return setFill({ st: 'err', key: fillKey(now), msg: FILL_MSG.changed })
    const a = applyFill(now, r.answer, r.material, D)
    setF(a.form)
    setNotes(a.notes)
    setFill({ st: 'done', key, answer: r.answer, snap: a.snap, kept: a.kept.length > 0 })
    setMoreOpen(true)
    if (a.notes.text) {
      setFileMsg(null)
      setSampleMsg('')
    }
  }
  const undoFill = () => {
    if (fill.st !== 'done') return
    const snap = fill.snap
    setF((x) => ({ ...x, ...snap }))
    setNotes({})
    setFill({ st: 'idle' })
    toast('Put back what was there before.')
  }
  /** A field changed by hand: the reason under it goes (v99AfEdited). */
  const edit = (p: Partial<Form>, note: NoteKey) => {
    up(p)
    if (notes[note]) setNotes((n) => ({ ...n, [note]: undefined }))
  }
  // a fill is for what is being made: another kind, category, or an idea instead of material, and it is done with
  const fk = fillKey(f)
  if ((fill.st === 'done' || fill.st === 'err') && fill.key !== fk) {
    setFill({ st: 'idle' })
    setNotes({})
  }

  const addMust = (s: string) => {
    const v = s.trim()
    if (!v) return
    setF((x) => ({ ...x, must: mustOf([...x.must.filter((m) => m !== v), v]) }))
    setMustTyped('')
    mustRef.current?.focus()
  }
  const send = async () => {
    if (busy || !ready) return
    setBusy(true)
    setErr('')
    const form = { ...f, must: mustOf(f.must, mustTyped), plan: { key: plan.key, steps: plan.steps } }
    const r = await sendRequest(form).catch(() => ({ ok: false as const, error: 'Could not reach the dashboard. Try again in a minute.' }))
    setBusy(false)
    if (!r.ok) return setErr(r.error)
    setWatch({ id: r.id, title: r.title, t0: Date.now() })
    if (r.started) toast('Draft started. It usually takes about a minute.')
    else {
      setKicks((x) => ({ ...x, [r.id]: r.error ?? 'network error' }))
      toast('Saved, but the workflow did not start (' + (r.error ?? 'network error') + '). Try again from Drafts.', 'warn')
    }
    setF(afterSend)
    setMustTyped('')
    setLinkMsg(null)
    setSampleMsg('')
    setFileMsg(null)
    setFill({ st: 'idle' })
    setNotes({})
  }

  const steps: { title: string; side?: ReactNode; body: ReactNode }[] = [
    {
      title: 'What are you making?',
      body: (
        <>
          <div className="grid gap-3">
            {GROUPS.map(([g, keys]) => (
              <div key={g}>
                <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-ink-3">{g}</span>
                <div role="group" aria-label={'What are you making? ' + g} className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
                  {keys.map((key) => {
                    const D2 = KINDS[key]
                    const Ic = ICONS[D2.icon] ?? Plus
                    const on = key === k
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={on}
                        onClick={() => up({ kind: key })}
                        data-testid="kind-tile"
                        className={`flex min-w-0 flex-col items-start gap-1 rounded-md border px-3 py-2.5 text-left ${
                          on ? 'border-accent bg-accent-soft' : 'border-line bg-panel hover:border-line-2'
                        }`}
                      >
                        <Ic size={18} aria-hidden="true" className={on ? 'text-accent-text' : 'text-ink-2'} />
                        <b className="text-[14px] font-semibold text-ink">{D2.t}</b>
                        <small className="text-[12.5px] text-ink-3">{D2.s}</small>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {CATS[k].length ? (
            <div className="mt-4" data-testid="categories">
              <span className={lbl + ' mb-1.5'}>Category</span>
              <div role="radiogroup" aria-label="Category" className="flex flex-wrap gap-1.5">
                {CATS[k].map(([c, label]) => (
                  <button key={c} type="button" role="radio" aria-checked={c === cat} onClick={() => up({ cat: { ...f.cat, [k]: c } })} className={chipCls(c === cat)}>
                    {c === cat ? <Check size={13} aria-hidden="true" /> : null}
                    {label}
                  </button>
                ))}
              </div>
              {k === 'adcopy' ? <p className="mt-2 text-[13.5px] text-ink-2">{adTypeLine(cat)}</p> : null}
            </div>
          ) : null}
        </>
      ),
    },
    {
      title: 'Your material',
      body: (
        <>
          <div role="tablist" aria-label="Your material" className="flex flex-wrap gap-1 rounded-md bg-sunk p-1">
            {SRCS.map(([s, label, icon, tip]) => {
              const Ic = ICONS[icon] ?? Plus
              return (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={f.src === s}
                  title={tip}
                  onClick={() => pickSrc(s)}
                  className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-[13.5px] font-semibold ${
                    f.src === s ? 'bg-panel text-ink shadow-card' : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  <Ic size={16} aria-hidden="true" />
                  {label}
                </button>
              )
            })}
          </div>
          <div role="tabpanel" aria-label={SRCS.find((x) => x[0] === f.src)?.[1]} className="mt-3">
            {f.src === 'upload' ? (
              <UploadPanel f={f} busy={fileBusy} msg={fileMsg} onFile={(file) => void onFile(file)} onSee={() => pickSrc('paste')} />
            ) : f.src === 'fathom' ? (
              <FathomPanel
                list={calls}
                load={() => loadCalls(true)}
                tz={tz}
                open={callsOpen}
                setOpen={(v) => {
                  setCallsOpen(v)
                  if (v) loadCalls(false)
                }}
                picked={f.text.trim() ? f.title : ''}
                onPick={pickCall}
              />
            ) : f.src === 'paste' ? (
              <>
                <label className="block">
                  <span className={lbl}>
                    Source text<small className={small}>{f.text.trim() ? num(wordCount(f.text)) + ' words' : ''}</small>
                  </span>
                  <textarea
                    ref={textRef}
                    rows={8}
                    maxLength={TEXT_MAX}
                    value={f.text}
                    onChange={(e) => edit({ text: e.target.value }, 'text')}
                    placeholder="Paste an excerpt or transcript. The draft only uses what you provide."
                    className={inputCls + ' mt-1.5'}
                  />
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    ref={urlRef}
                    value={f.url}
                    onChange={(e) => {
                      up({ url: e.target.value })
                      setLinkMsg(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void read()
                      }
                    }}
                    inputMode="url"
                    autoComplete="off"
                    maxLength={MAX.url}
                    aria-label="Link to an article, blog post or YouTube video"
                    placeholder="Or paste a link to an article, blog post or YouTube video"
                    className={inputCls + ' min-w-0 flex-1'}
                  />
                  <button type="button" className={btn} onClick={() => void read()} disabled={reading}>
                    <Link2 size={15} aria-hidden="true" />
                    {reading ? 'Reading…' : 'Read link'}
                  </button>
                </div>
                <p
                  role="status"
                  aria-live="polite"
                  className={`mt-1.5 min-h-[1em] text-[13px] ${linkMsg?.tone === 'err' ? 'text-bad' : linkMsg?.tone === 'ok' ? 'text-good' : 'text-ink-2'}`}
                  data-testid="link-msg"
                >
                  {linkMsg?.text ?? ''}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px]">
                  <button type="button" className={linkCls} onClick={sample}>
                    Try it with a sample article
                  </button>
                  <span className="text-ink-3">{sampleMsg}</span>
                </p>
              </>
            ) : (
              <div>
                <label className="block">
                  <span className={lbl}>What point do you want to make?</span>
                  <textarea
                    ref={thesisRef}
                    rows={5}
                    maxLength={MAX.thesis}
                    value={f.thesis}
                    onChange={(e) => edit({ thesis: e.target.value }, 'thesis')}
                    placeholder="e.g. Most firms start with the AI tool. They should start with one meeting type."
                    className={inputCls + ' mt-1.5'}
                  />
                </label>
                <Why text={notes.thesis} />
              </div>
            )}
          </div>
          {!idea ? (
            <label className="mt-3 block max-w-[360px]">
              <span className={lbl}>What is this material?</span>
              <select value={f.type} onChange={(e) => up({ type: e.target.value, typeSet: true })} className={selectCls + ' mt-1.5 w-full'}>
                {SRC_TYPES.map(([v, name]) => (
                  <option key={v} value={v}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <MatLine f={f} onSee={() => pickSrc('paste')} />
          {!idea ? <Why text={notes.text} /> : null}
        </>
      ),
    },
    {
      title: 'Details',
      side: (
        <span className="ml-auto flex items-center gap-1">
          <button type="button" className={linkCls} onClick={() => void runFill()} disabled={fill.st === 'busy'} title="Fill the details in from the latest brief and your voice and context" data-testid="fill-go">
            <Sparkles size={15} aria-hidden="true" />
            Fill it in for me
          </button>
          <button type="button" aria-label="How Fill it in for me works" onClick={() => setInfo(true)} className="rounded-full p-1 text-ink-3 hover:text-ink">
            <Info size={15} aria-hidden="true" />
          </button>
        </span>
      ),
      body: (
        <div className="grid gap-4">
          <FillStrip fill={fill} day={day} onRetry={() => void runFill()} onUndo={undoFill} />
          <div>
            <Personas f={f} per={per} up={up} personas={D.personas} />
            <Why text={notes.per} />
          </div>
          {questionsOf(k).map((q) => (
            <QField key={k + ':' + q.id} q={q} v={A[q.id]} set={(v) => setAnswer(q.id, v)} />
          ))}
          {!idea ? (
            <div>
              <label className="block">
                <span className={lbl}>
                  Core takeaway<small className={small}>optional</small>
                </span>
                <input
                  ref={takeRef}
                  value={f.take}
                  maxLength={MAX.take}
                  onChange={(e) => edit({ take: e.target.value }, 'take')}
                  placeholder="The one thing a reader should remember"
                  className={inputCls + ' mt-1.5'}
                />
              </label>
              <Why text={notes.take} />
            </div>
          ) : (
            <label className="block">
              <span className={lbl}>
                Proof or example<small className={small}>optional</small>
              </span>
              <textarea
                rows={2}
                value={f.proof}
                maxLength={MAX.proof}
                onChange={(e) => up({ proof: e.target.value })}
                placeholder="A client story, a number or something you saw first-hand. Leave it blank if you have none."
                className={inputCls + ' mt-1.5'}
              />
            </label>
          )}
          <MustUse
            must={f.must}
            typed={mustTyped}
            setTyped={setMustTyped}
            inputRef={mustRef}
            add={addMust}
            remove={(i) => setF((x) => ({ ...x, must: x.must.filter((_, j) => j !== i) }))}
            sugg={mustSuggest(D.proof, D.offers, new Date(now).toISOString().slice(0, 10), mustOf(f.must, mustTyped))}
          />
          <label className="block">
            <span className={lbl}>
              Anything else?<small className={small}>notes, context or instructions</small>
            </span>
            <textarea
              rows={3}
              value={f.notes}
              maxLength={MAX.notes}
              onChange={(e) => up({ notes: e.target.value })}
              placeholder="e.g. Keep it under 300 words. Mention the October webinar. Leave out pricing."
              className={inputCls + ' mt-1.5'}
            />
          </label>
          <details
            className="group rounded-md border border-line bg-bg"
            data-testid="more-options"
            open={moreOpen}
            onToggle={(e) => setMoreOpen(e.currentTarget.open)}
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[14px] font-semibold text-ink">
              More options <span className="font-normal text-ink-3">voice, structure and the offer</span>
              <ChevronDown size={17} aria-hidden="true" className="ml-auto transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid gap-4 border-t border-line px-4 py-4 sm:grid-cols-2">
              <div>
                <label className="block">
                  <span className={lbl}>Voice</span>
                  <select value={voice} onChange={(e) => edit({ voice: e.target.value }, 'voice')} className={selectCls + ' mt-1.5 w-full'}>
                    {voices.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                  <small className="mt-1 block text-[12.5px] text-ink-3">
                    {D.voice ? (
                      <>
                        Saved {day(D.voice.createdAt)}.{' '}
                        <a href={legacy('company-profile')} title={OUT_TIP} className="font-semibold text-accent-text hover:underline">
                          Edit your voice
                        </a>
                      </>
                    ) : (
                      <>
                        <a href={legacy('company-profile')} title={OUT_TIP} className="font-semibold text-accent-text hover:underline">
                          Set up your voice
                        </a>{' '}
                        so drafts sound like you.
                      </>
                    )}
                  </small>
                </label>
                <Why text={notes.voice} />
              </div>
              <div>
                <label className="block">
                  <span className={lbl}>Structure</span>
                  <select value={struct} onChange={(e) => edit({ struct: e.target.value }, 'struct')} className={selectCls + ' mt-1.5 w-full'}>
                    <option value="">{sc.first}</option>
                    {sc.shapes.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                    {sc.templates.length ? (
                      <optgroup label="Your templates">
                        {sc.templates.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                </label>
                <Why text={notes.struct} />
              </div>
              <div>
                  <span className={lbl}>What are we offering?</span>
                  {D.offers.length ? (
                    <>
                      <select
                        aria-label="What are you offering?"
                        value={off ? off.id : 'none'}
                        onChange={(e) => up({ off: e.target.value })}
                        className={selectCls + ' mt-1.5 w-full'}
                      >
                        <option value="none">Nothing to sell, just value</option>
                        {offerChoices(D.offers).map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      {off ? <p className="mt-1 text-[12.5px] text-ink-3">{offerSum(off)}</p> : null}
                    </>
                  ) : (
                    <p className="mt-1.5 text-[13.5px] text-ink-2">
                      No offers yet.{' '}
                      <a href={legacy('company-profile')} title={OUT_TIP} className="font-semibold text-accent-text hover:underline">
                        Add one
                      </a>{' '}
                      so campaigns know what they sell.
                    </p>
                  )}
              </div>
              <div>
                <label className="block">
                  <span className={lbl}>What should they do?</span>
                  <select aria-label="What should they do?" value={cta} onChange={(e) => edit({ cta: e.target.value }, 'cta')} className={selectCls + ' mt-1.5 w-full'}>
                    {ctas.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <Why text={notes.cta} />
              </div>
              {!idea ? (
                <label className="block sm:col-span-2">
                  <span className={lbl}>
                    Source title<small className={small}>optional</small>
                  </span>
                  <input
                    value={f.title}
                    maxLength={MAX.title}
                    onChange={(e) => up({ title: e.target.value })}
                    placeholder="e.g. Why AI pilots stall after week three"
                    className={inputCls + ' mt-1.5'}
                  />
                </label>
              ) : null}
            </div>
          </details>
        </div>
      ),
    },
  ]

  const brief = briefUse(k === 'adcopy' ? D.ads : D.org, k === 'adcopy', now, day)
  const briefRow = k === 'adcopy' ? D.ads.use : D.org.use
  const fb = feedbackUse(D.asks, k, now)
  const approve = async () => {
    if (!briefRow) return
    const key = 'brief:' + (k === 'adcopy' ? 'ad_strategist' : 'intel_tracker') + ':' + briefRow.runId
    const r = await approveItems([key]).catch(() => ({ ok: false as const, done: [] as string[], error: 'Could not reach the dashboard. Try again in a minute.' }))
    if (!r.ok) return toast('Could not approve it: ' + r.error, 'warn')
    toast('Approved', 'ok', {
      label: 'Undo',
      run: () => void undoItems(r.done).then((u) => (u.ok ? toast('Undone. It is waiting again.') : toast('Could not undo that: ' + u.error, 'warn'))),
    })
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]" data-testid="content-new">
      <div className="grid min-w-0 content-start gap-4">
        {D.error ? <ErrorNotice>Could not read everything the form uses: {D.error}</ErrorNotice> : null}
        {steps.map((s, i) => (
          <section
            key={s.title}
            ref={s.title === 'Details' ? detailsRef : undefined}
            className="min-w-0 scroll-mt-20 rounded-lg border border-line bg-panel p-5 shadow-card"
            aria-label={s.title}
          >
            <div className="mb-3 flex flex-wrap items-center gap-2.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[12.5px] font-bold text-accent-text" aria-hidden="true">
                {i + 1}
              </span>
              <h3 className="text-[16px] font-semibold text-ink">{s.title}</h3>
              {s.side}
            </div>
            {s.body}
          </section>
        ))}
      </div>

      <aside aria-label="The plan" className="self-start rounded-lg border border-line bg-panel p-5 shadow-card lg:sticky lg:top-20" data-testid="new-side">
        <PlanPane
          plan={plan}
          gets={getsOf(k, t)}
          onSteps={(steps) => setPlanEdits((m) => ({ ...m, [plan.key]: steps }))}
          onReset={() =>
            setPlanEdits((m) => {
              const n = { ...m }
              delete n[plan.key]
              return n
            })
          }
          onUsual={() => setPlanEdits((m) => ({ ...m, [plan.key]: builtin }))}
        />
        <hr className="my-4 border-line" />
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">It will use</p>
        <ul className="mt-2 grid gap-3" aria-label="It will use" data-testid="uses">
          <UseRow
            use={brief}
            href={briefRow ? briefHref(briefRow.runId, k === 'adcopy' ? 'ads' : 'organic') : undefined}
            action={
              brief.action === 'approve' ? (
                <button type="button" className={btn} onClick={() => void approve()}>
                  Approve
                </button>
              ) : brief.action === 'open' && briefRow ? (
                <Link href={briefHref(briefRow.runId, k === 'adcopy' ? 'ads' : 'organic')} className={btn}>
                  Open
                </Link>
              ) : null
            }
          />
          <UseRow use={materialUse(f)} />
          <UseRow
            use={voiceUse(D.voice, day)}
            action={
              D.voice ? null : (
                <a href={legacy('company-profile')} title={OUT_TIP} className={btn}>
                  Set up
                </a>
              )
            }
          />
          {fb ? <UseRow use={fb} href={legacy('ai-settings')} out /> : null}
        </ul>
        <hr className="my-4 border-line" />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!ready || busy}
          className={primary + ' w-full justify-center px-4 py-2.5 text-[15px]'}
          data-testid="generate"
        >
          <Sparkles size={18} aria-hidden="true" />
          {busy ? 'Sending…' : K.btn}
        </button>
        <p className="mt-2 text-center text-[13px] text-ink-3" data-testid="generate-hint">
          {busy ? '' : hintOf(f, MATERIAL_STEP)}
        </p>
        <p className="mt-1 text-center">
          <button type="button" className={linkCls} onClick={() => setPreview(true)}>
            See everything it will use
          </button>
        </p>
        <WatchBox watch={watch} data={data} now={now} kicks={kicks} setKicks={setKicks} onReview={onReview} />
        {err ? (
          <p role="alert" className="mt-3 rounded-md border border-bad/30 bg-bad-soft px-3 py-2 text-[13.5px] text-bad" data-testid="send-error">
            {err}
          </p>
        ) : null}
      </aside>

      {info ? (
        <Dialog open onClose={() => setInfo(false)} kicker="Content Transformation" title="How Fill it in for me works" width={520}>
          <p className="mb-2 text-[14.5px] leading-relaxed text-ink-2">
            <b className="text-ink">Fill it in for me</b> fills the form in, so you can check it before anything is written. {fillIntro(f)}
          </p>
          <p className="text-[14.5px] leading-relaxed text-ink-2">
            It never overwrites what you typed. Under each field it fills you get a one-line reason; click it to read it all. Undo puts everything back.
          </p>
        </Dialog>
      ) : null}
      {preview ? (
        <PlanPreview
          f={{ ...f, must: mustOf(f.must, mustTyped), plan: { key: plan.key, steps: plan.steps } }}
          ctx={{ ...ctx, org: D.org, ads: D.ads, orgItems: D.orgItems }}
          tz={tz}
          ready={ready && !busy}
          onClose={() => setPreview(false)}
          onGenerate={() => {
            setPreview(false)
            void send()
          }}
        />
      ) : null}
    </div>
  )
}


/** Fill it in for me's line at the top of Details (v99AfHtml): reading, could not, or what it filled in from. */
function FillStrip({ fill, day, onRetry, onUndo }: { fill: FillState; day: (iso: string) => string; onRetry: () => void; onUndo: () => void }) {
  if (fill.st === 'idle') return null
  if (fill.st === 'busy')
    return (
      <div role="status" className="flex items-start gap-2.5 rounded-md border border-line bg-bg px-3 py-2.5" data-testid="fill-strip">
        <Loader2 size={18} aria-hidden="true" className="mt-0.5 shrink-0 animate-spin text-info" />
        <div className="text-[13.5px]">
          <b className="block text-ink">Reading the briefs and your context…</b>
          <span className="text-ink-2">About 20 seconds. Anything you type is kept.</span>
        </div>
      </div>
    )
  if (fill.st === 'err')
    return (
      <div role="alert" className="flex flex-wrap items-start gap-2.5 rounded-md border border-bad/30 bg-bad-soft px-3 py-2.5" data-testid="fill-strip">
        <AlertTriangle size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-bad" />
        <div className="min-w-[200px] flex-1 text-[13.5px]">
          <b className="block text-ink">Could not fill it in</b>
          <span className="text-ink-2">{fill.msg}</span>
        </div>
        <button type="button" className={btn} onClick={onRetry}>
          Try again
        </button>
      </div>
    )
  const a = fill.answer
  return (
    <div role="status" className="flex flex-wrap items-start gap-2.5 rounded-md border border-good/30 bg-good-soft px-3 py-2.5" data-testid="fill-strip">
      <CheckCircle2 size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-good" />
      <div className="min-w-[200px] flex-1 text-[13.5px]">
        <b className="block text-ink">Filled in from {fillFrom(a.used, day)}</b>
        <span className="text-ink-2">
          {a.basedOn ? 'Built on “' + a.basedOn + '”. ' : ''}
          {fill.kept ? 'Kept what you typed. ' : ''}Change anything, then generate.
        </span>
        {a.flags.length ? <span className="mt-1 block text-warn">{a.flags.join(' ')}</span> : null}
      </div>
      <div className="flex gap-2">
        <button type="button" className={btn} onClick={onUndo}>
          Undo
        </button>
        <button type="button" className={btn} onClick={onRetry}>
          Fill it in again
        </button>
      </div>
    </div>
  )
}

/** The line under the material (nwCtMat): a call's or a file's text is in, with See the text. */
function MatLine({ f, onSee }: { f: Form; onSee: () => void }) {
  const line = materialLine(f)
  if (!line) return null
  return (
    <p role="status" className="mt-3 flex flex-wrap items-center gap-2 text-[13.5px] text-ink-2" data-testid="material-line">
      <CheckCircle2 size={16} aria-hidden="true" className="text-good" />
      <span>{line}</span>
      <button type="button" className={linkCls} onClick={onSee}>
        See the text
      </button>
    </p>
  )
}

/** Who is it for? (v105PerHtml): a chip per persona, anyone who follows us, and a new persona in the company profile. */
function Personas({ f, per, up, personas }: { f: Form; per: ReturnType<typeof pickPersona>; up: (p: Partial<Form>) => void; personas: ContentData['form']['personas'] }) {
  return (
    <div>
      <span className={lbl + ' mb-1.5'}>Who is it for?</span>
      {personas.length ? (
        <>
          <div role="radiogroup" aria-label="Who should see it?" className="flex flex-wrap gap-1.5">
            {personas.map((p) => {
              const on = !!per && per.id === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  title={[p.role, p.firm].filter(Boolean).join(' · ') || undefined}
                  onClick={() => up({ per: p.id })}
                  className={chipCls(on)}
                >
                  {p.name}
                </button>
              )
            })}
            <button type="button" role="radio" aria-checked={f.per === 'any'} onClick={() => up({ per: 'any' })} className={chipCls(f.per === 'any')}>
              Anyone who follows us
            </button>
            <a href={legacy('company-profile')} title={OUT_TIP} className="inline-flex items-center rounded-full border border-dashed border-line px-3 py-1 text-[13.5px] font-semibold text-ink-2 hover:border-line-2">
              + New persona
            </a>
          </div>
          <p className="mt-1.5 text-[13px] text-ink-3" data-testid="persona-sum">
            {personaSum(per)}
          </p>
        </>
      ) : (
        <p className="text-[13.5px] text-ink-2">
          No personas yet.{' '}
          <a href={legacy('company-profile')} title={OUT_TIP} className="font-semibold text-accent-text hover:underline">
            Add one
          </a>{' '}
          and it is used from here on.
        </p>
      )}
    </div>
  )
}

/** One of the kind's questions (v113QHtml): chips for one answer or several, a switch, or a box to type in. */
function QField({ q, v, set }: { q: Q; v: Answer | undefined; set: (v: Answer) => void }) {
  if (q.kind === 'seg' || q.kind === 'multi') {
    const many = q.kind === 'multi'
    const L = Array.isArray(v) ? v : []
    return (
      <div>
        <span className={lbl + ' mb-1.5'}>{q.label}</span>
        <div role={many ? 'group' : 'radiogroup'} aria-label={q.label} className="flex flex-wrap gap-1.5">
          {(q.opts ?? []).map((o) => {
            const on = many ? L.includes(o) : v === o
            return (
              <button
                key={o}
                type="button"
                {...(many ? { 'aria-pressed': on } : { role: 'radio', 'aria-checked': on })}
                onClick={() => set(many ? (on ? L.filter((x) => x !== o) : [...L, o]) : o)}
                className={chipCls(on, true)}
              >
                {on ? <Check size={13} aria-hidden="true" /> : null}
                {o}
              </button>
            )
          })}
        </div>
      </div>
    )
  }
  if (q.kind === 'yes')
    return (
      <label className="flex items-center gap-2 text-[14px] text-ink">
        <input type="checkbox" checked={v === true} onChange={(e) => set(e.target.checked)} className="h-4 w-4 accent-[var(--color-action)]" />
        <span>{q.label}</span>
      </label>
    )
  return (
    <label className="block">
      <span className={lbl}>
        {q.label}
        <small className={small}>optional</small>
      </span>
      <input value={typeof v === 'string' ? v : ''} onChange={(e) => set(e.target.value)} placeholder={q.ph} maxLength={300} className={inputCls + ' mt-1.5'} />
    </label>
  )
}

/** Must use (nwMustField): chips over a box; Enter or ; adds, Backspace in an empty box takes the last off. */
function MustUse({
  must,
  typed,
  setTyped,
  inputRef,
  add,
  remove,
  sugg,
}: {
  must: string[]
  typed: string
  setTyped: (s: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  add: (s: string) => void
  remove: (i: number) => void
  sugg: string[]
}) {
  return (
    <div>
      <span className={lbl + ' mb-1.5'}>
        Must use<small className={small}>a stat, offer, phrase or angle</small>
      </span>
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-sm border border-line bg-panel px-2 py-1.5 focus-within:border-accent"
        onClick={(e) => {
          if (e.target === e.currentTarget) inputRef.current?.focus()
        }}
      >
        {must.map((m, i) => (
          <span key={m} className="inline-flex max-w-full items-center gap-1 rounded-full bg-sunk py-0.5 pl-2.5 pr-1 text-[13px] font-semibold text-ink">
            <span className="truncate">{m}</span>
            <button type="button" aria-label={'Remove ' + m} onClick={() => remove(i)} className="rounded-full p-0.5 text-ink-3 hover:text-ink">
              <X size={13} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={typed}
          onChange={(e) => setTyped(e.target.value.replace(/;/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ';') {
              e.preventDefault()
              add(typed)
            } else if (e.key === 'Backspace' && !typed && must.length) remove(must.length - 1)
          }}
          onBlur={() => {
            if (typed.trim()) add(typed)
          }}
          maxLength={MAX.must}
          autoComplete="off"
          aria-label="Must use"
          placeholder={must.length ? 'Add another' : 'Type and press Enter'}
          className="min-w-[140px] flex-1 border-0 bg-transparent px-1 py-0.5 text-[14px] text-ink focus:outline-none"
        />
      </div>
      {sugg.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Suggestions">
          {sugg.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className={chipCls(false, true)}>
              <Plus size={13} aria-hidden="true" />
              {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** A row of It will use (nwUse): a tick, or a warning when it is missing; its title opens it when it has a place. */
function UseRow({ use, href, out, action }: { use: Use; href?: string; out?: boolean; action?: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5" data-testid="use-row">
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${use.ok ? 'bg-good-soft text-good' : 'bg-warn-soft text-warn'}`} aria-hidden="true">
        {use.ok ? <Check size={13} strokeWidth={2.4} /> : <AlertTriangle size={12} strokeWidth={2.4} />}
      </span>
      <div className="min-w-0 flex-1">
        <b className="block text-[14px] font-semibold text-ink">
          {href ? (
            out ? (
              <a href={href} title={OUT_TIP} className="hover:underline">
                {use.title}
              </a>
            ) : (
              <Link href={href} title="Open it" className="hover:underline">
                {use.title}
              </Link>
            )
          ) : (
            use.title
          )}
        </b>
        <span className="block text-[13px] text-ink-2">{use.sub}</span>
      </div>
      {action}
    </li>
  )
}

/** The draft on its way (nwWatchHtml): writing, ready (Review it), or did not finish (Try again). */
function WatchBox({
  watch,
  data,
  now,
  kicks,
  setKicks,
  onReview,
}: {
  watch: Watch | null
  data: ContentData
  now: number
  kicks: Record<string, string>
  setKicks: Dispatch<SetStateAction<Record<string, string>>>
  onReview: (id: string) => void
}) {
  const [busy, setBusy] = useState(false)
  if (!watch) return null
  const r = data.reqs.find((x) => x.id === watch.id)
  const title = watch.title || r?.title || 'Your draft'
  const t = title.length > 60 ? title.slice(0, 59).replace(/\s+\S*$/, '') + '…' : title
  const kick = kicks[watch.id]
  if (r && r.status === 'done' && r.outputId)
    return (
      <div className="mt-4 flex items-start gap-2.5 rounded-md border border-good/30 bg-good-soft px-3 py-2.5" data-testid="watch">
        <CheckCircle2 size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-good" />
        <div className="min-w-0 flex-1 text-[13.5px]">
          <b className="block text-ink">Draft ready: “{t}”</b>
          <span className="text-ink-2">It is waiting in Approvals too.</span>
        </div>
        <button type="button" className={primary} onClick={() => onReview(r.outputId)}>
          Review it
        </button>
      </div>
    )
  if ((r && r.status === 'error') || kick) {
    const again = async () => {
      setBusy(true)
      const x = await retryRequest(watch.id).catch(() => ({ ok: false as const, error: 'Could not reach the dashboard. Try again in a minute.' }))
      setBusy(false)
      if (!x.ok) return toast(x.error, 'warn')
      if (x.started) {
        setKicks((m) => {
          const n = { ...m }
          delete n[watch.id]
          return n
        })
        toast('Draft started. It usually takes about a minute.')
      } else {
        setKicks((m) => ({ ...m, [watch.id]: x.error ?? 'network error' }))
        toast('Saved, but the workflow did not start (' + (x.error ?? 'network error') + '). Try again from Drafts.', 'warn')
      }
    }
    return (
      <div className="mt-4 flex items-start gap-2.5 rounded-md border border-bad/30 bg-bad-soft px-3 py-2.5" data-testid="watch">
        <AlertTriangle size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-bad" />
        <div className="min-w-0 flex-1 text-[13.5px]">
          <b className="block text-ink">“{t}” did not finish</b>
          <span className="text-ink-2">{(r && r.status === 'error' && r.error) || 'The workflow did not start: ' + (kick || 'unknown')}</span>
        </div>
        <button type="button" className={btn} disabled={busy} onClick={() => void again()}>
          {busy ? 'Starting…' : 'Try again'}
        </button>
      </div>
    )
  }
  const pct = ({ queued: 15, extracting: 45, drafting: 75 } as Record<string, number>)[r?.status ?? 'queued'] ?? 15
  const m = Math.round((now - watch.t0) / 60000)
  const ago = m < 1 ? 'just now' : m === 1 ? 'a minute ago' : m < 60 ? m + ' minutes ago' : Math.round(m / 60) + ' h ago'
  return (
    <div role="status" className="mt-4 rounded-md border border-line bg-bg px-3 py-2.5" data-testid="watch">
      <div className="h-1.5 overflow-hidden rounded-full bg-sunk">
        <i className="block h-full rounded-full bg-info" style={{ width: pct + '%' }} />
      </div>
      <span className="mt-2 block text-[13.5px] text-ink-2">
        Writing “{t}”. Started {ago}. About a minute.
      </span>
    </div>
  )
}
