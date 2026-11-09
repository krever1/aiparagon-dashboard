'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, PenLine, Search } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { LocalDate, LocalDay } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import { saveStageNames } from '@/app/(app)/lead-pipeline/actions'
import {
  STAGES, STAGE_NAME_MAX, type Stage, type StageKey, cleanName, firmTypeLabel, runLabel, stagesNamed,
} from '@/lib/catalyst/stages'
import {
  type LeadView, type PipelineData, type PipelineTab, hasDoc, leadHref, matchesSearch, pipelineTab, stripCounts, viewStage,
} from '@/lib/catalyst/view'
import { Banner, ErrorNotice, FitPill, StageDot, StripTile, Tabs, plural } from './bits'
import { useCheckBack } from './check-back'
import { type Ask, StageQuestion, stillWriting } from './stage-question'

/**
 * Lead pipeline: every prospect and client, by meeting stage. The Board tab shows a column per stage; All and the
 * stage tabs list the same leads. The tab is the address's (?tab=), so a link opens the same view and the sidebar's
 * Lead pipeline goes back to the board.
 */
export function PipelineView({ data }: { data: PipelineData }) {
  const tab = pipelineTab(useSearchParams().get('tab'))
  const [listQ, setListQ] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [ask, setAsk] = useState<Ask | null>(null)
  const stages = useMemo(() => stagesNamed(data.names), [data.names])
  const c = useMemo(() => stripCounts(data.leads), [data.leads])
  useCheckBack(data.leads.some((l) => l.run))
  const onAsk = (lead: LeadView, stage: StageKey, move: boolean) => {
    if (!stillWriting(lead)) setAsk({ lead, stage, move })
  }

  const go = (t: PipelineTab) => {
    const u = new URL(window.location.href)
    if (t === 'board') u.searchParams.delete('tab')
    else u.searchParams.set('tab', t)
    window.history.replaceState(null, '', u.pathname + u.search)
  }

  const clientTab: StageKey = c.by.onboarding > 0 || c.by.review === 0 ? 'onboarding' : 'review'
  const tiles: { n: number; label: string; tip: string; to: PipelineTab }[] = [
    { n: c.leads, label: 'Leads', tip: 'all prospects and clients', to: 'all' },
    { n: c.sales, label: 'In the sales stages', tip: 'research to proposal', to: 'board' },
    { n: c.clients, label: 'Clients', tip: 'onboarding and client review', to: clientTab },
    { n: c.strong, label: 'Strong fit', tip: 'rated before the call', to: 'all' },
  ]
  const lit = tiles.findIndex((t) => t.to === tab)

  return (
    <>
      <Banner tag="Catalyst" text="One card per prospect" tip="Open a card for every document it has. The other tabs list the same leads." />
      <div className="mb-4 flex flex-wrap gap-2" data-testid="strip">
        {tiles.map((t, i) => (
          <StripTile key={t.label} n={t.n} label={t.label} tip={t.tip} active={i === lit} onClick={() => go(t.to)} />
        ))}
      </div>
      <Tabs<PipelineTab>
        label="Lead pipeline views"
        active={tab}
        onPick={go}
        tabs={[
          { key: 'board', label: 'Board' },
          { key: 'all', label: 'All', count: c.leads },
          ...stages.map((s) => ({ key: s.key as PipelineTab, label: s.name, count: c.by[s.key] })),
        ]}
      />
      {data.error ? <ErrorNotice>{data.error}</ErrorNotice> : null}
      {tab === 'board' ? (
        <Board leads={data.leads} stages={stages} onRename={() => setRenaming(true)} onAsk={onAsk} />
      ) : (
        <LeadList leads={data.leads} stages={stages} tab={tab} q={listQ} setQ={setListQ} />
      )}
      {renaming ? <RenameStages stages={stages} onClose={() => setRenaming(false)} /> : null}
      {ask ? <StageQuestion key={ask.lead.id + ask.stage} ask={ask} stages={stages} onClose={() => setAsk(null)} /> : null}
    </>
  )
}

function SearchBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="relative block w-full max-w-[360px]">
      <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search prospect, company or email…"
        aria-label={label}
        className="h-10 w-full rounded-sm border border-line bg-panel pl-9 pr-3 text-[14.5px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
      />
    </label>
  )
}

