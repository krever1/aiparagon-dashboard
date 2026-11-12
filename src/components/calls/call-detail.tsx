'use client'

import { type ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { Folder } from 'lucide-react'
import { setCallType, syncCallToHubspot } from '@/app/(app)/calls/actions'
import { Ago, LocalCallWhen, usDateText } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import type { CallLead } from '@/lib/catalyst/calls-load'
import {
  type CallRow, type FtLine, crmBody, crmEmails, fathomLink, ftGuests, guestsOf, isFathomUrl, isOutside, minutesOf, peopleOf, shareToken, slackText,
  typeLabel, withLine,
} from '@/lib/catalyst/calls'
import { leadHref } from '@/lib/catalyst/view'
import { NewTypeDialog, TypeOptions } from './call-dialogs'
import { MiniMd } from './mini-md'
import { PostCall, type WriteRequest } from './post-call'

export type Seg = 'summary' | 'post' | 'transcript' | 'actions' | 'people'
export const SEGS: Seg[] = ['summary', 'post', 'transcript', 'actions', 'people']
export type Transcript = { lines: FtLine[] } | { error: string } | null

const ghost = 'inline-flex items-center gap-1.5 rounded-sm border border-line px-3 py-1.5 text-[13.5px] font-semibold text-ink hover:border-line-2 disabled:opacity-60'
const primaryCls = 'inline-flex items-center gap-1.5 rounded-sm bg-action px-3 py-1.5 text-[13.5px] font-semibold text-action-ink hover:bg-action-hover'
const chip = 'inline-flex items-center rounded-full border border-line px-2 py-0.5 text-[12.5px] text-ink-2'

function Mark({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const out: ReactNode[] = []
  const lo = text.toLowerCase()
  let i = 0
  let k = 0
  for (;;) {
    const j = lo.indexOf(q, i)
    if (j < 0) break
    if (j > i) out.push(text.slice(i, j))
    out.push(<mark key={k++}>{text.slice(j, j + q.length)}</mark>)
    i = j + q.length
  }
  out.push(text.slice(i))
  return <>{out}</>
}

function TranscriptView({ t }: { t: Transcript }) {
  const [q, setQ] = useState('')
  if (!t) {
    return (
      <p role="status" className="text-[14px] text-ink-3">
        Loading the transcript…
      </p>
    )
  }
  if ('error' in t) return <div className="rounded-md border border-bad/30 bg-bad-soft px-3.5 py-2.5 text-[14px] text-bad">{t.error}</div>
  if (!t.lines.length) return <p className="text-[14px] text-ink-3">Fathom has no transcript for this call.</p>
  const s = q.trim().toLowerCase()
  const hits = s ? t.lines.filter((l) => l.text.toLowerCase().includes(s) || l.speaker.toLowerCase().includes(s)) : t.lines
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the transcript"
          aria-label="Search the transcript"
          className="h-9 min-w-[200px] flex-1 rounded-sm border border-line bg-panel px-3 text-[14px] text-ink focus:border-accent focus:outline-none"
        />
        <span className="text-[12.5px] text-ink-3" data-testid="transcript-count">
          {s ? `${hits.length} of ${t.lines.length} lines` : `${t.lines.length} lines`}
        </span>
      </div>
      {hits.length ? (
        <ol className="max-h-[520px] space-y-1.5 overflow-y-auto pr-1">
          {hits.slice(0, 1500).map((l, i) => (
            <li key={i} className="grid grid-cols-[48px_minmax(0,1fr)] gap-2 text-[14px] leading-snug">
              <span className="font-mono text-[12px] text-ink-3">{l.t}</span>
              <span>
                <b className="font-semibold text-ink">
                  <Mark text={l.speaker || 'Speaker'} q={s} />
                </b>{' '}
                <span className="text-ink-2">
                  <Mark text={l.text} q={s} />
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[14px] text-ink-3">Nothing in the transcript matches that.</p>
      )}
    </div>
  )
}

function Player({ row, access, onCheck }: { row: CallRow; access: string | undefined; onCheck: (token: string) => void }) {
  const c = row.call
  const token = shareToken(c)
  const link = fathomLink(c)
  const [play, setPlay] = useState(false)
  useEffect(() => {
    if (token && access === undefined) onCheck(token)
  }, [token, access, onCheck])
  const watch = link ? (
    <a href={link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex rounded-sm bg-panel px-3 py-1.5 text-[13.5px] font-semibold text-ink hover:bg-sunk">
      ▶ Watch in Fathom ↗
    </a>
  ) : null
  const box = 'flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-md bg-[#101828] px-6 text-center text-[14px] text-white/85'
  if (!token) {
    return (
      <div className={box}>
        <span>This call has no share link yet, so it can only be watched in Fathom.</span>
        {watch}
      </div>
    )
  }
  if (access === undefined) {
    return (
      <div className={box} role="status">
        <span>Checking whether Fathom lets this call play here…</span>
      </div>
    )
  }
  if (access === 'team') {
    return (
      <>
        <div className={box}>
          <b className="text-[15.5px] font-semibold text-white">This call is team-only in Fathom</b>
          <span className="max-w-[440px] leading-relaxed">
            Fathom only plays it for people signed in to Fathom, and it won’t pass that sign-in to another website. Switch its share link to anyone with the link and
            it plays right here.
          </span>
          {watch}
        </div>
        <p className="mt-2 text-[13px] leading-snug text-ink-3">
          In Fathom: open the call, click <b className="font-semibold">Share</b> and pick <b className="font-semibold">Anyone with the link can view</b>. To make
          that the default for new calls, an admin can set <b className="font-semibold">Default Share Link Access</b> in Fathom’s organization settings.
        </p>
      </>
    )
  }
  return (
    <>
      {play ? (
        <iframe
          src={`https://fathom.video/embed/${token}?autoplay=1`}
          title="Fathom recording"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="aspect-video w-full rounded-md border-0 bg-black"
        />
      ) : (
        <button type="button" className={box + ' hover:text-white'} onClick={() => setPlay(true)}>
          <span className="text-[28px] leading-none" aria-hidden="true">
            ▶
          </span>
          <span>Play the recording here</span>
        </button>
      )}
      {access === 'unknown' ? (
        <p className="mt-2 text-[13px] text-ink-3">Could not check this call’s sharing. If Fathom asks you to sign in, open it in Fathom instead.</p>
      ) : null}
    </>
  )
}

export function CallDetail({
  row,
  lead,
  custom,
  auto,
  access,
  onCheckAccess,
  seg,
  setSeg,
  transcript,
  loadTranscript,
  writing,
  onWrite,
  onEdit,
  onRunAssessment,
}: {
  row: CallRow
  lead: CallLead | null
  custom: string[]
  auto: boolean
  access: string | undefined
  onCheckAccess: (token: string) => void
  seg: Seg
  setSeg: (s: Seg) => void
  transcript: Transcript
  loadTranscript: (id: string) => Promise<Transcript>
  writing: boolean
  onWrite: (r: WriteRequest) => Promise<boolean>
  onEdit: () => void
  onRunAssessment: () => Promise<void>
}) {
  const c = row.call
  const m = row.meta
  const o = row.out
  const set = m?.meeting_type ?? ''
  const people = peopleOf(c, m)
  const fg = ftGuests(c)
  const mins = minutesOf(c)
  const link = fathomLink(c)
  const [newType, setNewType] = useState(false)
  const [typeBusy, setTypeBusy] = useState(false)
  const [crmBusy, setCrmBusy] = useState(false)
  const [copyLabel, setCopyLabel] = useState('⧉ Copy transcript')

  useEffect(() => {
    if (seg === 'transcript' && !transcript) void loadTranscript(c.id)
  }, [seg, transcript, c.id, loadTranscript])

  const saveType = async (v: string) => {
    setTypeBusy(true)
    const r = await setCallType(c.id, v).catch(() => ({ ok: false as const, error: 'Could not save the call type: the dashboard could not be reached.' }))
    setTypeBusy(false)
    toast(r.ok ? r.toast : r.error, r.ok ? 'ok' : 'warn')
  }

  const sync = async () => {
    const emails = crmEmails(guestsOf(c, m))
    if (!emails.length) {
      toast('Add the client’s email under the call’s guests first.', 'warn')
      return onEdit()
    }
    setCrmBusy(true)
    const r = await syncCallToHubspot(c.id, {
      title: row.title,
      start: c.start,
      end: c.end,
      emails,
      body: crmBody({ type: row.type, meta: m, out: o, ftSummary: c.summary, link }),
    }).catch(() => ({ ok: false as const, error: 'Could not reach the dashboard.' }))
    setCrmBusy(false)
    toast(r.ok ? r.toast : r.error, r.ok ? 'ok' : 'warn')
  }

  const copyTranscript = async () => {
    setCopyLabel('Loading…')
    const t = transcript ?? (await loadTranscript(c.id))
    if (!t || 'error' in t) {
      setCopyLabel('⧉ Copy transcript')
      return toast(t && 'error' in t ? t.error : 'Fathom has no transcript for this call.', 'warn')
    }
    if (!t.lines.length) {
      setCopyLabel('⧉ Copy transcript')
      return toast('Fathom has no transcript for this call.', 'warn')
    }
    try {
      await navigator.clipboard.writeText(t.lines.map((l) => (l.speaker ? l.speaker + ': ' : '') + l.text).join('\n'))
      setCopyLabel('✓ Copied')
    } catch {
      setCopyLabel('Copy blocked by the browser')
    }
    setTimeout(() => setCopyLabel('⧉ Copy transcript'), 1600)
  }

  const chips = [
    m?.folder ? (
      <span key="f" className={chip} title="Folder">
        {m.folder}
      </span>
    ) : null,
    ...(m?.tags ?? []).slice(0, 12).map((t) => (
      <span key={'t' + t} className={chip}>
        #{t}
      </span>
    )),
    o?.status === 'done' ? (
      <span key="ok" className="inline-flex items-center rounded-full bg-good-soft px-2 py-0.5 text-[12.5px] font-semibold text-good" title="Post-call actions are ready">
        Actions ready
      </span>
    ) : null,
  ].filter(Boolean)
  const synced = !!(m?.crm_synced_at && m.crm_result?.ok)
  const segLabel: Record<Seg, string> = {
    summary: 'Summary',
    post: writing ? 'Post-call …' : o?.status === 'done' ? 'Post-call ✓' : 'Post-call',
    transcript: 'Transcript',
    actions: 'Fathom actions' + (c.actions.length ? ` (${c.actions.length})` : ''),
    people: 'People' + (fg.length ? ` (${fg.length})` : ''),
  }

  return (
    <article className="min-w-0 rounded-lg border border-line bg-panel p-4 shadow-card sm:p-5" aria-label={row.title} data-testid="call-detail" data-id={c.id}>
      <h2 className="flex flex-wrap items-center gap-2 font-display text-[22px] font-semibold leading-tight text-ink">
        {row.title}
        {row.client ? <span className="rounded-full bg-accent-soft px-2 py-0.5 font-sans text-[11.5px] font-semibold text-accent-text">Client</span> : null}
      </h2>
      <p className="mt-1 text-[13.5px] text-ink-3">
        <LocalCallWhen iso={c.start} />
        {mins ? ` · ${mins} min` : ''}
        {c.recordedBy?.name ? ` · recorded by ${c.recordedBy.name}` : ''}
        {fg.length ? ` · ${fg.length} guest${fg.length === 1 ? '' : 's'}` : ''}
      </p>

      <div className="mt-3 space-y-2.5 rounded-md bg-sunk/60 p-3.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink-2">
            Call type
            <select
              aria-label="Call type"
              value={set}
              disabled={typeBusy}
              onChange={(e) => (e.target.value === '__new' ? setNewType(true) : saveType(e.target.value))}
              className="h-8 rounded-sm border border-line bg-panel px-2 text-[13.5px] font-normal text-ink"
            >
              <option value="">{!set && row.type ? 'AI pick: ' + typeLabel(row.type) : 'No type yet'}</option>
              <TypeOptions current={set} custom={custom} />
              <option value="__new">+ New type…</option>
            </select>
          </label>
          <span className="text-[13.5px] text-ink-2" title={people.map((p) => (p.name || p.email) + (isOutside(p) ? ' (client side)' : '')).join(', ')}>
            {withLine(people)}
          </span>
          <button type="button" className="text-[13.5px] font-semibold text-accent-text hover:underline" onClick={onEdit}>
            {people.some((p) => p.name || p.email) ? 'Edit people and client' : 'Add people'}
          </button>
        </div>
        <p className="flex items-center gap-1.5 text-[13.5px] text-ink-2">
          <Folder size={15} aria-hidden="true" className="text-ink-3" />
          Filed under <b className="font-semibold text-ink">{row.folder}</b>
        </p>
        {chips.length ? <div className="flex flex-wrap gap-1.5">{chips}</div> : null}
        {m?.client ? (
          <p className="text-[13.5px] text-ink-2">
            Client: <b className="font-semibold text-ink">{m.client}</b>
          </p>
        ) : null}
        {m?.description ? <p className="text-[14px] text-ink">{m.description}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={ghost} onClick={onEdit}>
            {chips.length || m?.description ? '✎ Edit details' : '✎ Add details'}
          </button>
          <button type="button" className={ghost} disabled={crmBusy} onClick={sync}>
            {crmBusy ? 'Syncing…' : synced ? 'Sync to HubSpot again' : 'Sync to HubSpot'}
          </button>
          {m?.crm_result ? (
            m.crm_result.ok ? (
              <span className="text-[13px] text-good">
                Logged in HubSpot <Ago iso={m.crm_synced_at} /> on {m.crm_result.contacts.map((x) => x.name || x.email).join(', ')}
              </span>
            ) : (
              <span className="text-[13px] text-warn">{m.crm_result.message}</span>
            )
          ) : null}
        </div>
        {lead ? (
          <p className="flex flex-wrap items-center gap-2 border-t border-line pt-2.5 text-[13.5px] text-ink-2" data-testid="call-lead">
            <span>
              Catalyst lead: <b className="font-semibold text-ink">{lead.name}</b>
              {lead.company ? ` · ${lead.company}` : ''} · {lead.progress}
            </span>
            <Link href={leadHref(lead.id)} className="font-semibold text-accent-text hover:underline">
              Open lead
            </Link>
          </p>
        ) : null}
      </div>

      <div className="mt-4">
        <Player key={c.id} row={row} access={access} onCheck={onCheckAccess} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={'/content-transformation?' + new URLSearchParams({ call: c.id, title: row.title, ...(link ? { link } : {}) })} className={primaryCls} title="Pulls this call’s transcript into New draft on Content Transformation as the source">
          ✎ Use as content source
        </Link>
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className={ghost}>
            Open in Fathom ↗
          </a>
        ) : null}
        <button type="button" className={ghost} onClick={copyTranscript}>
          {copyLabel}
        </button>
      </div>

      <div role="tablist" aria-label="About this call" className="mt-4 flex flex-wrap gap-1 border-b border-line">
        {SEGS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={seg === s}
            onClick={() => setSeg(s)}
            className={`-mb-px border-b-2 px-3 py-2 text-[14px] font-semibold ${seg === s ? 'border-accent text-ink' : 'border-transparent text-ink-3 hover:text-ink'}`}
          >
            {segLabel[s]}
          </button>
        ))}
      </div>
      <div className="pt-4" role="tabpanel" aria-label={segLabel[seg]}>
        {seg === 'summary' ? (
          c.summary ? (
            <MiniMd text={c.summary} />
          ) : (
            <p className="text-[14px] text-ink-3">Fathom has no summary for this call.</p>
          )
        ) : seg === 'transcript' ? (
          <TranscriptView t={transcript} />
        ) : seg === 'actions' ? (
          c.actions.length ? (
            <ul className="space-y-2">
              {c.actions.map((a, i) => (
                <li key={i} className="flex gap-2.5 text-[14px]">
                  <span
                    aria-label={a.done ? 'Done' : undefined}
                    className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-sm border text-[11px] ${a.done ? 'border-good bg-good text-white' : 'border-line-2'}`}
                  >
                    {a.done ? '✓' : ''}
                  </span>
                  <span>
                    <span className="text-ink">{a.text}</span>
                    <small className="block text-[12.5px] text-ink-3">
                      {[a.who, a.t].filter(Boolean).join(' · ')}
                      {isFathomUrl(a.link) ? (
                        <>
                          {a.who || a.t ? ' · ' : ''}
                          <a href={a.link} target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline">
                            Jump to this moment ↗
                          </a>
                        </>
                      ) : null}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-ink-3">No action items on this call.</p>
          )
        ) : seg === 'people' ? (
          c.recordedBy || fg.length ? (
            <ul className="space-y-2">
              {[...(c.recordedBy ? [{ name: c.recordedBy.name, email: c.recordedBy.email, role: 'Recorded the call' }] : []), ...fg.map((g) => ({ name: g.name, email: g.email, role: g.external ? 'Guest from outside' : 'Teammate' }))].map(
                (p, i) => (
                  <li key={i} className="flex items-center gap-2.5">
                    <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sunk text-[13px] font-semibold text-ink-2">
                      {(p.name || p.email || '?').charAt(0).toUpperCase()}
                    </span>
                    <span>
                      <b className="block text-[14px] font-semibold text-ink">{p.name || p.email}</b>
                      <small className="text-[12.5px] text-ink-3">{[p.role, p.email].filter(Boolean).join(' · ')}</small>
                    </span>
                  </li>
                ),
              )}
            </ul>
          ) : (
            <p className="text-[14px] text-ink-3">No invite list on this call.</p>
          )
        ) : (
          <PostCall
            key={c.id}
            row={row}
            auto={auto}
            custom={custom}
            writing={writing}
            onWrite={onWrite}
            slackText={slackText({ title: row.title, day: usDateText(c.start), type: row.type, out: o, link })}
            onRunAssessment={onRunAssessment}
          />
        )}
      </div>

      {newType ? (
        <NewTypeDialog
          onDone={(name) => {
            setNewType(false)
            if (name) void saveType(name)
          }}
        />
      ) : null}
    </article>
  )
}
