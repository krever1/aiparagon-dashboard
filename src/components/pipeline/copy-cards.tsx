'use client'

import { Copy } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { type CopyVariant, variantText } from '@/lib/pipeline/ad-strategist'
import type { CopyResult } from '@/lib/pipeline/uploads'
import { Tag, ghost } from './bits'

// A set of ad copy as apCopyHtml draws it: the key takeaways, one card per variant (its hook, the text, the headline,
// the call to action, the picture and the pattern it borrowed, with Copy), then how the guidelines shaped it. The
// Uploads tab, the Write ad copy window and Runs & uploads show the same cards.

export async function copyText(text: string, done = 'Copied') {
  try {
    await navigator.clipboard.writeText(text)
    toast(done)
  } catch {
    toast('Could not copy here', 'warn')
  }
}

/** The copy writer's answer as the cards read it. */
export const variantsOf = (r: CopyResult): CopyVariant[] =>
  r.variants.map((v) => ({
    angle: v.angle,
    hook: v.hook,
    primary: v.primary_text,
    headline: v.headline,
    cta: v.cta,
    image: v.image_direction,
    pattern: v.pattern_borrowed,
  }))

export function CopyBody({ takeaways, variants, notes }: { takeaways: string[]; variants: CopyVariant[]; notes: string }) {
  return (
    <div className="grid gap-3">
      {takeaways.length ? (
        <div>
          <b className="mb-1 block text-[13px] text-ink">Key takeaways</b>
          <ul className="grid list-disc gap-1 pl-5 text-[13.5px] text-ink-2">
            {takeaways.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {variants.map((v, i) => (
        <div key={i} className="rounded-md border border-line p-3" data-testid="copy-variant">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <b className="text-[13.5px] text-ink">Variant {String.fromCharCode(65 + (i % 26))}</b>
            {v.angle ? <Tag gold>{v.angle}</Tag> : null}
            <button type="button" className={ghost + ' ml-auto'} onClick={() => void copyText(variantText(v))}>
              <Copy size={13} aria-hidden="true" />
              Copy
            </button>
          </div>
          {v.hook ? <p className="mb-1 font-display text-[15.5px] font-semibold text-ink">{v.hook}</p> : null}
          {v.primary ? <p className="mb-1.5 whitespace-pre-line text-[13.5px] text-ink-2">{v.primary}</p> : null}
          <dl className="grid gap-0.5 text-[13px] text-ink-2">
            {(
              [
                ['Headline', v.headline],
                ['CTA', v.cta],
                ['Image', v.image],
                ['Pattern used', v.pattern],
              ] as const
            )
              .filter(([, x]) => x)
              .map(([k, x]) => (
                <div key={k}>
                  <dt className="inline font-semibold text-ink">{k}: </dt>
                  <dd className="inline">{x}</dd>
                </div>
              ))}
          </dl>
        </div>
      ))}
      {notes ? (
        <p className="text-[13.5px] text-ink-2">
          <b className="text-ink">How the guidelines shaped it:</b> {notes}
        </p>
      ) : null}
    </div>
  )
}
