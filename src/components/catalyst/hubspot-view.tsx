'use client'

import { useState } from 'react'
import Link from 'next/link'
import { UserRound } from 'lucide-react'
import { FollowDialog } from '@/components/catalyst/follow-dialog'
import { NewRunDialog } from '@/components/catalyst/new-run'
import { ErrorNotice } from '@/components/catalyst/bits'
import { LocalDateTime } from '@/components/ui/local-date'
import type { HubspotData, HubspotRow } from '@/lib/catalyst/hubspot'
import { leadHref } from '@/lib/catalyst/view'

const chip =
  'inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-panel px-2.5 py-1 text-[13px] font-semibold text-ink hover:border-line-2'

/**
 * HubSpot contacts (renderHubspot): the synced contacts with search, each with Run Catalyst (the New run form,
 * prefilled), Follow (the company goes on the watchlist) and, for a contact who is a lead, Open lead.
 */
export function HubspotView({ data }: { data: HubspotData }) {
  const [q, setQ] = useState('')
  const [run, setRun] = useState<HubspotRow | null>(null)
  const [follow, setFollow] = useState<HubspotRow | null>(null)

  if (data.error) {
    return <ErrorNotice>Could not read the synced HubSpot contacts: {data.error}</ErrorNotice>
  }

  const query = q.trim().toLowerCase()
  const rows = data.contacts.filter((c) => !query || c.search.includes(query))

  return (
    <section className="rounded-lg border border-line bg-panel p-4 shadow-card sm:p-5" aria-label="Contacts">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <h2 className="text-[15.5px] font-semibold text-ink">Contacts</h2>
        <span className="rounded-full bg-sunk px-2 py-0.5 text-[12.5px] font-semibold text-ink-2" data-testid="contacts-count">
          {data.contacts.length}
        </span>
        {data.lastSync ? (
          <span className="rounded-full border border-line px-2.5 py-0.5 text-[12.5px] text-ink-2">
            last sync: <b className="font-semibold text-ink"><LocalDateTime iso={data.lastSync} /></b>
          </span>
        ) : null}
        {data.contacts.length ? (
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, company…"
            aria-label="Search contacts"
            className="h-9 w-full min-w-[220px] rounded-sm border border-line bg-panel px-3 text-[14px] text-ink focus:border-accent focus:outline-none sm:ml-auto sm:w-auto"
          />
        ) : null}
      </div>

      {!data.contacts.length ? (
        <p className="px-0.5 py-2.5 text-[14px] text-ink-3">
          No contacts synced yet. Activate the HubSpot Contact Sync workflow in n8n and execute it once.
        </p>
      ) : !rows.length ? (
        <p className="px-0.5 py-2.5 text-[14px] text-ink-3">No contacts match that search.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((c) => (
            <li key={c.email || c.name} className="flex flex-wrap items-center gap-x-2.5 gap-y-2 py-2.5" data-testid="contact">
              <UserRound size={18} aria-hidden="true" className="shrink-0 text-ink-3" />
              <div className="min-w-[200px] flex-1">
                <p className="text-[14.5px] leading-snug">
                  <b className="font-semibold text-ink">{c.name}</b>
                  {c.email && c.email !== c.name ? <span className="text-[13px] text-ink-3"> · {c.email}</span> : null}
                </p>
                {c.company || c.title ? <p className="text-[13px] text-ink-2">{[c.company, c.title].filter(Boolean).join(' · ')}</p> : null}
              </div>
              {c.lifecycle ? <span className="rounded-full bg-sunk px-2.5 py-1 text-[12.5px] font-semibold text-ink-2">{c.lifecycle}</span> : null}
              {c.status ? <span className="rounded-full border border-line px-2.5 py-1 text-[12.5px] text-ink-2">{c.status}</span> : null}
              <button type="button" className={chip} title="Write the pre-meeting prospect brief for this contact" onClick={() => setRun(c)}>
                ▶ Run Catalyst
              </button>
              <button
                type="button"
                className={chip}
                title="Follow this company: the Intel Tracker reads its posts and the Ad Strategist its Meta ads"
                onClick={() => setFollow(c)}
              >
                ◎ Follow
              </button>
              {c.leadId ? (
                <Link href={leadHref(c.leadId)} className={chip}>
                  Open lead →
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {run ? (
        <NewRunDialog
          onClose={() => setRun(null)}
          prefill={{
            form: {
              firstName: run.firstName,
              lastName: run.lastName,
              title: run.title,
              company: run.company,
              link: run.website ? (/^https?:/i.test(run.website) ? run.website : 'https://' + run.website) : '',
              email: run.email,
              phone: run.phone,
            },
            note: 'Prefilled from HubSpot: fill any gaps, then start.',
          }}
        />
      ) : null}
      {follow ? <FollowDialog contact={follow} onClose={() => setFollow(null)} /> : null}
    </section>
  )
}
