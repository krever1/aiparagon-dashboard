'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { type LeadCallRow, leadCallsFor } from '@/app/(app)/lead-pipeline/actions'
import { PageHeader } from '@/components/moving-page'
import { LocalDate, LocalDateTime, LocalUsDay } from '@/components/ui/local-date'
import type { E1Doc, LeadPageData, PrepDoc } from '@/lib/catalyst/lead-page'
import { type Stage, type StageKey, firmSizeLabel, firmTypeLabel, isStageKey, labelCase, runLabel, stagesNamed } from '@/lib/catalyst/stages'
import { type LeadTab, hasDoc, leadTab, safeUrl } from '@/lib/catalyst/view'
import { pageBySlug } from '@/lib/nav'
import { INK, TXT, placeCharts } from '@/lib/catalyst/charts'
import { mdClean } from '@/lib/catalyst/doc-format'
import { Banner, ErrorNotice, StageDot, StripTile, type TabDef, Tabs } from './bits'
import { CallQuestion } from './call-question'
import { ChangeAsk } from './change-ask'
import { ChartFigure } from './chart'
import { useCheckBack } from './check-back'
import { DocReader } from './doc-reader'
import { FilesPanel } from './files-panel'
import { Md } from './markdown'
import { ProposalCard } from './proposal-card'
import { type Ask, StageQuestion, stillWriting } from './stage-question'

type Found = Extract<LeadPageData, { found: true }>

/** The tab each stage opens on (the board's "✓ … ready" and the Stage tile). */
const STAGE_TAB: Record<StageKey, LeadTab> = {
  research: 'research',
  consultation: 'consultation',
  assessment: 'assessment',
  proposal: 'proposal',
  onboarding: 'onboarding',
  review: 'review',
}

const btn =
  'inline-flex items-center gap-1.5 rounded-sm border border-line bg-panel px-3 py-1.5 text-[13.5px] font-semibold text-ink hover:border-line-2'
const btnNavy =
  'inline-flex items-center gap-1.5 rounded-sm bg-action px-3 py-1.5 text-[13.5px] font-semibold text-action-ink hover:bg-action-hover'
const chip = 'inline-flex items-center gap-1 rounded-full bg-sunk px-2.5 py-1 text-[12.5px] text-ink-2'

/**
 * A lead's page: who it is, the stage it is in, and every document Catalyst wrote for it (each readable here), the
 * onboarding and client review prep, its files and its HubSpot contact.
 */
