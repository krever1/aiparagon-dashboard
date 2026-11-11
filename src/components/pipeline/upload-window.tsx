'use client'

import { type ClipboardEvent, type DragEvent, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, ImagePlus, X } from 'lucide-react'
import { followForAds } from '@/app/(app)/ad-strategist/actions'
import { saveUploadedAd, startAdUploads } from '@/app/(app)/ad-strategist/upload-actions'
import { Dialog } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { SUPABASE_ANON_KEY } from '@/lib/config'
import { forAds, libSearch } from '@/lib/pipeline/ad-strategist'
import type { Competitor } from '@/lib/pipeline/intel'
import { UP_MAX_BYTES, UP_MAX_FILES, UP_PLATFORMS, linkOf } from '@/lib/pipeline/uploads'
import { ghost, inputCls, linkCls, primary, selectCls } from './bits'
import { ForSeg } from './ads-following'
import { clip } from './ads-cards'

// Add competitor ads (apOpenAdUpload with v113's question): screenshots dropped, chosen or pasted, whose ad it is, the
// platform, its link and copy. Each ad's screenshots go from the browser straight into Storage (creatives/uploads) at
// addresses the server signs as the teammate, then the analyzer reads the ad and its row is saved. Then, when the
// advertiser is not followed for ads yet, the window asks whether to follow them (v111FollowAsk).

const OFF = 'Could not reach the dashboard. Try again in a minute.'
const NOFOLLOW_KEY = 'ap.v111.nofollow'
const LABEL = 'grid gap-1 text-[13.5px] font-semibold text-ink'

type Line = { text: string; tone: 'ok' | 'err' | '' }
type Picked = { file: File; url: string; key: number }