function Board({
  leads,
  stages,
  onRename,
  onAsk,
}: {
  leads: LeadView[]
  stages: Stage[]
  onRename: () => void
  onAsk: (lead: LeadView, stage: StageKey, move: boolean) => void
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [drag, setDrag] = useState<LeadView | null>(null)
  const [over, setOver] = useState<StageKey | null>(null)
  const shown = leads.filter((l) => matchesSearch(l, q))
  const open = (l: LeadView) => router.push(leadHref(l.id))
  // a lead can go to any other stage; its own column takes no drop, and a lead being written takes no move
  const canDrop = (l: LeadView | null, s: StageKey) => !!l && !l.run && viewStage(l) !== s
  return (
    <section aria-label="Board">
      <p className="mb-3 text-[14.5px] text-ink-2">
        Move a lead to the stage it is in. Catalyst writes that stage’s prep, and asks before it runs anything.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} label="Search leads" />
        <span className="text-[13.5px] text-ink-3" data-testid="board-count">
          {q.trim() ? `${shown.length} of ${leads.length} shown` : plural(leads.length, 'lead')}
        </span>
        <button
          type="button"
          onClick={onRename}
          className="ml-auto inline-flex items-center gap-2 rounded-sm border border-line bg-panel px-3 py-2 text-[13.5px] font-semibold text-ink hover:border-line-2"
        >
          <PenLine size={15} aria-hidden="true" />
          Rename stages
        </button>
      </div>
      <div className="@container">
        <div className="grid grid-cols-1 gap-3 @min-[600px]:grid-cols-3 @min-[940px]:grid-cols-6">
          {stages.map((s) => {
            const col = shown.filter((l) => viewStage(l) === s.key)
            const no = !!drag && !canDrop(drag, s.key)
            return (
              <div
                key={s.key}
                role="group"
                data-s={s.key}
                data-over={over === s.key ? 'yes' : undefined}
                aria-label={`${s.name}, ${plural(col.length, 'lead')}`}
                onDragOver={(e) => {
                  if (!canDrop(drag, s.key)) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (over !== s.key) setOver(s.key)
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === s.key ? null : o))
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const id = e.dataTransfer.getData('text/plain')
                  const lead = drag ?? leads.find((l) => l.id === id) ?? null
                  setDrag(null)
                  setOver(null)
                  if (lead && canDrop(lead, s.key)) onAsk(lead, s.key, true)
                }}
                className={`flex flex-col gap-2.5 rounded-md p-2.5 transition-[opacity,background-color] @min-[600px]:max-h-[72vh] @min-[600px]:min-h-[220px] @min-[600px]:overflow-y-auto @min-[940px]:min-h-[320px] ${
                  over === s.key ? 'bg-info-soft outline-2 outline-dashed outline-info/60' : 'bg-[#e5e8ef]'
                } ${no ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start gap-2 px-1 pt-1">
                  <StageDot color={s.color} className="mt-[7px]" />
                  <b className="min-w-0 flex-1 text-[14.5px] font-semibold leading-snug text-ink">{s.name}</b>
                  <span className="rounded-full bg-panel px-2 py-0.5 text-[11.5px] font-semibold text-ink-2">{col.length}</span>
                </div>
                {col.length ? (
                  col.map((l) => (
                    <Card
                      key={l.id}
                      l={l}
                      s={s}
                      stages={stages}
                      onOpen={open}
                      onRun={() => onAsk(l, s.key, false)}
                      dragging={drag?.id === l.id}
                      onDrag={(on) => {
                        setDrag(on ? l : null)
                        if (!on) setOver(null)
                      }}
                    />
                  ))
                ) : (
                  <p className="py-6 text-center text-[13.5px] text-ink-3">No leads here</p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function Card({
  l,
  s,
  stages,
  onOpen,
  onRun,
  dragging,
  onDrag,
}: {
  l: LeadView
  s: Stage
  stages: Stage[]
  onOpen: (l: LeadView) => void
  onRun: () => void
  dragging: boolean
  onDrag: (on: boolean) => void
}) {
  const ready = hasDoc(l, s.key)
  const writing = l.run ? stages.find((x) => x.key === l.run!.s) : null
  const meta = [l.company, firmTypeLabel(l.firmType)].filter(Boolean).join(' · ')
  const label = `${l.name}, ${s.name}${writing ? `, writing ${writing.what}` : ready ? `, ${s.doc} ready` : ''}. Open the lead`
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      data-lead={l.id}
      draggable={!l.run}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', l.id)
        e.dataTransfer.effectAllowed = 'move'
        onDrag(true)
      }}
      onDragEnd={() => onDrag(false)}
      onClick={() => onOpen(l)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(l)
        }
      }}
      className={`cursor-pointer rounded-[10px] border border-t-[3px] border-line bg-panel p-3 shadow-card transition-[box-shadow,opacity] hover:shadow-pop ${
        dragging ? 'opacity-45' : ''
      }`}
      style={{ borderTopColor: s.color }}
    >
      <b className="block break-words text-[15px] font-semibold leading-snug text-ink">{l.name}</b>
      {meta ? <div className="mt-0.5 break-words text-[13px] leading-snug text-ink-2">{meta}</div> : null}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
        <LocalDay iso={l.updatedAt} />
        <FitPill fit={l.fit} />
      </div>
      <div className="mt-2.5">
        {writing ? (
          <div role="status" className="flex items-center gap-2 text-[13px] font-semibold text-accent-text">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" />
            Writing {writing.what}
          </div>
        ) : ready ? (
          <Link
            href={leadHref(l.id, s.key)}
            title={`Open the ${s.doc.toLowerCase()}`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 rounded-sm bg-good-soft px-2.5 py-1.5 text-[13px] font-semibold text-good hover:bg-[#d3ebdd]"
          >
            <Check size={14} aria-hidden="true" />
            {s.short} ready
          </Link>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRun()
            }}
            onKeyDown={(e) => e.stopPropagation()}
            className="rounded-sm border border-line-2 bg-panel px-2.5 py-1.5 text-[13px] font-semibold text-ink hover:border-action"
          >
            {runLabel(s)}
          </button>
        )}
      </div>
    </div>
  )
}

function LeadList({
  leads,
  stages,
  tab,
  q,
  setQ,
}: {
  leads: LeadView[]
  stages: Stage[]
  tab: 'all' | StageKey
  q: string
  setQ: (v: string) => void
}) {
  const router = useRouter()
  const stage = tab === 'all' ? null : stages.find((s) => s.key === tab) ?? null
  const inTab = stage ? leads.filter((l) => viewStage(l) === stage.key) : leads
  const shown = inTab.filter((l) => matchesSearch(l, q))
  const anyFit = shown.some((l) => l.fit)
  const eyebrow = stage ? stage.name : 'All'
  const title = stage ? `In ${stage.name.toLowerCase()}, prep: ${stage.doc.toLowerCase()}` : 'Every prospect in Catalyst'
  const byKey = Object.fromEntries(stages.map((s) => [s.key, s])) as Record<StageKey, Stage>

  return (
    <section aria-label={title} className="rounded-lg border border-line bg-panel shadow-card">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-accent-text">{eyebrow}</p>
          <h2 className="font-display text-[22px] font-semibold text-ink">
            {title} <span className="ml-1 font-sans text-[13.5px] font-normal text-ink-3">{shown.length} shown</span>
          </h2>
        </div>
        <SearchBox value={q} onChange={setQ} label="Search the list" />
      </div>
      {/* relative: the hidden "Open" header label is absolutely placed, and must stay inside the scroll box */}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-[14px]">
          <thead className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            <tr className="border-b border-line">
              <th scope="col" className="px-5 py-2.5 font-semibold">Prospect</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Company</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Stage</th>
              {anyFit ? <th scope="col" className="px-3 py-2.5 font-semibold">Fit</th> : null}
              <th scope="col" className="px-3 py-2.5 font-semibold">Updated</th>
              <th scope="col" className="px-5 py-2.5">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => {
              const s = byKey[viewStage(l)]
              return (
                <tr
                  key={l.id}
                  data-lead={l.id}
                  onClick={() => router.push(leadHref(l.id))}
                  className="cursor-pointer border-b border-line last:border-b-0 hover:bg-sunk"
                >
                  <td className="px-5 py-3 align-top">
                    <b className="block font-semibold text-ink">{l.name === l.email ? '—' : l.name}</b>
                    <span className="block text-[13px] text-ink-2">{l.email}</span>
                    {l.anonEmail ? (
                      <span
                        className="mt-1 inline-block rounded-full bg-sunk px-2 py-0.5 text-[12px] text-ink-2"
                        title={`Anonymized identity used by agents 3–5: ${l.anonCompany} · ${l.anonEmail}`}
                      >
                        🕶 {l.anonEmail}
                      </span>
                    ) : l.emails.length > 1 ? (
                      <span className="mt-1 inline-block rounded-full bg-sunk px-2 py-0.5 text-[12px] text-ink-2" title={`Merged runs: ${l.emails.join(', ')}`}>
                        +{l.emails.length - 1} run
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span className="block text-ink">{l.company || '—'}</span>
                    {l.firmType ? <small className="block text-[12.5px] text-ink-3">{l.firmType}</small> : null}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span className="inline-flex items-center gap-2 text-ink">
                      <StageDot color={s.color} />
                      {s.name}
                    </span>
                    <small className="block text-[12.5px] text-ink-3">{plural(l.docCount, 'document')}</small>
                  </td>
                  {anyFit ? (
                    <td className="px-3 py-3 align-top">
                      <FitPill fit={l.fit} />
                    </td>
                  ) : null}
                  <td className="px-3 py-3 align-top text-ink-2">
                    <LocalDate iso={l.updatedAt} />
                  </td>
                  <td className="px-5 py-3 text-right align-top">
                    <Link
                      href={leadHref(l.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex rounded-sm border border-line bg-panel px-3 py-1.5 text-[13px] font-semibold text-ink hover:border-line-2"
                    >
                      Full view
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {shown.length === 0 ? (
          <div className="px-5 py-10 text-center">
            {leads.length === 0 ? (
              <>
                <b className="block font-display text-[19px] text-ink">No leads yet</b>
                <p className="mt-1 text-[14px] text-ink-2">
                  New webhook submissions appear here after the first run with the dashboard save nodes in place.
                </p>
              </>
            ) : (
              <p className="text-[14.5px] text-ink-2">{q.trim() ? 'No leads match this search.' : 'No leads here'}</p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function RenameStages({ stages, onClose }: { stages: Stage[]; onClose: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(stages.map((s) => [s.key, s.name])))
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const next = stages.map((s) => cleanName(vals[s.key]) || s.defaultName)
    if (next.every((n, i) => n === stages[i].name)) return onClose()
    setBusy(true)
    setMsg({ text: 'Saving…' })
    const res = await saveStageNames(vals)
    if (!res.ok) {
      setBusy(false)
      setMsg({ text: `Could not save the names: ${res.error}. Try again in a minute.`, bad: true })
      return
    }
    onClose()
    toast('Saved. The whole team sees the new names.')
  }

  return (
    <Dialog
      open
      onClose={onClose}
      kicker="Catalyst · Lead pipeline"
      title="Rename the stages"
      width={680}
      footer={
        <>
          <span role="status" aria-live="polite" className={`mr-auto text-[13.5px] ${msg?.bad ? 'text-bad' : 'text-ink-2'}`}>
            {msg?.text ?? ''}
          </span>
          <button
            type="button"
            onClick={() => setVals(Object.fromEntries(STAGES.map((s) => [s.key, s.defaultName])))}
            className="rounded-sm px-3 py-2 text-[14px] font-semibold text-ink-2 hover:bg-sunk hover:text-ink"
          >
            Use the usual names
          </button>
          <button type="button" onClick={onClose} className="rounded-sm border border-line px-3.5 py-2 text-[14px] font-semibold text-ink hover:border-line-2">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="inline-flex items-center gap-2 rounded-sm bg-action px-4 py-2 text-[14px] font-semibold text-action-ink hover:bg-action-hover disabled:opacity-60"
          >
            <Check size={16} aria-hidden="true" />
            Save names
          </button>
        </>
      }
    >
      <p className="mb-4 text-[14.5px] leading-relaxed text-ink-2">
        Your names for the meetings, for the whole team: on the board, the tabs and each lead’s page. What each stage writes
        stays the same.
      </p>
      <div className="grid grid-cols-1 gap-x-5 gap-y-3.5 sm:grid-cols-2">
        {stages.map((s, i) => (
          <label key={s.key} className="block">
            <span className="block text-[13.5px] font-semibold text-ink">
              {i + 1}. {s.defaultName}
            </span>
            <small className="mb-1 block text-[12.5px] text-ink-3">Writes {s.what}</small>
            <input
              type="text"
              data-k={s.key}
              maxLength={STAGE_NAME_MAX}
              placeholder={s.defaultName}
              value={vals[s.key] ?? ''}
              onChange={(e) => setVals((v) => ({ ...v, [s.key]: e.target.value }))}
              className="h-10 w-full rounded-sm border border-line bg-panel px-3 text-[14.5px] text-ink focus:border-accent focus:outline-none"
            />
          </label>
        ))}
      </div>
    </Dialog>
  )
}
