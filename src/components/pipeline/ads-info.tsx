'use client'

import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { type AdSchedule, FX } from '@/lib/pipeline/ad-strategist'
import { primary } from './bits'

// The Ad Strategist's "how it works" texts (E9_INFO adpick, adscore and acap) and How the ad score works
// (nwAdScoreHow). The score's text says 0 to 100, as the page shows it (the old one still said 0 to 1).

export type AdInfoKey = 'adpick' | 'adscore' | 'acap'

export const AD_INFO_TITLE: Record<AdInfoKey, string> = {
  adpick: 'How ads are picked for the brief',
  adscore: 'How the ad score is worked out',
  acap: 'Captured in brief version',
}

const P = 'mb-2.5 text-[14.5px] leading-relaxed text-ink-2'
const LI = 'text-[14.5px] leading-relaxed text-ink-2'

export function AdInfoBody({ k, S }: { k: AdInfoKey; S: AdSchedule }) {
  if (k === 'adpick') {
    return (
      <>
        <p className={P}>The Ad Strategist does not read every ad it pulls. It builds a short list for each brief:</p>
        <ul className="mb-2.5 grid list-disc gap-1.5 pl-5">
          <li className={LI}>
            <b className="text-ink">Proven or emerging only.</b> Proven means it ran 6 weeks or more, or your team uploaded it. Emerging means it is still running and
            at least 14 days in. Ads that are neither, such as ones under two weeks old, are not considered.
          </li>
          <li className={LI}>
            <b className="text-ink">Each advertiser’s best first:</b> still running before stopped, then by score, which blends how long an ad ran with how recently
            it was seen. Ads last seen more than 45 days ago drop out, unless the advertiser has nothing newer.
          </li>
          <li className={LI}>
            <b className="text-ink">Advertisers take turns:</b> each one’s best ad, then each one’s second best, and so on, at most {S.per} per advertiser and{' '}
            {S.behind} in all. The first {S.top} are the top ads.
          </li>
        </ul>
        <p className={P}>
          The limits are set in Settings, under Agent runs. Each brief lists every ad behind it, with its rule above the list, for example “24 curated · 7
          advertisers · best of each advertiser first, running before stopped”. Briefs built from your uploads use every ad your team picked.
        </p>
      </>
    )
  }
  if (k === 'adscore') {
    return (
      <>
        <p className={P}>The Ad Strategist scores each ad from 0 to 100 using what the Meta Ad Library shows:</p>
        <ul className="mb-2.5 grid list-disc gap-1.5 pl-5">
          <li className={LI}>
            <b className="text-ink">45%</b> how long it has run. Full marks at 12 weeks or more.
          </li>
          <li className={LI}>
            <b className="text-ink">35%</b> whether it is still running. Full marks if it was seen in the last 7 days, falling to zero after 60 days unseen.
          </li>
          <li className={LI}>
            <b className="text-ink">10%</b> repeats. The same copy used in two or more ads from the batch.
          </li>
          <li className={LI}>
            <b className="text-ink">10%</b> reach. Any impressions or engagement numbers shown.
          </li>
        </ul>
        <p className={P}>Ads your team uploads have no score, because the library data is missing.</p>
        <p className={P}>Running time is a sign that someone keeps paying for the ad. It is not proof of sales.</p>
      </>
    )
  }
  return (
    <>
      <p className={P}>
        The advertisement brief that listed the ad as evidence. Every brief lists the ads behind it at the end, and an ad can feed more than one brief.
      </p>
      <p className={P}>
        <b className="text-ink">Not used</b> means the ad was pulled or uploaded but did not make a brief’s short list. Its note says what is known, for example
        that the advertiser already had stronger ads in that brief, or that it is waiting for a brief built from uploads.
      </p>
    </>
  )
}

/** The small i that opens one of the texts above. */
export function AdInfoButton({ k, S }: { k: AdInfoKey; S: AdSchedule }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        aria-label={AD_INFO_TITLE[k]}
        title={AD_INFO_TITLE[k]}
        className="ml-1 inline-grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border border-line-2 align-middle text-[11px] font-semibold normal-case tracking-normal text-ink-3 hover:border-accent hover:text-accent-text"
      >
        i
      </button>
      {open ? (
        <Dialog
          open
          onClose={() => setOpen(false)}
          kicker="How it works"
          title={AD_INFO_TITLE[k]}
          width={560}
          footer={
            <button type="button" className={primary} onClick={() => setOpen(false)}>
              Got it
            </button>
          }
        >
          <AdInfoBody k={k} S={S} />
        </Dialog>
      ) : null}
    </>
  )
}

/** How the ad score works (nwAdScoreHow): the four parts and what running time means. */
export function ScoreHow({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      open
      onClose={onClose}
      kicker="Ad Strategist"
      title="How the ad score works"
      width={680}
      footer={
        <button type="button" className={primary} onClick={onClose}>
          Close
        </button>
      }
    >
      <p className="mb-3 text-[14.5px] leading-relaxed text-ink-2">
        Every ad pulled from the Meta Ad Library gets a score from 0 to 100, worked out from what the library shows on the day of the pull.
      </p>
      <div className="mb-4 grid gap-2 sm:grid-cols-2" data-testid="score-how">
        {FX.map((f) => (
          <div key={f.k} className="rounded-md border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <b className="text-[14px] text-ink">{f.label}</b>
              <span className="text-[13px] font-semibold text-accent-text">{f.w}%</span>
            </div>
            <p className="mt-1 text-[13px] text-ink-3">{f.how}</p>
          </div>
        ))}
      </div>
      <p className="text-[14px] leading-relaxed text-ink-2">
        Running time shows an advertiser kept paying for the ad, not that it made sales. Ads your team uploads have no score.
      </p>
    </Dialog>
  )
}
