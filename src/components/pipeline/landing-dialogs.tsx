'use client'

import { useEffect, useState } from 'react'
import { Copy, Info, LayoutTemplate, Rocket } from 'lucide-react'
import { type Choice, makePage, pickerChoices } from '@/app/(app)/landing-pages/actions'
import { Dialog } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { type Page, adUrl, dayOf, kindName } from '@/lib/pipeline/landing'
import { Empty, Pill, Tag, btn, primary } from './bits'
import { OUT_TIP, legacy } from './briefs-parts'

// The two windows of the Landing pages page: which page goes live (v115LpNew, v115LpFromPkg; v120's pill for where its
// campaign stands), and an ad's code and links (v115LpAds).

const OFF = 'Could not reach the dashboard. Try again in a minute.'

export const pagePill = (p: Pick<Page, 'status'>) =>
  p.status === 'live' ? <Pill tone="good">Live</Pill> : p.status === 'paused' ? <Pill tone="warn">Paused</Pill> : <Pill tone="info">Draft</Pill>

/** Copy a link (nwCopy). */
export async function copyText(t: string) {
  try {
    await navigator.clipboard.writeText(t)
    toast('Copied')
  } catch {
    toast('Could not copy here', 'warn')
  }
}

export function Picker({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const [choices, setChoices] = useState<Choice[] | null>(null)
  const [err, setErr] = useState('')
  const [making, setMaking] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    pickerChoices()
      .catch(() => ({ ok: false as const, error: 'Could not load them: ' + OFF }))
      .then((r) => {
        if (!live) return
        if (r.ok) setChoices(r.choices)
        else setErr(r.error)
      })
    return () => {
      live = false
    }
  }, [])

  const use = async (c: Choice) => {
    if (c.page) return onOpen(c.page.id)
    if (making) return
    setMaking(c.id)
    let tz = ''
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {}
    const r = await makePage({ id: c.id, tz }).catch(() => ({ ok: false as const, error: 'Could not make the page: ' + OFF }))
    setMaking(null)
    if (!r.ok) return toast(r.error, 'warn')
    onOpen(r.id)
  }

  return (
    <Dialog open onClose={onClose} kicker="Landing pages" title="Which page goes live?" width={720}>
      {err ? (
        <p className="text-[14px] text-ink-3" role="alert">
          {err}
        </p>
      ) : !choices ? (
        <p className="text-[14px] text-ink-3">Loading your funnels and campaigns…</p>
      ) : !choices.length ? (
        <Empty
          icon={<Rocket size={30} aria-hidden="true" />}
          title="Nothing to put live yet"
          text="Make a funnel or a book-a-call campaign in Marketing Generation first."
          action={
            <a href={legacy('marketing-generation')} title={OUT_TIP} className={btn}>
              Open Marketing Generation
            </a>
          }
        />
      ) : (
        <>
          <p className="mb-3 text-[14px] text-ink-2">Each one becomes a page with a sign-up form. You can edit it before it goes live.</p>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2" data-testid="picker">
            {choices.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line px-3 py-2.5" data-testid="pick-row">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-sunk text-ink-2">
                  {c.kind === 'book_call' ? <Rocket size={19} aria-hidden="true" /> : <LayoutTemplate size={19} aria-hidden="true" />}
                </span>
                <div className="min-w-0 grow basis-[260px]">
                  <b className="block break-words text-[14.5px] font-semibold text-ink">{c.name}</b>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Tag>{kindName(c.kind)}</Tag>
                    <Tag>{dayOf(c.createdAt)}</Tag>
                    <Pill tone={c.approval === 'Approved' ? 'good' : c.approval === 'Sent back' ? 'bad' : 'warn'}>{c.approval}</Pill>
                    {c.page ? pagePill(c.page) : null}
                  </span>
                </div>
                <button type="button" className={c.page ? btn : primary} disabled={!!making} onClick={() => void use(c)}>
                  {making === c.id ? 'Making the page…' : c.page ? 'Open its page' : 'Use this'}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  )
}

/** Each ad's code and links (v115LpAds): the code starts the ad's name, so Ad Testing can match its spend. */
export function AdLinks({ page: p, onClose }: { page: Page; onClose: () => void }) {
  const first = p.ads[0]?.code || 'PK7Q2-A1'
  const name = (p.title || p.slug).length > 40 ? (p.title || p.slug).slice(0, 39).replace(/\s+\S*$/, '') + '…' : p.title || p.slug
  const row = (label: string, url: string) => (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1 border-t border-line pt-2 first:border-0 first:pt-0" data-testid="ad-link">
      <span className="text-[12.5px] text-ink-3">{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 grow break-all rounded-sm bg-sunk px-2 py-1 text-[12.5px] text-ink-2">{url}</code>
        <button type="button" className={btn} aria-label={'Copy the ' + label + ' link'} onClick={() => void copyText(url)}>
          <Copy size={14} aria-hidden="true" />
          Copy
        </button>
      </div>
    </div>
  )
  return (
    <Dialog open onClose={onClose} kicker={p.title || p.slug} title="Ad links" width={720}>
      <p className="text-[14px] text-ink-2">
        Use the link that fits where the ad runs, and start the ad’s name with its code in Ads Manager, like{' '}
        <b className="text-ink">
          <span className="whitespace-nowrap">{first}</span> {name}
        </b>
        . On LinkedIn, put the code in the campaign’s name and keep one ad per campaign. Ad Testing then counts sign-ups and cost per sign-up for each ad.
      </p>
      {p.status !== 'live' ? (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-info/20 bg-info-soft px-3 py-2.5 text-[14px] text-ink-2">
          <Info size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-info" />
          {p.status === 'paused'
            ? 'The page is paused, so these links show a "not taking sign-ups" page until you put it live again.'
            : 'The page is not live yet, so these links show a "not taking sign-ups" page until it is.'}
        </p>
      ) : null}
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3">
        {p.ads.map((a) => (
          <section key={a.code} className="rounded-md border border-line p-3" data-testid="ad-card" aria-label={a.code}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Tag gold>{a.code}</Tag>
              <b className="min-w-0 text-[14px] text-ink">{(a.hook || a.headline || 'Ad ' + a.n).slice(0, 120)}</b>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
              {row('Meta (Facebook and Instagram)', adUrl(p.slug, a.code, 'meta'))}
              {row('LinkedIn', adUrl(p.slug, a.code, 'linkedin'))}
              {row('A post', adUrl(p.slug, a.code, 'post'))}
            </div>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
