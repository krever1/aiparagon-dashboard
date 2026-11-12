'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Copy, Download, LayoutTemplate, Link2, Link as LinkIcon, PenLine, Plus, RefreshCw, Search, User, Users } from 'lucide-react'
import { ErrorNotice, StripTile, Tabs } from '@/components/catalyst/bits'
import { useHydrated } from '@/components/ui/local-date'
import { type Page, PUBLIC_HOST, csvName, csvOf, goText, goUrl, hubspotOf, kindName, nums, plural, suFrom, suRows } from '@/lib/pipeline/landing'
import type { LandingData } from '@/lib/pipeline/landing-load'
import { whenText } from '@/lib/touchpoint/today'
import { Empty, Tag, btn, ghost, inputCls, primary } from './bits'
import { AdLinks, Picker, copyText, pagePill } from './landing-dialogs'
import { Editor } from './landing-editor'

// The Landing pages page (view e3landing: v115LpHtml, v115LpRow, v115SuTable as v116 left them): how many pages are
// live, visits and sign-ups over 30 days, the pages with their numbers, Ad links, Copy link and Edit, and the sign-ups
// with search and a CSV. Put a page live opens the picker; the tab is the address's (?tab=signups), and ?new=1 (Today's
// quick start) opens the picker once.

type Tab = 'pages' | 'signups'
const PER = 200

export function LandingView({ data }: { data: LandingData }) {
  const router = useRouter()
  const sp = useSearchParams()
  const hydrated = useHydrated()
  const tz = hydrated ? undefined : 'UTC'
  const tab: Tab = sp.get('tab') === 'signups' ? 'signups' : 'pages'
  const [q, setQ] = useState('')
  const [more, setMore] = useState(PER)
  const [picker, setPicker] = useState(false)
  const [edit, setEdit] = useState<string | null>(null)
  const [adsFor, setAdsFor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Today's "Put a landing page live" asks for the picker once (?new=1)
  const askedNew = sp.get('new') === '1'
  const [seenNew, setSeenNew] = useState(false)
  if (askedNew && !seenNew) {
    setSeenNew(true)
    setPicker(true)
  }
  if (!askedNew && seenNew) setSeenNew(false)
  useEffect(() => {
    if (askedNew) window.history.replaceState(null, '', tab === 'signups' ? '/landing-pages?tab=signups' : '/landing-pages')
  }, [askedNew, tab])

  const pick = (t: Tab) => window.history.replaceState(null, '', t === 'signups' ? '/landing-pages?tab=signups' : '/landing-pages')
  const N = nums(data.views, data.su, null, data.now)
  const live = data.pages.filter((p) => p.status === 'live').length
  const editing = edit ? data.pages.find((p) => p.id === edit) : undefined
  const adsPage = adsFor ? data.pages.find((p) => p.id === adsFor) : undefined

  return (
    <div data-testid="landing-page">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="flex items-center gap-2 text-[14px] text-ink-2" data-testid="landing-status">
          <i aria-hidden="true" className={`h-2 w-2 rounded-full ${data.error ? 'bg-bad' : 'bg-good'}`} />
          {data.error ? 'Could not load: ' + data.error : plural(live, 'page') + ' live'}
        </p>
        <ul className="flex flex-wrap gap-2" aria-label="What landing pages do">
          {[
            [LayoutTemplate, 'Pages at ' + PUBLIC_HOST + '/go'],
            [Users, 'Sign-ups go to HubSpot and the lead pipeline'],
            [LinkIcon, 'A tracking link for each ad'],
          ].map(([I, t]) => {
            const Ic = I as typeof Users
            return (
              <li key={t as string} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-[13px] font-semibold text-ink-2">
                <Ic size={14} aria-hidden="true" />
                {t as string}
              </li>
            )
          })}
        </ul>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={btn + ' px-3 py-2 text-[14px]'}
            disabled={busy}
            onClick={() => {
              setBusy(true)
              router.refresh()
              setTimeout(() => setBusy(false), 600)
            }}
          >
            <RefreshCw size={15} aria-hidden="true" />
            Refresh
          </button>
          <button type="button" className={primary + ' px-3.5 py-2 text-[14px]'} onClick={() => setPicker(true)}>
            <Plus size={15} aria-hidden="true" />
            Put a page live
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" data-testid="landing-strip">
        <StripTile n={live} label="live" active={tab === 'pages'} onClick={() => pick('pages')} />
        <StripTile n={N.views} label="visits in 30 days" />
        <StripTile n={N.su30} label="sign-ups in 30 days" active={tab === 'signups'} onClick={() => pick('signups')} />
        <StripTile n={N.conv !== null ? N.conv + '%' : '–'} label="sign-up rate" />
      </div>

      {data.error ? <ErrorNotice>Could not load: {data.error}</ErrorNotice> : null}

      <Tabs
        label="Landing pages"
        tabs={[
          { key: 'pages', label: 'Pages', count: data.pages.length },
          { key: 'signups', label: 'Sign-ups', count: data.su.length },
        ]}
        active={tab}
        onPick={pick}
      />

      <div role="tabpanel">
        {tab === 'pages' ? (
          data.pages.length ? (
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-2" data-testid="landing-list">
              {data.pages.map((p) => (
                <PageRow key={p.id} p={p} data={data} onEdit={() => setEdit(p.id)} onAds={() => setAdsFor(p.id)} />
              ))}
            </ul>
          ) : (
            <Empty
              icon={<LayoutTemplate size={30} aria-hidden="true" />}
              title="No landing pages yet"
              text="Make a funnel or a book-a-call campaign in Marketing Generation, then put its page live here."
              action={
                <button type="button" className={primary} onClick={() => setPicker(true)}>
                  Put a page live
                </button>
              }
            />
          )
        ) : (
          <Signups data={data} q={q} setQ={(v) => setQ(v)} more={more} setMore={setMore} tz={tz} />
        )}
      </div>

      {picker ? (
        <Picker
          onClose={() => setPicker(false)}
          onOpen={(id) => {
            setPicker(false)
            setEdit(id)
            pick('pages')
          }}
        />
      ) : null}
      {editing ? <Editor key={editing.id} page={editing} onClose={() => setEdit(null)} onAds={() => setAdsFor(editing.id)} /> : null}
      {adsPage ? <AdLinks page={adsPage} onClose={() => setAdsFor(null)} /> : null}
    </div>
  )
}

function PageRow({ p, data, onEdit, onAds }: { p: Page; data: LandingData; onEdit: () => void; onAds: () => void }) {
  const N = nums(data.views, data.su, p.id, data.now)
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-panel px-3.5 py-3" data-testid="landing-row" data-id={p.id}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-sunk text-ink-2">
        <LayoutTemplate size={19} aria-hidden="true" />
      </span>
      <div className="min-w-0 grow basis-[300px]">
        <b className="block break-words text-[15px] font-semibold text-ink">{p.title || p.slug}</b>
        <span className="block break-all text-[13px] text-ink-3">
          {p.status === 'live' ? (
            <a href={goUrl(p.slug)} target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline">
              {goText(p.slug)}
            </a>
          ) : (
            goText(p.slug)
          )}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {pagePill(p)}
          <Tag>{kindName(p.kind)}</Tag>
          <Tag>{plural(N.views, 'visit')} in 30 days</Tag>
          <Tag>{plural(N.su, 'sign-up')}</Tag>
          {N.conv !== null ? <Tag>{N.conv}% sign up</Tag> : null}
        </span>
      </div>
      <span className="flex flex-wrap items-center gap-1">
        {p.ads.length ? (
          <button type="button" className={ghost} onClick={onAds}>
            <Link2 size={15} aria-hidden="true" />
            Ad links
          </button>
        ) : null}
        {p.status === 'live' ? (
          <button type="button" className={ghost} onClick={() => void copyText(goUrl(p.slug))}>
            <Copy size={15} aria-hidden="true" />
            Copy link
          </button>
        ) : null}
        <button type="button" className={btn} onClick={onEdit}>
          <PenLine size={15} aria-hidden="true" />
          Edit
        </button>
      </span>
    </li>
  )
}

