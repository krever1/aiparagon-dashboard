'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check } from 'lucide-react'
import { type UsesResult, proposalLanded, proposalUses, writeProposal } from '@/app/(app)/lead-pipeline/doc-actions'
import { Dialog } from '@/components/ui/dialog'
import { LocalDate, LocalUsDay } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import { type ProposalData, type ProposalRun, type UseRow, PROPOSAL_STALE_MS, usesSummary } from '@/lib/catalyst/proposal'
import type { LeadView } from '@/lib/catalyst/view'
import { ChangeAsk } from './change-ask'
import { ProposalDocument, printProposal } from './proposal-doc'

const btn = 'inline-flex items-center gap-1.5 rounded-sm border border-line bg-panel px-3 py-1.5 text-[13.5px] font-semibold text-ink hover:border-line-2'
const navy =
  'inline-flex items-center gap-1.5 rounded-sm bg-action px-3 py-1.5 text-[13.5px] font-semibold text-action-ink hover:bg-action-hover'
const ghost = 'rounded-sm border border-line px-3.5 py-2 text-[14px] font-semibold text-ink hover:border-line-2 disabled:opacity-60'
const primary =
  'inline-flex items-center gap-2 rounded-sm bg-action px-4 py-2 text-[14px] font-semibold text-action-ink hover:bg-action-hover disabled:opacity-60'

/** The mark's color by kind: a call purple, an email teal, anything else green; grey when it is missing. */
const MARK: Record<UseRow['kind'], string> = { call: '#6C5DD3', mail: '#2F7D6D', doc: '#1D7A4C', plain: '#1D7A4C' }

