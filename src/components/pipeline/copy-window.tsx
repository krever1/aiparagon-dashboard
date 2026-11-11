'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy } from 'lucide-react'
import { type CopyChoices, copyChoices, saveAdCopy, writeAdCopy } from '@/app/(app)/ad-strategist/upload-actions'
import { Dialog } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { type CopyResult, copyAllText } from '@/lib/pipeline/uploads'
import { btn, ghost, primary, selectCls } from './bits'
import { clip } from './ads-cards'
import { CopyBody, copyText, variantsOf } from './copy-cards'

// Write ad copy from these ads (apOpenAdCopy, apRunAdCopy, apSaveAdCopy): the ads to learn from (the team's read
// uploads, else a few Ad Library ads), the platform and how many variants; the copy writer takes the patterns only and
// writes in the words of the guidelines and the brand voice. Save to Pipeline keeps the set (Runs & uploads, Ad copy).

const OFF = 'Could not reach the dashboard. Try again in a minute.'
const LABEL = 'grid gap-1 text-[13.5px] font-semibold text-ink'

export function CopyWindow({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [c, setC] = useState<Extract<CopyChoices, { ok: true }> | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [platform, setPlatform] = useState('meta')
  const [count, setCount] = useState(3)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'err' | '' } | null>(null)
  const [result, setResult] = useState<{ r: CopyResult; platform: string; ids: string[] } | null>(null)
  const [saving, setSaving] = useState<'' | 'busy' | 'done'>('')

  useEffect(() => {
    let live = true
    void copyChoices()
      .catch(() => ({ ok: false as const, error: OFF }))
      .then((r) => {
        if (!live) return
        if (!r.ok) return setLoadErr(r.error)
        setC(r)
        setPicked(new Set(r.ads.map((a) => a.id)))
      })
    return () => {
      live = false
    }
  }, [])

  const go = async () => {
    if (busy || !c) return
    const ids = c.ads.filter((a) => picked.has(a.id)).map((a) => a.id)
    if (!ids.length) return setMsg({ text: 'Pick at least one ad.', tone: 'err' })
    setBusy(true)
    setResult(null)
    setSaving('')
    setMsg({ text: 'Writing ' + count + ' variants from ' + ids.length + (ids.length === 1 ? ' ad' : ' ads') + '…', tone: '' })
    const r = await writeAdCopy({ ids, platform, count }).catch(() => ({ ok: false as const, error: OFF }))
    setBusy(false)
    if (!r.ok) return setMsg({ text: r.error, tone: 'err' })
    setResult({ r: r.result, platform, ids })
    setMsg({ text: r.result.variants.length + (r.result.variants.length === 1 ? ' variant' : ' variants') + ' written.', tone: 'ok' })
  }

  const save = async () => {
    if (!result || saving) return
    setSaving('busy')
    const r = await saveAdCopy({ result: result.r, platform: result.platform, ids: result.ids }).catch(() => ({ ok: false as const, error: OFF }))
    if (!r.ok) {
      setSaving('')
      return toast('Could not save: ' + r.error.replace(/^Could not save: /, ''), 'warn')
    }
    setSaving('done')
    toast(r.toast)
  }

  return (
    <Dialog
      open
      onClose={() => {
        if (!busy) onClose()
      }}
      kicker="Pipeline · Ad copy"
      title="Write ad copy from these ads"
      width={780}
      footer={
        <>
          <button type="button" className={ghost} disabled={busy} onClick={onClose}>
            Close
          </button>
          <button type="button" className={result ? btn : primary} disabled={busy || !c?.ads.length} onClick={() => void go()}>
            {busy ? 'Writing…' : result ? 'Write again' : 'Write the copy'}
          </button>
        </>
      }
    >
      <div data-testid="copy-window">
        {loadErr ? (
          <p role="alert" className="text-[14px] text-bad">
            {loadErr}
          </p>
        ) : !c ? (
          <p className="text-[14px] text-ink-3">Loading…</p>
        ) : (
          <>
            <p className="mb-3 text-[14px] text-ink-2">
              Original copy for {c.offer}. The ads are pattern evidence only; wording comes from our guidelines and brand voice.
            </p>
            <p className="mb-1.5 text-[13.5px] font-semibold text-ink">Ads to learn from ({c.ads.length})</p>
            {c.ads.length ? (
              <>
                {c.library ? <p className="mb-1.5 text-[13px] text-ink-3">None of your uploads is read yet, so these are ads from the Ad Library.</p> : null}
                <ul className="grid max-h-[190px] gap-0.5 overflow-y-auto rounded-sm border border-line p-1.5" aria-label="Ads to learn from">
                  {c.ads.map((a) => (
                    <li key={a.id}>
                      <label className="flex items-start gap-2 rounded-sm px-1.5 py-1 text-[13.5px] text-ink-2 hover:bg-sunk">
                        <input
                          type="checkbox"
                          className="mt-1"
                          disabled={busy}
                          checked={picked.has(a.id)}
                          onChange={(e) =>
                            setPicked((s) => {
                              const n = new Set(s)
                              if (e.target.checked) n.add(a.id)
                              else n.delete(a.id)
                              return n
                            })
                          }
                        />
                        <span>
                          <b className="text-ink">{a.advertiser}</b> · {clip(a.title, 80)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-[14px] text-ink-3">No analysed ads yet. Upload a few competitor ads first.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-3">
              <label className={LABEL}>
                Platform
                <select className={selectCls + ' py-2'} value={platform} disabled={busy} onChange={(e) => setPlatform(e.target.value)}>
                  <option value="meta">Meta</option>
                  <option value="linkedin">LinkedIn</option>
                </select>
              </label>
              <label className={LABEL}>
                Variants
                <select className={selectCls + ' py-2'} value={count} disabled={busy} onChange={(e) => setCount(Number(e.target.value))}>
                  {[2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mt-3 text-[13.5px] text-ink-2" data-testid="copy-guides">
              {c.guides.length ? (
                <>
                  Guidelines used:{' '}
                  {c.guides.map((g, i) => (
                    <span key={g + i}>
                      {i ? ', ' : ''}
                      <b className="text-ink">{g}</b>
                    </span>
                  ))}
                </>
              ) : (
                'Guidelines used: none with readable text. Upload a brand guide in Files and it is read automatically.'
              )}
              {c.voice ? ' · brand voice from the company profile' : ''}
            </p>
          </>
        )}
        {msg ? (
          <p role={msg.tone === 'err' ? 'alert' : 'status'} className={`mt-3 text-[14px] ${msg.tone === 'ok' ? 'text-good' : msg.tone === 'err' ? 'text-bad' : 'text-ink-2'}`}>
            {msg.text}
          </p>
        ) : null}
        {result ? (
          <div className="mt-3" data-testid="copy-result">
            <CopyBody takeaways={result.r.takeaways} variants={variantsOf(result.r)} notes={result.r.notes.join(' · ')} />
            <div className="mt-3 flex flex-wrap gap-2">
              {saving === 'done' ? (
                <button
                  type="button"
                  className={btn}
                  onClick={() => {
                    onClose()
                    router.push('/runs?tab=copy')
                  }}
                >
                  ✓ Saved · view in history
                </button>
              ) : (
                <button type="button" className={primary} disabled={saving === 'busy'} onClick={() => void save()}>
                  {saving === 'busy' ? 'Saving…' : 'Save to Pipeline'}
                </button>
              )}
              <button type="button" className={btn} onClick={() => void copyText(copyAllText(result.r), 'Copied every variant')}>
                <Copy size={14} aria-hidden="true" />
                Copy all
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  )
}
