'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { LocalDate } from '@/components/ui/local-date'
import { stagesNamed } from '@/lib/catalyst/stages'
import { type OverviewTab, type PipelineData, hasDoc, leadHref, overviewTab, stripCounts, viewStage } from '@/lib/catalyst/view'
import { Banner, ErrorNotice, FitPill, StripTile, Tabs, initials, plural } from './bits'

/**
 * Catalyst's Overview: the six meetings a client goes through and the prep for each, the newest leads, and how many
 * leads have each stage's document.
 */
export function OverviewView({ data }: { data: PipelineData }) {
  const tab = overviewTab(useSearchParams().get('tab'))
  const stages = useMemo(() => stagesNamed(data.names), [data.names])
  const c = useMemo(() => stripCounts(data.leads), [data.leads])
  const byKey = Object.fromEntries(stages.map((s) => [s.key, s]))

  const go = (t: OverviewTab) => {
    const u = new URL(window.location.href)
    if (t === 'stages') u.searchParams.delete('tab')
    else u.searchParams.set('tab', t)
    window.history.replaceState(null, '', u.pathname + u.search)
  }

  const tiles: { n: number; label: string; tip: string; to: OverviewTab }[] = [
    { n: c.leads, label: 'Leads', tip: 'in the pipeline', to: 'leads' },
    { n: c.strong, label: 'Strong fit', tip: 'rated before the call', to: 'leads' },
    { n: c.clients, label: 'Clients', tip: 'onboarding and client review', to: 'leads' },
    { n: stages.length, label: 'Stages', tip: 'a document for each', to: 'stages' },
  ]
  const lit = tiles.findIndex((t) => t.to === tab)
  const recent = data.leads.slice(0, 6)

  return (
    <>
      <Banner
        tag="Catalyst"
        text="From the first research to the client review"
        tip="A client moves through six meetings. Catalyst writes the prep for each one when the client gets there, from everything before it, and your team reviews it first."
        right={
          <>
            <span className="text-[14px] text-ink-2">Every prospect lives in the lead pipeline.</span>
            <Link
              href="/lead-pipeline"
              className="rounded-sm border border-line bg-panel px-3 py-1.5 text-[13.5px] font-semibold text-ink hover:border-line-2"
            >
              Open
            </Link>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2" data-testid="strip">
        {tiles.map((t, i) => (
          <StripTile key={t.label} n={t.n} label={t.label} tip={t.tip} active={i === lit} onClick={() => go(t.to)} />
        ))}
      </div>
      <Tabs<OverviewTab>
        label="Overview views"
        active={tab}
        onPick={go}
        tabs={[
          { key: 'stages', label: 'Stages' },
          { key: 'leads', label: 'Recent leads', count: c.leads || '' },
          { key: 'documents', label: 'Documents' },
        ]}
      />
      {data.error ? <ErrorNotice>{data.error}</ErrorNotice> : null}

      {tab === 'stages' ? (
        <section aria-labelledby="ov-stages" className="overflow-hidden rounded-lg border border-line bg-panel shadow-card">
          <div className="border-b border-line bg-[#fbf8f0] px-6 py-5">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-accent-text">Stages</p>
            <h2 id="ov-stages" className="mt-2 font-display text-[23px] font-semibold text-ink">
              Six meetings, prep for each
            </h2>
          </div>
          <div className="@container p-5 sm:p-6">
            <ol className="grid grid-cols-1 gap-5 @min-[700px]:grid-cols-3">
              {stages.map((s, i) => (
                <li
                  key={s.key}
                  data-s={s.key}
                  title={`${s.role} Works from ${s.from}.`}
                  className="relative rounded-md border border-t-[3px] border-line border-t-accent bg-panel p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-sm bg-action text-[13px] font-semibold text-action-ink">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-text">{s.name}</p>
                      <b className="block font-display text-[18.5px] font-semibold leading-snug text-ink">{s.doc}</b>
                    </div>
                  </div>
                  <p className="mt-3 border-t border-line pt-3 text-[13px] text-ink-2">
                    {plural(c.by[s.key], 'lead')} in this stage
                  </p>
                  {i % 3 !== 2 ? (
                    <span
                      aria-hidden="true"
                      className="absolute -right-[19px] top-[30px] z-10 hidden h-6 w-6 place-items-center rounded-full bg-action text-action-ink @min-[700px]:grid"
                    >
                      <ArrowRight size={13} />
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      {tab === 'leads' ? (
        <section aria-labelledby="ov-leads" className="rounded-lg border border-line bg-panel shadow-card">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h2 id="ov-leads" className="font-display text-[21px] font-semibold text-ink">
              Recent leads <small className="ml-1 font-sans text-[13.5px] font-normal text-ink-3">{c.leads} total</small>
            </h2>
            <Link href="/lead-pipeline?tab=all" className="text-[14px] font-semibold text-info hover:underline">
              View all →
            </Link>
          </div>
          {recent.length ? (
            <ul>
              {recent.map((l) => (
                <li key={l.id} className="border-b border-line last:border-b-0">
                  <Link href={leadHref(l.id)} className="flex items-center gap-3 px-5 py-3 hover:bg-sunk">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-[12.5px] font-semibold text-accent-text">
                      {initials(l.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[14.5px] font-semibold text-ink">
                        {[l.name, l.company].filter(Boolean).join(' · ')}
                      </b>
                      <small className="block truncate text-[12.5px] text-ink-3">
                        {l.email} · {byKey[viewStage(l)].name} · updated <LocalDate iso={l.updatedAt} />
                      </small>
                    </span>
                    <FitPill fit={l.fit} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-[14.5px] text-ink-2">No leads yet. New runs appear here automatically.</p>
          )}
        </section>
      ) : null}

      {tab === 'documents' ? (
        <section aria-labelledby="ov-docs" className="rounded-lg border border-line bg-panel shadow-card">
          <div className="border-b border-line px-5 py-4">
            <h2 id="ov-docs" className="font-display text-[21px] font-semibold text-ink">
              Stage completion
            </h2>
          </div>
          <ul className="space-y-3.5 px-5 py-5">
            {stages.map((s) => {
              const done = data.leads.filter((l) => hasDoc(l, s.key)).length
              const total = data.leads.length
              const pct = total ? Math.max(2, (done / total) * 100) : 2
              return (
                <li key={s.key} data-s={s.key} className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_auto] items-center gap-3 text-[14px]">
                  <span className="truncate text-ink">{s.short}</span>
                  <span aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-sunk">
                    <span className="block h-full rounded-full bg-accent" style={{ width: pct + '%' }} />
                  </span>
                  <span className="tabular-nums text-ink-2">
                    {done}/{total}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </>
  )
}