/** What a run reads: "Using 3 past documents, the call transcript and 2 emails", then each one (v132UsesHtml). */
export function UsesList({ rows }: { rows: UseRow[] }) {
  return (
    <div className="grid gap-1.5" data-testid="uses">
      <p className="text-[14px] font-bold text-ink">{usesSummary(rows)}</p>
      <ul className="grid gap-1.5">
        {rows.map((r, i) => (
          <li key={i} data-ok={r.ok ? 'yes' : 'no'} className={`flex items-start gap-2 text-[13.5px] leading-snug ${r.ok ? 'text-ink-2' : 'text-ink-3'}`}>
            <span
              aria-hidden="true"
              className="mt-px grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[11px] text-white"
              style={{ background: r.ok ? MARK[r.kind] : '#D0D5DD' }}
            >
              {r.ok ? '✓' : '–'}
            </span>
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {r.text}
              {r.date ? <LocalUsDay iso={r.date} /> : null}
              {r.after ?? ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * While a proposal is written, the page asks every 8 seconds whether it has landed (v132Poll); once it has, the page
 * reads it in and opens it. After 15 minutes it stops asking and says so.
 */
function useProposalWatch(run: ProposalRun | null, emails: string[], onReady: () => void) {
  const router = useRouter()
  const ready = useRef(onReady)
  useEffect(() => {
    ready.current = onReady
  })
  const t0 = run?.t0 ?? null
  const key = emails.join('\n')
  useEffect(() => {
    if (!t0) return
    let live = true
    let asking = false
    const tick = async () => {
      if (asking || !live) return
      asking = true
      try {
        const landed = await proposalLanded(key.split('\n'), t0)
        if (!live) return
        if (landed) {
          live = false
          ready.current()
          toast('The client proposal is ready.')
          router.refresh()
        } else if (Date.now() - Date.parse(t0) > PROPOSAL_STALE_MS) {
          live = false
          toast('The client proposal is taking longer than usual. Check back in a few minutes.', 'warn')
          router.refresh()
        }
      } catch {
        // asked again in 8 seconds
      } finally {
        asking = false
      }
    }
    const t = window.setInterval(tick, 8000)
    document.documentElement.dataset.proposalWatch = 'on'
    return () => {
      live = false
      window.clearInterval(t)
      delete document.documentElement.dataset.proposalWatch
    }
  }, [t0, key, router])
}

/**
 * The client proposal on the lead's Proposal tab (v132Lead, v132CardHtml): once the assessment is done, Write the
 * client proposal; once written, Read here (the document, editable), Save as PDF, What should change? and Write it
 * again. A run in progress shows for the whole team.
 */
export function ProposalCard({ lead, data, asks }: { lead: LeadView; data: ProposalData; asks: number }) {
  const v = data.view
  const run = data.run
  const params = useSearchParams()
  const [open, setOpenState] = useState(params.get('read') === 'proposal')
  // a link that asks for it when the page is kept alive (Next.js) opens it too
  const readParam = params.get('read')
  const [seenRead, setSeenRead] = useState(readParam)
  if (readParam !== seenRead) {
    setSeenRead(readParam)
    if (readParam === 'proposal') setOpenState(true)
  }
  const [ask, setAsk] = useState(false)
  // the document stays open across a reload while the address says so (Deliverables' Open lands here too)
  const setOpen = (on: boolean) => {
    setOpenState(on)
    const u = new URL(window.location.href)
    if (on) u.searchParams.set('read', 'proposal')
    else u.searchParams.delete('read')
    window.history.replaceState(null, '', u.pathname + u.search)
  }
  useProposalWatch(run, lead.emails, () => setOpen(true))

  const line = v ? (
    <>
      Written <LocalDate iso={v.createdAt} />
      {v.edited ? (
        <>
          {' · edited '}
          <LocalDate iso={v.edited.at} />
        </>
      ) : null}
      {v.from.length ? ' · from ' + v.from.join(', ') : ''}
    </>
  ) : (
    'The proposal the client receives, from the meetings and the assessment' +
    (data.template ? ', in the sections and branding of ' + data.template : '. Add a past proposal in Templates and it follows its sections and branding') +
    '. It is written after the proposal presentation.'
  )

  return (
    <div className="mt-4 rounded-md border border-line bg-panel p-4" data-testid="proposal-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <b className="block text-[15.5px] font-semibold text-ink">{v?.title || 'Client proposal'}</b>
          <small className="text-[13px] text-ink-3">{line}</small>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {v ? (
            <button type="button" aria-expanded={open} className={navy} onClick={() => setOpen(!open)}>
              {open ? 'Hide ▴' : 'Read here ▾'}
            </button>
          ) : null}
          {v ? (
            <button type="button" className={btn} onClick={() => printProposal(v)}>
              Save as PDF
            </button>
          ) : null}
          {v ? <ChangeAsk leadId={lead.id} agent="client_proposal" doc="client proposal" name={lead.name} count={asks} /> : null}
          {!run ? (
            <button type="button" className={v ? btn : navy} onClick={() => setAsk(true)}>
              {v ? 'Write it again' : 'Write the client proposal'}
            </button>
          ) : null}
        </div>
      </div>
      {run ? (
        <div role="status" className="mt-3 grid gap-2 rounded-md bg-sunk p-3.5" data-testid="proposal-writing">
          <b className="text-[14px] font-semibold text-ink">Writing the client proposal…</b>
          <div className="h-1 overflow-hidden rounded bg-line">
            <i className="block h-full w-2/5 animate-[prop-bar_1.6s_ease-in-out_infinite] rounded bg-action motion-reduce:animate-none" />
          </div>
          {run.uses.length ? <UsesList rows={run.uses} /> : null}
          <p className="text-[13.5px] text-ink-2">It takes a few minutes and shows here when it is ready. Nothing goes to the client: you review it first.</p>
        </div>
      ) : null}
      {v && open ? <ProposalDocument view={v} /> : null}
      {ask ? <ProposalQuestion lead={lead} onClose={() => setAsk(false)} /> : null}
    </div>
  )
}

/** The question before writing (v132Ask): what it reads, then Write it. Nothing goes to the client. */
function ProposalQuestion({ lead, onClose }: { lead: LeadView; onClose: () => void }) {
  const [uses, setUses] = useState<UsesResult | null>(null)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    proposalUses(lead.id)
      .then((r) => {
        if (live) setUses(r)
      })
      .catch(() => {
        if (live) setUses({ ok: false, error: '' })
      })
    return () => {
      live = false
    }
  }, [lead.id])

  const go = async () => {
    setBusy(true)
    setMsg({ text: 'Reading the call transcripts and emails, then starting…' })
    let r: Awaited<ReturnType<typeof writeProposal>>
    try {
      r = await writeProposal(lead.id)
    } catch {
      r = { ok: false, error: 'Could not start it: the dashboard could not be reached. Try again in a minute.' }
    }
    if (!r.ok) {
      setBusy(false)
      setMsg({ text: r.error, bad: true })
      return
    }
    onClose()
    toast(r.toast)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      kicker={'Catalyst · ' + lead.name}
      title={`Write the client proposal for ${lead.name}?`}
      width={620}
      footer={
        <>
          <span role="status" aria-live="polite" className={`mr-auto text-[13.5px] ${msg?.bad ? 'text-bad' : 'text-ink-2'}`} data-testid="proposal-msg">
            {msg?.text ?? ''}
          </span>
          <button type="button" onClick={onClose} className={ghost}>
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={go} className={primary}>
            <Check size={16} aria-hidden="true" />
            Write it
          </button>
        </>
      }
    >
      <div className="rounded-md border border-line bg-sunk/60 p-3.5">
        {!uses ? (
          <p role="status" className="text-[13.5px] text-ink-3">
            … Checking for call transcripts and emails…
          </p>
        ) : uses.ok ? (
          <UsesList rows={uses.rows} />
        ) : (
          <p className="text-[13.5px] text-ink-3">Could not check what it reads.{uses.error ? ' ' + uses.error : ''}</p>
        )}
      </div>
      <p className="mt-3 text-[14.5px] leading-relaxed text-ink">
        It writes the proposal the client receives, in your template’s sections and branding. It takes a few minutes and shows on this page when it is ready.
        Nothing goes to the client: you review it first.
      </p>
    </Dialog>
  )
}
