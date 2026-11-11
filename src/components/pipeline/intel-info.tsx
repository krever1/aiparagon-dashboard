'use client'

import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { FACTORS } from '@/lib/pipeline/intel'
import { Pill, primary } from './bits'

// The Intel Tracker's "how it works" texts (E9_INFO.eng, opick, ocap and folint as v111 left them), and the window
// that shows one, from the small i next to what it explains.

export type InfoKey = 'eng' | 'opick' | 'ocap' | 'folint'

/** The run's limits from Settings > Agent runs: posts read, posts kept in the brief. */
export type Limits = { read: number; keep: number }

export const INFO_TITLE: Record<InfoKey, string> = {
  eng: 'How posts are scored',
  opick: 'How posts are picked for the organic brief',
  ocap: 'Captured in brief version',
  folint: 'What the Intel Tracker reads',
}

export function InfoBody({ k, L }: { k: InfoKey; L: Limits }) {
  const p = 'mb-2 text-[14.5px] leading-relaxed text-ink-2'
  if (k === 'eng') {
    return (
      <>
        <p className={p}>Every post the Intel Tracker reads gets a score from 0 to 100 and a line on why. Five parts are scored, then weighted:</p>
        <ul className={p + ' list-disc pl-5'}>
          <li>
            <b>Buyer relevance</b> (35%): how closely the topic matches the buyers you sell to.
          </li>
          <li>
            <b>Engagement</b> (20%): likes or reactions, comments, shares and reposts, added together. On X, replies and quotes count too. It is
            compared with the author’s usual reach. For an author without three earlier posts, it is compared with the rest of the run, where the most
            engaged post scores 100. Web articles have no counts, so the other four parts make their score.
          </li>
          <li>
            <b>Content opportunity</b> (20%), <b>timeliness</b> (15%) and <b>source credibility</b> (10%): how easily it becomes a post or reply for
            you, how recent it is, and who is speaking.
          </li>
        </ul>
        <p className={p}>
          <b>Value:</b> 70 and up is high, 45 to 69 medium, under 45 low. Off-topic posts stop at 30, so a popular post that is off-topic still scores
          low.
        </p>
        <p className={p}>Older runs rated posts high, medium or low, without a number.</p>
      </>
    )
  }
  if (k === 'opick') {
    return (
      <>
        <p className={p}>Each run of the Intel Tracker reads new posts and writes one organic brief from the best of them.</p>
        <ol className={p + ' list-decimal pl-5'}>
          <li>
            <b>Found:</b> posts from the people and companies you follow, plus LinkedIn and web results for the topics you follow.
          </li>
          <li>
            <b>Read:</b> up to {L.read} posts a run, the most engaged first, with room for web articles on your topics.
          </li>
          <li>
            <b>Scored:</b> each post gets its score from 0 to 100. Off-topic posts, reshares and passing mentions score low.
          </li>
          <li>
            <b>In the brief:</b> the top {L.keep} on-topic posts by score, from the themes and organic categories you track. They make the short
            version, what changed, topic watch and the evidence table. Themes are counted across every tracked post read.
          </li>
        </ol>
        <p className={p}>
          Both numbers are set in Settings, under Agent runs. The themes and categories are on the Following tab. Open any post to see which of these it
          met.
        </p>
      </>
    )
  }
  if (k === 'ocap') {
    return (
      <>
        <p className={p}>
          The organic brief each post went into. Every run of the Intel Tracker writes one brief from the top {L.keep} on-topic posts it read, by score.
        </p>
        <p className={p}>
          <b>Not used</b> means the agent read the post but left it out of the brief: it was off-topic for your buyers, it fell outside the themes and
          categories you track, or it scored below the top posts of its run. Open the post to see which.
        </p>
        <p className={p}>With a weekly run, every Monday morning for example, each brief holds the best posts from that week’s run.</p>
      </>
    )
  }
  return (
    <>
      <p className={p}>
        Each run reads new posts from the people and companies below, and searches LinkedIn and the web for your topics, technologies and industries,
        up to 12 searches in total.
      </p>
      <p className={p}>What it finds fills the Posts tab, the replies to approve and the organic brief. Changes apply from the next run.</p>
      <p className={p}>To follow a person or company directly, add them with their LinkedIn link.</p>
    </>
  )
}

/** The small i that opens a "how it works" window (e9Info). */
export function InfoButton({ k, L }: { k: InfoKey; L: Limits }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={INFO_TITLE[k]}
        title={INFO_TITLE[k]}
        className="ml-1 inline-grid h-[18px] w-[18px] place-items-center rounded-full border border-line-2 align-middle text-[11px] font-semibold text-ink-3 hover:border-accent hover:text-accent-text"
      >
        i
      </button>
      {open ? (
        <Dialog
          open
          onClose={() => setOpen(false)}
          kicker="How it works"
          title={INFO_TITLE[k]}
          width={560}
          footer={
            <button type="button" className={primary} onClick={() => setOpen(false)}>
              Got it
            </button>
          }
        >
          <InfoBody k={k} L={L} />
        </Dialog>
      ) : null}
    </>
  )
}

/** How posts are rated (nwScoreHow): the five parts and the value bands, or how older runs rated them. */
export function ScoreHow({ scored, L, onClose }: { scored: boolean; L: Limits; onClose: () => void }) {
  return (
    <Dialog
      open
      onClose={onClose}
      kicker="Intel Tracker"
      title="How posts are rated"
      width={640}
      footer={
        <button type="button" className={primary} onClick={onClose}>
          Close
        </button>
      }
    >
      {scored ? (
        <>
          <p className="mb-3 text-[14.5px] leading-relaxed text-ink-2">
            Every post gets a value score from 0 to 100. Five factors are scored, then weighted. Relevance carries the most weight, so a popular post that is
            off-topic still scores low.
          </p>
          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            {FACTORS.map((f) => (
              <div key={f.key} className="rounded-md border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <b className="text-[14px] text-ink">{f.label}</b>
                  <span className="text-[13px] font-semibold text-accent-text">{f.weight}%</span>
                </div>
                <p className="mt-1 text-[13px] text-ink-3">{f.desc}</p>
              </div>
            ))}
          </div>
          <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">Value bands</p>
          <div className="mb-4 flex flex-wrap gap-1.5">
            <Pill tone="good">High value · 70 and up</Pill>
            <Pill tone="warn">Medium · 45 to 69</Pill>
            <Pill>Low value · under 45</Pill>
          </div>
        </>
      ) : (
        <div className="mb-3">
          <InfoBody k="eng" L={L} />
        </div>
      )}
      <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">{INFO_TITLE.opick}</p>
      <InfoBody k="opick" L={L} />
    </Dialog>
  )
}