function Signups({
  data,
  q,
  setQ,
  more,
  setMore,
  tz,
}: {
  data: LandingData
  q: string
  setQ: (v: string) => void
  more: number
  setMore: (n: number) => void
  tz: string | undefined
}) {
  const rows = suRows(data.su, data.pages, q)
  const exportCsv = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csvOf(rows, data.pages)], { type: 'text/csv' }))
    a.download = csvName(Date.now())
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      URL.revokeObjectURL(a.href)
      a.remove()
    }, 500)
  }
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 grow basis-[260px]">
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            className={inputCls + ' max-w-[420px] py-1.5 pl-8 text-[14px]'}
            placeholder="Search sign-ups"
            aria-label="Search sign-ups"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setMore(PER)
            }}
          />
        </label>
        <button type="button" className={btn} disabled={!data.su.length} onClick={exportCsv}>
          <Download size={15} aria-hidden="true" />
          Export CSV
        </button>
      </div>
      {rows.length ? (
        <>
          <div className="relative overflow-x-auto rounded-md border border-line bg-panel">
            <table className="w-full min-w-[860px] text-[13.5px]" data-testid="signups">
              <thead>
                <tr className="border-b border-line text-left text-[12px] uppercase tracking-[0.06em] text-ink-3">
                  {['When', 'Name', 'Email', 'Company', 'Page', 'From', 'HubSpot', 'Lead'].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, more).map((s) => {
                  const pg = data.pages.find((p) => p.id === s.pageId)
                  const hs = hubspotOf(s)
                  return (
                    <tr key={s.id} className="border-b border-line align-top last:border-0" data-testid="signup-row">
                      <td className="px-3 py-2 text-ink-2">{whenText(s.createdAt, tz)}</td>
                      <td className="px-3 py-2 text-ink">
                        {s.name}
                        {s.jobTitle ? <small className="block text-[12.5px] text-ink-3">{s.jobTitle}</small> : null}
                      </td>
                      <td className="break-all px-3 py-2 text-ink-2">{s.email}</td>
                      <td className="px-3 py-2 text-ink-2">{s.company}</td>
                      <td className="px-3 py-2 text-ink-2">{pg ? pg.title : s.slug}</td>
                      <td className="px-3 py-2 text-ink-2">{suFrom(s)}</td>
                      <td className="px-3 py-2">
                        <span className={hs === 'Added' ? 'font-semibold text-good' : 'text-ink-3'} title={hs === 'Not added' ? s.hubspotError : undefined}>
                          {hs}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {s.leadAdded && s.leadHref ? (
                          <a href={s.leadHref} className={btn}>
                            Open lead
                          </a>
                        ) : (
                          <span className="text-ink-3">No</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {rows.length > more ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-[13px] text-ink-3">
                Showing {more} of {rows.length}
              </span>
              <button type="button" className={btn} onClick={() => setMore(more + PER)}>
                Show more
              </button>
            </div>
          ) : null}
          {data.su.length >= 1000 ? <p className="mt-2 text-[13px] text-ink-3">The newest 1,000 sign-ups show here and in the CSV.</p> : null}
        </>
      ) : (
        <Empty
          icon={<User size={30} aria-hidden="true" />}
          title={q ? 'Nothing matches' : 'No sign-ups yet'}
          text={q ? 'Try another search.' : 'Sign-ups from your live pages show up here.'}
        />
      )}
    </>
  )
}
