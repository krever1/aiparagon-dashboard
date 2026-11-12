'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Inbox, PenLine, Plus, Upload } from 'lucide-react'
import { Tabs } from '@/components/catalyst/bits'
import { useNow } from '@/components/ui/clock'
import { useHydrated } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import { LEGACY_DASHBOARD_URL } from '@/lib/config'
import { legacyUrl, pageBySlug } from '@/lib/nav'
import { type Tab, briefIdeasCount, openNotes, plural, readyOf, runningReqs, tabOf } from '@/lib/pipeline/content'
import type { ContentData } from '@/lib/pipeline/content-load'
import { primary } from './bits'
import { DraftsTab } from './content-drafts'
import { IdeasTab } from './content-ideas'
import { NewDraft } from './content-new'

// The Content Transformation page (NW_PAGES['e3.create'] as v110 to v127 left it): the head says what is being
// written and what waits for a review, then three tabs. New draft is the form that asks Content from Source for a
// draft (it stays as it was while another tab is looked at); Drafts lists the drafts made from the team's own material,
// each opening its review under the list; Ideas holds the newest organic brief's five things, the team's own ideas and
// the library. The tab is the address's (?tab=drafts, ?tab=ideas; New draft at a bare address) and so is the draft on
// screen (?draft=<id>).

export const OUT_TIP = 'Opens in the current dashboard'
export const legacy = (slug: string) => legacyUrl(LEGACY_DASHBOARD_URL, pageBySlug(slug))

const TABS: Record<Tab, string> = { new: '', drafts: 'drafts', ideas: 'ideas' }
export function tabUrl(t: Tab, draft?: string) {
  const q = new URLSearchParams()
  if (TABS[t]) q.set('tab', TABS[t])
  if (t === 'drafts' && draft) q.set('draft', draft)
  const s = q.toString()
  return '/content-transformation' + (s ? '?' + s : '')
}

export function ContentView({ data }: { data: ContentData }) {
  const sp = useSearchParams()
  const hydrated = useHydrated()
  const tz = hydrated ? undefined : 'UTC'
  const tab = tabOf(sp.get('tab'))
  const asked = sp.get('draft')
  // a request whose workflow did not start, and why (window.__cfKick): kept while the page is open
  const [kicks, setKicks] = useState<Record<string, string>>({})
  // the review checks ticked on each draft, kept while the page is open (window.__cfChecks)
  const [checks, setChecks] = useState<Record<string, boolean[]>>({})
  const now = useNow(data.now)

  const pick = (t: Tab) => window.history.replaceState(null, '', tabUrl(t, t === 'drafts' ? (asked ?? undefined) : undefined))
  const running = runningReqs(data.reqs, now).filter((r) => r.sourceType !== 'brief').length
  const toReview = data.drafts.filter((d) => !readyOf(d.id, data.revs)).length
  const ideas = briefIdeasCount(data.brief) + openNotes(data.notes).length
  useRunWatch(data, running > 0)

  return (
    <div data-testid="content-page">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-ink-2" data-testid="content-status">
          <span className="inline-flex items-center gap-2">
            <i aria-hidden="true" className={`h-2 w-2 rounded-full ${running ? 'animate-pulse bg-info' : 'bg-good'}`} />
            {running ? 'Writing ' + plural(running, 'draft') : 'Ready'}
          </span>
          <span className="inline-flex items-center gap-2">
            <i aria-hidden="true" className={`h-2 w-2 rounded-full ${toReview ? 'bg-warn' : 'bg-line-2'}`} />
            {toReview ? plural(toReview, 'draft') + ' to review' : 'No drafts waiting'}
          </span>
        </p>
        <ul className="flex flex-wrap gap-2" aria-label="What Content Transformation does">
          {(
            [
              [Upload, 'Starts from your material'],
              [PenLine, 'Writes in your voice'],
              [Inbox, 'Drafts go to Approvals'],
            ] as const
          ).map(([Ic, t]) => (
            <li key={t} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-[13px] font-semibold text-ink-2">
              <Ic size={14} aria-hidden="true" />
              {t}
            </li>
          ))}
        </ul>
        {tab !== 'new' ? (
          <div className="ml-auto">
            <button type="button" className={primary + ' px-3.5 py-2 text-[14px]'} onClick={() => pick('new')}>
              <Plus size={15} aria-hidden="true" />
              New draft
            </button>
          </div>
        ) : null}
      </div>

      <Tabs
        label="Content Transformation"
        tabs={[
          { key: 'new', label: 'New draft' },
          { key: 'drafts', label: 'Drafts', count: data.drafts.length },
          { key: 'ideas', label: 'Ideas', count: ideas },
        ]}
        active={tab}
        onPick={pick}
      />

      <div role="tabpanel">
        <div hidden={tab !== 'new'}>
          <NewDraft data={data} now={now} tz={tz} kicks={kicks} setKicks={setKicks} onReview={(id) => window.history.replaceState(null, '', tabUrl('drafts', id))} />
        </div>
        {tab === 'drafts' ? (
          <DraftsTab data={data} asked={asked} now={now} tz={tz} kicks={kicks} setKicks={setKicks} checks={checks} setChecks={setChecks} onNew={() => pick('new')} />
        ) : tab === 'ideas' ? (
          <IdeasTab data={data} tz={tz} />
        ) : null}
      </div>
    </div>
  )
}

/**
 * While a draft is being written the page reads its data again every 5 seconds (apCfPoll), and says when a request
 * finishes or fails.
 */
function useRunWatch(data: ContentData, running: boolean) {
  const router = useRouter()
  const seen = useRef<Record<string, string> | null>(null)
  useEffect(() => {
    const before = seen.current
    const next: Record<string, string> = {}
    for (const r of data.reqs) next[r.id] = r.status
    seen.current = next
    if (!before) return
    for (const r of data.reqs) {
      if (!before[r.id] || before[r.id] === r.status) continue
      if (r.status === 'done') toast('Draft ready: ' + (r.title || 'your content'))
      if (r.status === 'error') toast('Draft failed: ' + (r.error || 'see Drafts'), 'warn')
    }
  }, [data.reqs])
  useEffect(() => {
    if (!running) return
    const t = window.setInterval(() => router.refresh(), 5_000)
    document.documentElement.dataset.checkBack = 'on'
    return () => {
      window.clearInterval(t)
      delete document.documentElement.dataset.checkBack
    }
  }, [running, router])
}