export function LeadView({ data }: { data: Found }) {
  const asked = leadTab(useSearchParams().get('tab'))
  const stages = useMemo(() => stagesNamed(data.names), [data.names])
  const byKey = Object.fromEntries(stages.map((s) => [s.key, s])) as Record<StageKey, Stage>
  const st = byKey[data.stage]
  const ready = hasDoc(data.lead, data.stage)
  const { lead } = data

  const tabs: TabDef<LeadTab>[] = []
  for (const d of data.docs) {
    if (d.key === 'followup' && !d.done) continue
    tabs.push({ key: d.key, label: d.short, done: d.done })
  }
  for (const key of ['onboarding', 'review'] as const) {
    if (data.prep[key] || data.stage === key) tabs.push({ key, label: byKey[key].doc, done: !!data.prep[key] })
  }
  tabs.push({ key: 'files', label: 'Files', count: data.files.rows.length })
  if (data.hubspot.ok) tabs.push({ key: 'hubspot', label: 'HubSpot' })

  // the calls recorded in Fathom with this lead, read once the page is up (the count shows once they are in)
  const [calls, setCalls] = useState<{ rows: LeadCallRow[]; error: string } | null>(null)
  const [callsRead, setCallsRead] = useState(0)
  const [fileIt, setFileIt] = useState<LeadCallRow | null>(null)
  useEffect(() => {
    let live = true
    leadCallsFor(lead.id)
      .then((r) => live && setCalls(r.ok ? { rows: r.calls, error: r.error } : { rows: [], error: r.error }))
      .catch(() => live && setCalls({ rows: [], error: 'Could not reach the dashboard.' }))
    return () => {
      live = false
    }
  }, [lead.id, callsRead])
  tabs.push({ key: 'calls', label: 'Calls', count: calls ? calls.rows.length || '' : '' })

  const home = STAGE_TAB[data.stage]
  // the address's tab when this lead has it, else the tab of the stage the lead is in
  const tab: LeadTab = asked && tabs.some((t) => t.key === asked) ? asked : home
  const [reading, setReading] = useState<string | null>(null)
  const [ask, setAsk] = useState<Ask | null>(null)
  useCheckBack(!!lead.run)
  const askFor = (stage: StageKey, move: boolean) => {
    if (!stillWriting(lead)) setAsk({ lead, stage, move })
  }

  const go = (t: LeadTab) => {
    const u = new URL(window.location.href)
    u.searchParams.set('tab', t)
    window.history.replaceState(null, '', u.pathname + u.search)
  }

  const firm =
    [
      firmTypeLabel(lead.firmType),
      firmSizeLabel(data.firm.firmSize),
      data.firm.leadSource ? 'Source: ' + labelCase(data.firm.leadSource) : '',
      data.firm.aiReadiness ? 'AI readiness ' + data.firm.aiReadiness : '',
      lead.fit ? lead.fit + ' fit' : '',
    ]
      .filter(Boolean)
      .join(' · ') || 'No firm details recorded yet.'

  const tiles: { n: string | number; label: string; tip: string; to: LeadTab }[] = [
    { n: st.name, label: 'Stage', tip: ready ? `${st.doc} ready` : 'prep not written yet', to: home },
    { n: lead.docCount, label: 'Documents', tip: 'written for this lead', to: 'research' },
    { n: data.files.rows.length, label: 'Files', tip: 'attached to this lead', to: 'files' },
    { n: lead.fit || '—', label: 'Fit', tip: 'rated before the call', to: 'research' },
  ]
  const lit = tiles.findIndex((t) => t.to === tab)
  const doc = data.docs.find((d) => d.key === tab)

  return (
    <>
      <PageHeader
        page={pageBySlug('lead-pipeline')}
        eyebrow="Catalyst · Lead pipeline"
        title={lead.name}
        sub={[lead.company, lead.title, lead.email].filter(Boolean).join(' · ')}
      />
      <Banner
        tag="Lead"
        text={`Stage: ${st.name} · ${st.doc} ${ready ? 'ready' : 'not written yet'}`}
        tip={firm}
        right={
          <>
            <label className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-ink-2">
              Stage
              <select
                aria-label="Move this lead to another stage"
                value={data.stage}
                onChange={(e) => {
                  const s = e.target.value
                  if (isStageKey(s) && s !== data.stage) askFor(s, true)
                }}
                className="h-9 max-w-[220px] rounded-sm border border-line bg-panel px-2 text-[14px] font-medium text-ink focus:border-accent focus:outline-none"
              >
                {stages.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <Link href="/lead-pipeline" className={btn}>
              <ArrowLeft size={15} aria-hidden="true" />
              Lead pipeline
            </Link>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2" data-testid="strip">
        {tiles.map((t, i) => (
          <StripTile key={t.label} n={t.n} label={t.label} tip={t.tip} active={i === lit} onClick={() => go(t.to)} />
        ))}
      </div>
      <Tabs<LeadTab> label="This lead’s documents" tabs={tabs} active={tab} onPick={go} />
      {data.error ? <ErrorNotice>{data.error}</ErrorNotice> : null}

      {doc ? (
        <DocPanel
          d={doc}
          reading={reading}
          setReading={setReading}
          writing={lead.run?.s === doc.key ? byKey[doc.key as StageKey] : null}
          ask={{ leadId: lead.id, name: lead.name, count: data.asks[doc.agent] ?? 0 }}
        >
          {doc.key === 'proposal' && (data.proposal.view || data.proposal.run || data.docs.some((x) => x.key === 'assessment' && x.done)) ? (
            <ProposalCard lead={lead} data={data.proposal} asks={data.asks.client_proposal ?? 0} />
          ) : null}
        </DocPanel>
      ) : null}
      {tab === 'onboarding' || tab === 'review' ? (
        <PrepPanel
          prep={data.prep[tab]}
          stage={byKey[tab]}
          leadStage={st}
          writing={lead.run?.s === tab}
          onRun={() => askFor(tab as StageKey, false)}
        />
      ) : null}
      {tab === 'files' ? <FilesPanel leadId={lead.id} rows={data.files.rows} error={data.files.error} /> : null}
      {tab === 'hubspot' ? <HubspotPanel c={data.hubspot.contact} /> : null}
      {tab === 'calls' ? <CallsPanel name={lead.name} calls={calls} stages={byKey} onFile={setFileIt} /> : null}
      {fileIt ? <CallQuestion lead={lead} stages={stages} call={fileIt} onClose={() => setFileIt(null)} onDone={() => setCallsRead((n) => n + 1)} /> : null}
      {ask ? <StageQuestion key={ask.stage} ask={ask} stages={stages} onClose={() => setAsk(null)} /> : null}
    </>
  )
}

function Panel({ kicker, title, extra, children, id }: { kicker?: string; title: string; extra?: React.ReactNode; children: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="rounded-lg border border-line bg-panel p-5 shadow-card sm:p-6">
      {kicker ? <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-accent-text">{kicker}</p> : null}
      <h2 id={id} className="flex flex-wrap items-center gap-x-3 gap-y-1 font-display text-[23px] font-semibold text-ink">
        <span>{title}</span>
        {extra}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

const notRun = <span className="rounded-full bg-sunk px-2.5 py-0.5 font-sans text-[12.5px] font-semibold text-ink-3">not run yet</span>

/** What should change? calls each document this (V125_DOC). */
const ASK_DOC: Record<string, string> = {
  lead_research: 'prospect brief',
  interview_script: 'consultation guide',
  anonymizer: 'assessment',
  discovery_call: 'follow-up guide',
  growth_plan: 'proposal presentation',
}

function DocPanel({
  d,
  reading,
  setReading,
  writing,
  ask,
  children,
}: {
  d: E1Doc
  reading: string | null
  setReading: (k: string | null) => void
  /** the stage, while a run writes its document */
  writing: Stage | null
  /** What should change? on this document: the lead and how many changes were asked */
  ask: { leadId: string; name: string; count: number }
  /** under the document: the client proposal, on the Proposal tab */
  children?: React.ReactNode
}) {
  const open = reading === d.key
  const canRead = !!(d.md || d.readDocId || d.readPdfId)
  const pdf = safeUrl(d.url)
  return (
    <Panel
      id={'doc-' + d.key}
      kicker={(d.done ? '✓ ' : '') + d.short}
      title={`${d.n}. ${d.label}`}
      extra={
        d.done ? (
          <span className="font-sans text-[13.5px] font-normal text-ink-3">{d.at ? <LocalDate iso={d.at} /> : 'done'}</span>
        ) : (
          notRun
        )
      }
    >
      {writing ? (
        <p role="status" className="mb-3 flex items-center gap-2 rounded-md bg-accent-soft px-4 py-3 text-[14.5px] text-accent-text">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" />
          Catalyst is writing {writing.what}. It shows here when it is done.
        </p>
      ) : null}
      {d.done ? (
        <div className="rounded-md border border-line bg-sunk/50 p-4" data-testid="doc-card">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <b className="text-[15.5px] font-semibold text-ink">{d.title}</b>
            <small className="text-[13px] text-ink-3">
              {d.outId ? (
                <>
                  Produced <LocalDate iso={d.at} />
                </>
              ) : (
                'Document on file'
              )}
              {pdf ? ' · PDF' : ''}
              {d.documentId ? ' · Google Doc' : ''}
            </small>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {canRead ? (
              <button type="button" aria-expanded={open} onClick={() => setReading(open ? null : d.key)} className={btnNavy}>
                {open ? 'Hide ▴' : 'Read here ▾'}
              </button>
            ) : null}
            {pdf ? (
              <a href={pdf} target="_blank" rel="noopener noreferrer" className={btn}>
                Open PDF <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            ) : null}
            {d.documentId ? (
              <a href={`https://docs.google.com/document/d/${encodeURIComponent(d.documentId)}/edit`} target="_blank" rel="noopener noreferrer" className={btn}>
                Open Google Doc <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            ) : null}
            <ChangeAsk leadId={ask.leadId} agent={d.agent} doc={ASK_DOC[d.agent] ?? 'document'} name={ask.name} count={ask.count} />
            {d.status ? (
              <span className={chip}>
                status: <b className="font-semibold text-ink">{d.status}</b>
              </span>
            ) : null}
            {d.callDate ? <span className={chip}>call: {d.callDate}</span> : null}
          </div>
          {open ? <DocReader md={d.md} docId={d.readDocId} pdfId={d.readPdfId} /> : null}
        </div>
      ) : (
        <p className="rounded-md bg-sunk px-4 py-5 text-center text-[14.5px] text-ink-2">This stage hasn’t produced output for this lead yet.</p>
      )}
      {children}
    </Panel>
  )
}

function PrepPanel({
  prep,
  stage,
  leadStage,
  writing,
  onRun,
}: {
  prep: PrepDoc | null
  stage: Stage
  leadStage: Stage
  writing: boolean
  onRun: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Panel
      id={'prep-' + stage.key}
      title={stage.doc}
      extra={
        writing ? (
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-sans text-[12.5px] font-semibold text-accent-text">writing</span>
        ) : prep ? (
          <span className="font-sans text-[13.5px] font-normal text-ink-3">{prep.at ? <LocalDate iso={prep.at} /> : null}</span>
        ) : (
          notRun
        )
      }
    >
      {writing ? (
        <p role="status" className="rounded-md bg-sunk px-4 py-5 text-[14.5px] text-ink-2">
          Catalyst is writing {stage.what}. It shows here when it is done.
        </p>
      ) : prep ? (
        <div className="rounded-md border border-line bg-sunk/50 p-4" data-testid="prep-card">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <b className="text-[15.5px] font-semibold text-ink">{prep.title || stage.doc}</b>
            <small className="text-[13px] text-ink-3">
              For the {stage.name.toLowerCase()} meeting · produced <LocalDate iso={prep.at} />
            </small>
          </div>
          {prep.md ? (
            <>
              <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={btnNavy + ' mt-3'}>
                {open ? 'Hide ▴' : 'Read inline ▾'}
              </button>
              {open ? (
                <div className="mt-3 space-y-3 border-t border-line pt-3" data-testid="prep-text">
                  {prep.charts.length ? (
                    placeCharts(mdClean(prep.md), prep.charts).map((p, i) => (
                      <div key={i}>
                        {p.text.trim() ? <Md>{p.text}</Md> : null}
                        {p.charts.map((c, k) => (
                          <ChartFigure key={k} chart={c} color={INK} ink={TXT} />
                        ))}
                      </div>
                    ))
                  ) : (
                    <Md>{mdClean(prep.md)}</Md>
                  )}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : (
        <div className="rounded-md bg-sunk px-4 py-5 text-[14.5px] text-ink-2">
          This lead is in {leadStage.name}, and its prep has not been written yet.{' '}
          <button type="button" onClick={onRun} className={btn + ' ml-1'}>
            {runLabel(stage)}
          </button>
        </div>
      )}
    </Panel>
  )
}

function HubspotPanel({ c }: { c: Found['hubspot']['contact'] }) {
  if (!c) {
    return (
      <Panel id="hubspot" title="HubSpot">
        <p className="text-[14.5px] text-ink-2">
          No HubSpot contact synced for this email yet. The sync runs every 6 hours, or start it by hand in n8n.
        </p>
      </Panel>
    )
  }
  const site = c.website ? (/^https?:/i.test(c.website) ? c.website : 'https://' + c.website) : ''
  const rows: [string, React.ReactNode][] = [
    ['name', c.name],
    ['company', c.company],
    ['title', c.title],
    ['phone', c.phone],
    ['lifecycle', c.lifecycle],
    ['lead status', c.leadStatus],
  ]
  return (
    <Panel
      id="hubspot"
      title="HubSpot"
      extra={c.syncedAt ? <span className="font-sans text-[13.5px] font-normal text-ink-3">synced <LocalDateTime iso={c.syncedAt} /></span> : null}
    >
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows
          .filter(([, v]) => !!v)
          .map(([k, v]) => (
            <div key={k} className="rounded-sm bg-sunk px-3.5 py-2">
              <dt className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">{k}</dt>
              <dd className="font-semibold text-ink">{v}</dd>
            </div>
          ))}
        {site && safeUrl(site) ? (
          <div className="rounded-sm bg-sunk px-3.5 py-2">
            <dt className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">website</dt>
            <dd>
              <a href={safeUrl(site)} target="_blank" rel="noopener noreferrer" className="font-semibold text-info hover:underline">
                {c.website} ↗
              </a>
            </dd>
          </div>
        ) : null}
        {c.hasRecord ? (
          <div className="rounded-sm bg-sunk px-3.5 py-2">
            <dt className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">record</dt>
            <dd>
              <a href="https://app.hubspot.com/contacts" target="_blank" rel="noopener noreferrer" className="font-semibold text-info hover:underline">
                Open in HubSpot ↗
              </a>
            </dd>
          </div>
        ) : null}
      </dl>
    </Panel>
  )
}

/** The lead's Calls tab (v137LeadCalls): each call recorded with it, and the stage it is filed under. */
function CallsPanel({
  name,
  calls,
  stages,
  onFile,
}: {
  name: string
  calls: { rows: LeadCallRow[]; error: string } | null
  stages: Record<StageKey, Stage>
  onFile: (c: LeadCallRow) => void
}) {
  return (
    <Panel id="calls" title="Calls" extra={calls ? <span className="text-[13px] font-normal text-ink-3">{calls.rows.length}</span> : null}>
      {!calls ? (
        <p role="status" className="py-4 text-[14px] text-ink-3">
          Reading the calls from Fathom…
        </p>
      ) : calls.error && !calls.rows.length ? (
        <p className="py-4 text-[14px] text-ink-3">Could not read the calls from Fathom: {calls.error}</p>
      ) : !calls.rows.length ? (
        <p className="py-4 text-[14px] text-ink-3">
          No recorded calls with {name} yet. A call recorded in Fathom with {name}’s email shows up here, and Catalyst asks to run the next stage with it.
        </p>
      ) : (
        <>
          <p className="mb-3 text-[14px] text-ink-2">
            Calls recorded in Fathom with {name}. Each is filed under the stage {name} was in, and the stages after it read its transcript.
          </p>
          <ul className="divide-y divide-line" data-testid="lead-calls">
            {calls.rows.map((c) => {
              const st = c.stage && c.stage !== 'none' && isStageKey(c.stage) ? stages[c.stage] : null
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                  <StageDot color={st ? st.color : '#C7CDD6'} />
                  <span className="min-w-[180px] flex-1">
                    <b className="block text-[14.5px] font-semibold text-ink">{c.title || 'A call'}</b>
                    <small className="text-[13px] text-ink-3">
                      <LocalUsDay iso={c.start} />
                      {c.minutes ? ` · ${c.minutes} min` : ''}
                    </small>
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-[12.5px] ${st ? 'bg-sunk text-ink-2' : 'bg-warn-soft text-warn'}`}>
                    {st ? 'Filed under ' + st.name : c.stage === 'none' ? 'Set aside' : 'Not filed yet'}
                  </span>
                  {c.stage ? null : (
                    <button type="button" className={btn} onClick={() => onFile(c)}>
                      File it
                    </button>
                  )}
                  <Link href={`/calls?call=${encodeURIComponent(c.id)}&seg=post`} className={btn}>
                    Open on Calls
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Panel>
  )
}
