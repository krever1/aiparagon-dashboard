'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { archivePiece, askDraftChange, savePiece } from '@/app/(app)/content-transformation/actions'
import { Dialog } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import {
  DRAFT_WHY, type Draft, PIECE_FMT, PIECE_ST, type Piece, type PieceForm, askProblem, formOfDraft, formOfPiece, kindName, kindNoun, kindOf,
  pieceRow, pieceText,
} from '@/lib/pipeline/content'
import { clip } from '@/lib/touchpoint/approvals'
import { btn, ghost, inputCls, primary, selectCls } from './bits'

// Content Transformation's windows: What should change? on a draft (v126Ask), the library piece editor (apCpEditor:
// a draft kept as a piece, or a piece changed or archived) and the "how it works" texts behind the small i (E9_INFO's
// rev and pick).

const label = 'block text-[13.5px] font-semibold text-ink'
const small = 'font-normal text-ink-3'

/** What should change? on a draft: the button, and its window. */
export function AskChange({ d }: { d: Draft }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className={btn}
        title="Say what to do differently. Every new draft reads it, and on AI settings it can become a house rule."
        onClick={() => setOpen(true)}
      >
        What should change?
      </button>
      {open ? <AskWindow d={d} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function AskWindow({ d, onClose }: { d: Draft; onClose: () => void }) {
  const k = kindOf(d)
  const [picked, setPicked] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const first = useRef<HTMLButtonElement>(null)
  // the window opens after this mounts, so the first reason gets the focus once it is open
  useEffect(() => {
    first.current?.focus()
  }, [])
  const save = async () => {
    const bad = askProblem(picked, note)
    if (bad) return setMsg({ text: bad, bad: true })
    setBusy(true)
    setMsg({ text: 'Saving…' })
    const r = await askDraftChange({ id: d.id, picked, note }).catch(() => ({ ok: false as const, error: 'Could not reach the dashboard. Try again in a minute.' }))
    setBusy(false)
    if (!r.ok) return setMsg({ text: r.error, bad: true })
    onClose()
    toast('Saved. The next drafts take it into account.')
  }
  return (
    <Dialog
      open
      onClose={onClose}
      kicker={kindName(k) + ' · ' + clip(d.title, 60)}
      title={'What should change in this ' + kindNoun(k) + '?'}
      width={560}
      footer={
        <>
          <button type="button" className={ghost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primary} disabled={busy} onClick={() => void save()}>
            <Check size={15} aria-hidden="true" />
            Save
          </button>
        </>
      }
    >
      <p id="ask-lbl" className="mb-2 text-[14px] font-semibold text-ink">
        What was off?
      </p>
      <div role="group" aria-labelledby="ask-lbl" className="mb-4 flex flex-wrap gap-1.5">
        {DRAFT_WHY.map(([key, l], i) => {
          const on = picked.includes(key)
          return (
            <button
              key={key}
              ref={i === 0 ? first : undefined}
              type="button"
              aria-pressed={on}
              onClick={() => setPicked((p) => (on ? p.filter((x) => x !== key) : [...p, key]))}
              className={`rounded-full border px-3 py-1 text-[13.5px] font-semibold ${on ? 'border-accent bg-accent-soft text-accent-text' : 'border-line bg-panel text-ink-2 hover:border-line-2'}`}
            >
              {l}
            </button>
          )
        })}
      </div>
      <label className="block" htmlFor="ask-note">
        <span className={label}>
          Anything to add? <small className={small}>What to add, cut or do differently next time.</small>
        </span>
      </label>
      <textarea
        id="ask-note"
        rows={3}
        maxLength={500}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. Open with the client’s own words, and drop the pitch at the end"
        className={inputCls + ' mt-1.5'}
      />
      <p className="mt-2 text-[13px] text-ink-3">Every new draft reads the newest asks. On AI settings any of them can become a house rule.</p>
      <p role="status" aria-live="polite" className={`mt-2 min-h-[1.25em] text-[13.5px] ${msg?.bad ? 'text-bad' : 'text-ink-2'}`}>
        {msg?.text ?? ''}
      </p>
    </Dialog>
  )
}

/** What the piece editor opens: a draft to keep (with the hook on screen), or a piece on file. */
export type PieceOpen = { draft: Draft; hi: number } | { piece: Piece; fromDraft: boolean }

/** The library piece editor (apCpEditor): a draft kept as a piece, or a piece changed or archived. */
export function PieceEditor({ open, onClose }: { open: PieceOpen; onClose: () => void }) {
  const saved = 'piece' in open ? open.piece : null
  const fromDraft = 'draft' in open
  const [f, setF] = useState<PieceForm>(() => ('draft' in open ? formOfDraft(open.draft, open.hi) : formOfPiece(open.piece)))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState<'save' | 'archive' | null>(null)
  const [copied, setCopied] = useState(false)
  const set = (k: keyof PieceForm) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  const box = useRef<HTMLInputElement>(null)
  useEffect(() => {
    box.current?.focus()
  }, [])

  const save = async () => {
    setErr('')
    const r0 = pieceRow(f)
    if (!r0.ok) return setErr(r0.error)
    setBusy('save')
    const r = await savePiece({ id: saved?.id, draftId: 'draft' in open ? open.draft.id : undefined, form: f }).catch(() => ({
      ok: false as const,
      error: 'Could not save: the dashboard could not be reached',
    }))
    setBusy(null)
    if (!r.ok) return setErr(r.error)
    onClose()
    toast(r.created ? 'Saved to your content library.' : 'Saved.')
  }
  const archive = async () => {
    if (!saved) return
    setBusy('archive')
    const r = await archivePiece(saved.id).catch(() => ({ ok: false as const, error: 'Could not archive: the dashboard could not be reached' }))
    setBusy(null)
    if (!r.ok) return toast(r.error, 'warn')
    onClose()
    toast('Archived.')
  }
  const copy = () => {
    const r = pieceRow(f)
    const text = r.ok ? pieceText(r.row) : [f.hooks.split('\n')[0] ?? '', f.body, f.cta].filter((x) => x.trim()).join('\n\n')
    const ok = () => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    }
    navigator.clipboard.writeText(text).then(ok, ok)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={saved ? 'Edit saved piece' : 'Edit and save to your library'}
      width={760}
      footer={
        <>
          {saved ? (
            <>
              <button type="button" className={btn + ' border-bad/40 text-bad'} disabled={!!busy} onClick={() => void archive()}>
                {busy === 'archive' ? 'Archiving…' : 'Archive'}
              </button>
              <span className="grow" />
            </>
          ) : null}
          <button type="button" className={btn} onClick={copy}>
            <Copy size={14} aria-hidden="true" />
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <button type="button" className={ghost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primary} disabled={!!busy} onClick={() => void save()}>
            {busy === 'save' ? 'Saving…' : saved ? 'Save changes' : 'Save to library'}
          </button>
        </>
      }
    >
      <p className="mb-4 text-[14px] text-ink-2">
        {fromDraft
          ? 'Your edits are saved as a library piece. The original draft stays as it is in Content Transformation.'
          : 'Saved pieces live in Content Transformation, under Ideas.'}
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 min-[641px]:grid-cols-2">
        <label className="block">
          <span className={label}>Title</span>
          <input ref={box} className={inputCls + ' mt-1'} maxLength={200} value={f.title} onChange={set('title')} />
        </label>
        <label className="block">
          <span className={label}>Format</span>
          <select className={selectCls + ' mt-1 w-full py-2'} value={f.format} onChange={set('format')}>
            {PIECE_FMT.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-3 block">
        <span className={label}>
          Hooks or subject lines <small className={small}>one per line</small>
        </span>
        <textarea className={inputCls + ' mt-1'} rows={3} value={f.hooks} onChange={set('hooks')} />
      </label>
      <label className="mt-3 block">
        <span className={label}>Body</span>
        <textarea className={inputCls + ' mt-1'} rows={10} value={f.body} onChange={set('body')} />
      </label>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 min-[641px]:grid-cols-2">
        <label className="block">
          <span className={label}>Call to action</span>
          <input className={inputCls + ' mt-1'} maxLength={200} value={f.cta} onChange={set('cta')} />
        </label>
        <label className="block">
          <span className={label}>Headline</span>
          <input className={inputCls + ' mt-1'} maxLength={200} value={f.headline} onChange={set('headline')} />
        </label>
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 min-[641px]:grid-cols-2">
        <label className="block">
          <span className={label}>Tags</span>
          <input className={inputCls + ' mt-1'} maxLength={300} value={f.tags} onChange={set('tags')} placeholder="comma separated" />
        </label>
        <label className="block">
          <span className={label}>Status</span>
          <select className={selectCls + ' mt-1 w-full py-2'} value={f.status} onChange={set('status')}>
            {Object.entries(PIECE_ST).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-3 block">
        <span className={label}>Notes</span>
        <textarea
          className={inputCls + ' mt-1'}
          rows={2}
          maxLength={2000}
          value={f.notes}
          onChange={set('notes')}
          placeholder="Where it ran, what to change next time"
        />
      </label>
      {err ? (
        <p role="alert" className="mt-3 text-[13.5px] text-bad">
          {err}
        </p>
      ) : null}
    </Dialog>
  )
}

const INFO: Record<'rev' | 'pick', { t: string; p: string[] }> = {
  rev: {
    t: 'About the review checks',
    p: [
      'Tick each one when it is true. Your name and the date are saved with the sign-off.',
      'Not right yet? Use What should change? Every new draft reads the newest asks, and on AI settings any of them can become a house rule.',
    ],
  },
  pick: {
    t: 'Which brief gets used',
    p: [
      'Ads (Marketing Generation): the ad brief you send it from. Started without picking one, it uses the newest ad brief. After “Then build an ad strategy” it uses the brief that run just made.',
      'Drafts from your content: the newest approved brief of each kind. If none is approved yet, the newest one.',
      'Pulling from several briefs at once is not switched on. Tell us if you want it and it can be added as a setting.',
    ],
  },
}

/** The small i that opens a "how it works" text (e9Info). */
export function InfoButton({ k }: { k: 'rev' | 'pick' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-label={INFO[k].t}
        title={INFO[k].t}
        onClick={() => setOpen(true)}
        className="inline-grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line text-[11.5px] font-semibold text-ink-3 hover:border-line-2 hover:text-ink"
      >
        i
      </button>
      {open ? (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title={INFO[k].t}
          width={520}
          footer={
            <button type="button" className={primary} onClick={() => setOpen(false)}>
              Got it
            </button>
          }
        >
          {INFO[k].p.map((p, i) => (
            <p key={i} className="mb-2 text-[14.5px] leading-relaxed text-ink-2">
              {p}
            </p>
          ))}
        </Dialog>
      ) : null}
    </>
  )
}
