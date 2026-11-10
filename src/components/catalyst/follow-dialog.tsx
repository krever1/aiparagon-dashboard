'use client'

import { useState } from 'react'
import { followCompany } from '@/app/(app)/hubspot/actions'
import { Dialog } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { type FollowInput, PRIORITIES } from '@/lib/catalyst/follow'

const input = 'h-10 w-full rounded-sm border border-line bg-panel px-3 text-[14.5px] text-ink focus:border-accent focus:outline-none'
const label = 'mb-1 block text-[13px] font-semibold text-ink-2'
const hint = 'mt-1 block text-[12.5px] leading-snug text-ink-3'

export type FollowContact = { email: string; firstName: string; lastName: string; company: string; website: string }

/**
 * Follow this company (openE3TrackModal): adds the contact's company to the accounts the team follows, with the places
 * to read it from. Each field is a scrape target; a blank one is not scraped.
 */
export function FollowDialog({ contact, onClose }: { contact: FollowContact; onClose: () => void }) {
  const site = contact.website ? (/^https?:/i.test(contact.website) ? contact.website : 'https://' + contact.website) : ''
  const [f, setF] = useState<FollowInput>({
    name: contact.company || [contact.firstName, contact.lastName].filter(Boolean).join(' '),
    website: site,
    meta: '',
    x: '',
    li: '',
    priority: 'medium',
    notes: contact.email ? 'Added from HubSpot contact ' + contact.email : '',
  })
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof FollowInput, v: string) => setF((x) => ({ ...x, [k]: v }))

  const add = async () => {
    setBusy(true)
    setMsg({ text: 'Adding…' })
    const r = await followCompany(f).catch(() => ({ ok: false as const, error: 'Could not reach the dashboard. Try again in a minute.' }))
    setBusy(false)
    if (!r.ok) return setMsg({ text: r.error, bad: true })
    onClose()
    toast(r.message)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      kicker="Catalyst · HubSpot contacts"
      title="Follow this company"
      width={600}
      footer={
        <>
          <span role="status" aria-live="polite" data-testid="follow-msg" className={`mr-auto text-[13.5px] ${msg?.bad ? 'text-bad' : 'text-ink-2'}`}>
            {msg?.text ?? ''}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={add}
            className="rounded-sm bg-action px-4 py-2 text-[14px] font-semibold text-action-ink hover:bg-action-hover disabled:opacity-60"
          >
            Add to watchlist
          </button>
        </>
      }
    >
      <p className="mb-4 text-[14px] leading-relaxed text-ink-2">
        Adds this company to the accounts you follow. The Intel Tracker reads their posts on its next run, and the Ad Strategist
        pulls their Meta ads right after it. Each field below is a scrape target: whatever you leave blank is not scraped.
      </p>

      <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-3">Who are we tracking?</h3>
      <div className="grid gap-3">
        <label className="block">
          <span className={label}>Company / advertiser name</span>
          <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Summit Ridge Wealth Advisors" className={input} />
        </label>
        <label className="block">
          <span className={label}>Website</span>
          <input type="url" value={f.website} onChange={(e) => set('website', e.target.value)} placeholder="https://…" className={input} />
        </label>
      </div>

      <h3 className="mb-2 mt-5 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-3">Scrape targets</h3>
      <div className="grid gap-3">
        <label className="block">
          <span className={label}>Meta page: paste the Ad Library link</span>
          <input
            value={f.meta}
            onChange={(e) => set('meta', e.target.value)}
            placeholder="https://www.facebook.com/ads/library/?...view_all_page_id=123456789"
            className={input}
          />
          <small className={hint}>
            Open the{' '}
            <a href="https://www.facebook.com/ads/library" target="_blank" rel="noopener noreferrer" className="font-semibold text-accent-text underline">
              Meta Ad Library ↗
            </a>
            , search the company, open their ads, then paste that link here. The page ID is picked out of it. Leave it blank if they
            run no Meta ads.
          </small>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={label}>X / Twitter handle</span>
            <input value={f.x} onChange={(e) => set('x', e.target.value)} placeholder="without the @" className={input} />
          </label>
          <label className="block">
            <span className={label}>LinkedIn</span>
            <input value={f.li} onChange={(e) => set('li', e.target.value)} placeholder="company/acme or in/jane-doe" className={input} />
          </label>
        </div>
        <label className="block">
          <span className={label}>Priority</span>
          <select value={f.priority} onChange={(e) => set('priority', e.target.value)} className={input}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Why are we tracking them?</span>
          <textarea
            rows={3}
            value={f.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="e.g. Direct competitor in wealth-management AI: watch their offer angle"
            className="w-full rounded-sm border border-line bg-panel px-3 py-2 text-[14.5px] text-ink focus:border-accent focus:outline-none"
          />
        </label>
      </div>
    </Dialog>
  )
}