/** Advertisers this browser said Not now to (kept by the current dashboard under the same key). */
function noFollow(): Record<string, unknown> {
  try {
    const v = JSON.parse(window.localStorage.getItem(NOFOLLOW_KEY) || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

export function UploadWindow({
  names,
  follows,
  onClose,
  onDone,
}: {
  /** suggestions for whose ad it is: the accounts followed and the advertisers already seen */
  names: string[]
  follows: Competitor[]
  onClose: () => void
  /** after the upload (and the follow question): the last ad saved */
  onDone: (lastId: string) => void
}) {
  const [files, setFiles] = useState<Picked[]>([])
  const [separate, setSeparate] = useState(false)
  const [adv, setAdv] = useState('')
  const [platform, setPlatform] = useState('linkedin')
  const [link, setLink] = useState('')
  const [copy, setCopy] = useState('')
  const [inBrief, setInBrief] = useState(true)
  const [log, setLog] = useState<Line[]>([])
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [ask, setAsk] = useState<{ adv: string; n: number; last: string; page: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const seq = useRef(0)
  const shown = useRef<Picked[]>([])
  useEffect(() => {
    shown.current = files
  }, [files])
  // the pictures' previews are let go when the window closes
  useEffect(() => () => shown.current.forEach((p) => URL.revokeObjectURL(p.url)), [])

  const add = (list: File[]) => {
    const next: Picked[] = []
    let full = false
    for (const f of list) {
      if (!/^image\//i.test(f.type)) continue
      if (f.size > UP_MAX_BYTES) {
        toast((f.name || 'A screenshot') + ' is over 8 MB, skipped', 'warn')
        continue
      }
      if (files.length + next.length >= UP_MAX_FILES) {
        full = true
        break
      }
      next.push({ file: f, url: URL.createObjectURL(f), key: ++seq.current })
    }
    if (full) toast(UP_MAX_FILES + ' screenshots at most', 'warn')
    if (next.length) setFiles((x) => [...x, ...next])
  }
  const drop = (key: number) =>
    setFiles((x) => {
      const p = x.find((y) => y.key === key)
      if (p) URL.revokeObjectURL(p.url)
      return x.filter((y) => y.key !== key)
    })

  const note = (text: string, tone: Line['tone'] = '') => setLog((l) => [...l, { text, tone }])

  const go = async () => {
    if (busy) return
    setLog([])
    const advertiser = adv.replace(/\s+/g, ' ').trim()
    if (!files.length && !copy.trim()) return setLog([{ text: 'Add at least one screenshot, or paste the ad copy.', tone: 'err' }])
    if (!advertiser) return setLog([{ text: 'Say whose ad this is.', tone: 'err' }])
    if (linkOf(link) === null) return setLog([{ text: 'The ad link should be a web address, for example https://www.linkedin.com/ad-library/detail/…', tone: 'err' }])
    setBusy(true)
    const groups: File[][] = files.length ? (separate ? files.map((p) => [p.file]) : [files.map((p) => p.file)]) : [[]]
    let saved = 0
    let last = ''
    for (let i = 0; i < groups.length; i++) {
      const pre = groups.length > 1 ? 'Ad ' + (i + 1) + ' of ' + groups.length + ': ' : ''
      const g = groups[i]
      let paths: string[] = []
      if (g.length) {
        note(pre + 'uploading ' + (g.length === 1 ? g[0].name || 'screenshot' : g.length + ' screenshots') + '…')
        const s = await startAdUploads({ files: g.map((f) => ({ name: f.name, size: f.size, type: f.type })) }).catch(() => ({ ok: false as const, error: OFF }))
        if (!s.ok) {
          note('Stopped: ' + s.error, 'err')
          break
        }
        let failed = ''
        for (let k = 0; k < s.files.length; k++) {
          let res: Response | null = null
          try {
            res = await fetch(s.files[k].url, {
              method: 'PUT',
              // only the headers supabase-js sends from a browser, which Supabase's CORS check allows
              headers: { 'content-type': g[k].type || 'image/png', 'x-upsert': 'false', apikey: SUPABASE_ANON_KEY },
              body: g[k],
            })
          } catch {
            res = null
          }
          if (!res || !res.ok) {
            failed = 'the upload failed' + (res ? ' (' + res.status + ')' : '') + '. Try again in a minute.'
            break
          }
        }
        if (failed) {
          note('Stopped: ' + failed, 'err')
          break
        }
        paths = s.files.map((x) => x.path)
      }
      note(pre + 'reading the ad…')
      const r = await saveUploadedAd({ paths, advertiser, platform, link, copy, inBrief, first: i === 0 }).catch(() => ({ ok: false as const, error: OFF }))
      if (!r.ok) {
        note(pre + 'could not be saved: ' + r.error, 'err')
        continue
      }
      saved++
      last = r.id
      if (r.analysed) note(pre + 'saved. Hook: “' + (r.hook.trim() ? clip(r.hook.trim(), 90) : '(none read)') + '”', 'ok')
      else note(pre + 'saved, but not read yet: ' + r.why + ' You can read it again from the ad.', 'err')
    }
    setBusy(false)
    if (!saved) return
    toast(saved + (saved === 1 ? ' ad' : ' ads') + ' added to Ad Strategist')
    // the follow question: an advertiser not followed for ads, that this browser has not said Not now to
    const k = advertiser.toLowerCase()
    const same = follows.filter((c) => c.name.trim().toLowerCase() === k)
    const followed = same.some((c) => c.status !== 'denied' && forAds(c))
    if (!followed && !(k in noFollow())) {
      setAsk({ adv: advertiser, n: saved, last, page: same.find((c) => c.metaPageId.trim())?.metaPageId ?? '' })
      return
    }
    setTimeout(() => onDone(last), 900)
  }

  if (ask) return <FollowAsk ask={ask} log={log} onDone={() => onDone(ask.last)} />

  return (
    <Dialog
      open
      onClose={() => {
        if (!busy) onClose()
      }}
      kicker="Pipeline · Ad Strategist"
      title="Add competitor ads"
      width={680}
      footer={
        <>
          <button type="button" className={ghost} disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primary} disabled={busy} onClick={() => void go()}>
            {busy ? 'Working…' : 'Upload and analyse'}
          </button>
        </>
      }
    >
      <div
        data-testid="upload-window"
        onPaste={(e: ClipboardEvent<HTMLDivElement>) => {
          const got = Array.from(e.clipboardData?.items ?? [])
            .filter((it) => it.kind === 'file' && /^image\//i.test(it.type))
            .map((it) => it.getAsFile())
            .filter((f): f is File => !!f)
          if (!got.length) return
          e.preventDefault()
          add(got)
        }}
      >
        <p className="mb-3 text-[14px] text-ink-2">
          Screenshots are read for the hook, the copy and what the image does. Choose below whether they go into the next ads brief.
        </p>
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e: DragEvent) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e: DragEvent) => {
            e.preventDefault()
            setOver(false)
            add(Array.from(e.dataTransfer?.files ?? []))
          }}
          className={`flex w-full flex-col items-center gap-1 rounded-md border-2 border-dashed px-4 py-6 text-center ${
            over ? 'border-accent bg-accent-soft' : 'border-accent/40 bg-accent-soft/40 hover:border-accent'
          }`}
        >
          <ImagePlus size={24} aria-hidden="true" className="text-accent-text" />
          <b className="text-[14.5px] text-ink">Drop screenshots here, click to choose, or paste one</b>
          <small className="text-[13px] text-ink-3">PNG or JPG. Several screenshots of the same ad are read together as a carousel.</small>
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          aria-label="Screenshots"
          onChange={(e) => {
            add(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
        {files.length ? (
          <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2" aria-label="Screenshots picked">
            {files.map((p) => (
              <li key={p.key} className="relative aspect-square overflow-hidden rounded-sm border border-line bg-sunk">
                {/* eslint-disable-next-line @next/next/no-img-element -- a picture still in the browser */}
                <img src={p.url} alt={p.file.name || 'Screenshot'} className="h-full w-full object-cover" />
                <button
                  type="button"
                  title="Remove"
                  aria-label={'Remove ' + (p.file.name || 'screenshot')}
                  disabled={busy}
                  onClick={() => drop(p.key)}
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-[rgba(14,18,34,.65)] text-white hover:bg-[rgba(14,18,34,.85)]"
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <label className="mt-3 flex items-center gap-2 text-[14px] text-ink-2">
          <input type="checkbox" checked={separate} onChange={(e) => setSeparate(e.target.checked)} />
          Each screenshot is a separate ad
        </label>
        <div className="mt-3 grid grid-cols-1 gap-3 min-[561px]:grid-cols-2">
          <label className={LABEL}>
            Advertiser
            <input className={inputCls} placeholder="e.g. Scribe" list="up-advertisers" value={adv} onChange={(e) => setAdv(e.target.value)} />
            <datalist id="up-advertisers">
              {names.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
          <label className={LABEL}>
            Platform
            <select className={selectCls + ' py-2 text-[14.5px]'} value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {UP_PLATFORMS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={LABEL + ' mt-3'}>
          Ad link
          <input className={inputCls} type="url" placeholder="https://www.linkedin.com/ad-library/detail/…" value={link} onChange={(e) => setLink(e.target.value)} />
        </label>
        <label className={LABEL + ' mt-3'}>
          Ad copy (optional)
          <textarea
            className={inputCls + ' min-h-[90px]'}
            placeholder="Paste the post text if you have it. The screenshot is read either way."
            value={copy}
            onChange={(e) => setCopy(e.target.value)}
          />
        </label>
        <Log log={log} />
        <label className="mt-3 flex items-start gap-2 text-[14px] text-ink">
          <input type="checkbox" className="mt-1" checked={inBrief} onChange={(e) => setInBrief(e.target.checked)} />
          <span>
            Use these in the next ads brief
            <small className="block text-[12.5px] text-ink-3">You can switch it off later on each ad.</small>
          </span>
        </label>
      </div>
    </Dialog>
  )
}

/** What the upload did, ad by ad (green when read, red when not). */
function Log({ log }: { log: Line[] }) {
  if (!log.length) return null
  return (
    <ul className="mt-3 grid gap-1 rounded-sm bg-sunk px-3 py-2 text-[13.5px]" role="status" data-testid="upload-log">
      {log.map((l, i) => (
        <li key={i} className={l.tone === 'ok' ? 'text-good' : l.tone === 'err' ? 'text-bad' : 'text-ink-2'}>
          {l.text}
        </li>
      ))}
    </ul>
  )
}

/**
 * Follow {advertiser} too? (v111FollowAsk): their Facebook page, ads only or ads and posts, or Not now. What the upload
 * did stays on screen under it (the old window replaced it, so an ad the analyzer could not read went by unseen).
 */
function FollowAsk({ ask, log, onDone }: { ask: { adv: string; n: number; page: string }; log: Line[]; onDone: () => void }) {
  const [page, setPage] = useState(ask.page)
  const [forWhat, setForWhat] = useState<'ads' | 'both'>('ads')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLInputElement>(null)
  // the window opens before this runs, so the page box gets the keyboard
  useEffect(() => {
    box.current?.focus()
  }, [])
  const yes = async () => {
    setErr('')
    setBusy(true)
    const r = await followForAds({ name: ask.adv, page, kind: 'company', forWhat }).catch(() => ({ ok: false as const, error: OFF }))
    setBusy(false)
    if (!r.ok) return setErr(r.error)
    toast(r.toast)
    onDone()
  }
  const no = () => {
    try {
      window.localStorage.setItem(NOFOLLOW_KEY, JSON.stringify({ ...noFollow(), [ask.adv.toLowerCase()]: 1 }))
    } catch {
      // asked again next time
    }
    onDone()
  }
  return (
    <Dialog
      open
      onClose={onDone}
      kicker="Pipeline · Ad Strategist"
      title={'Follow ' + ask.adv + ' too?'}
      width={600}
      footer={
        <>
          <button type="button" className={ghost} disabled={busy} onClick={no}>
            Not now
          </button>
          <button type="button" className={primary} disabled={busy} onClick={() => void yes()}>
            {busy ? 'Saving…' : 'Follow ' + ask.adv}
          </button>
        </>
      }
    >
      <div data-testid="follow-ask">
        <p className="mb-3 text-[14px] text-ink-2">
          {ask.n + (ask.n === 1 ? ' ad' : ' ads')} from {ask.adv} saved. Follow {ask.adv} and the Ad Strategist pulls their ads from the Meta Ad Library on every
          run.
        </p>
        <label className={LABEL}>
          Their Facebook page
          <input
            ref={box}
            className={inputCls}
            placeholder="facebook.com/their-page, or the page ID"
            value={page}
            onChange={(e) => setPage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void yes()
            }}
          />
        </label>
        <div className="mt-3">
          <ForSeg value={forWhat} label="Follow for" onPick={setForWhat} busy={busy} />
        </div>
        <p className="mt-3 text-[13px] text-ink-3">
          <a href={libSearch(ask.adv)} target="_blank" rel="noopener noreferrer" className={linkCls + ' text-[13px]'}>
            Find {ask.adv} in the Meta Ad Library
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>{' '}
          and copy the page link from one of their ads.
        </p>
        {err ? (
          <p role="alert" className="mt-3 rounded-sm bg-bad-soft px-3 py-2 text-[13.5px] text-bad">
            {err}
          </p>
        ) : null}
        <Log log={log} />
      </div>
    </Dialog>
  )
}
