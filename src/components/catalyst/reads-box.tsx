'use client'

import type { ReadsResult } from '@/app/(app)/lead-pipeline/actions'
import { LocalUsDay } from '@/components/ui/local-date'

/** What a run reads (v137ReadsHtml): the template, the calls, the emails, the CRM record; while it is checked, says so. */
export function ReadsBox({ reads }: { reads: ReadsResult | null }) {
  return (
    <div className="mt-3 rounded-md border border-line bg-sunk/60 p-3.5" data-testid="reads">
      <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">Reads</p>
      {!reads ? (
        <p role="status" className="text-[13.5px] text-ink-3">
          … Checking for call transcripts and emails…
        </p>
      ) : reads.ok ? (
        <ul className="space-y-1">
          {reads.rows.map((r, i) => (
            <li key={i} data-ok={r.ok ? 'yes' : 'no'} className={`flex gap-2 text-[13.5px] leading-snug ${r.ok ? 'text-ink' : 'text-ink-3'}`}>
              <span aria-hidden="true" className="w-3 shrink-0">
                {r.ok ? '✓' : '–'}
              </span>{' '}
              <span>
                {r.text}
                {r.date ? <LocalUsDay iso={r.date} /> : null}
                {r.after ?? ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13.5px] text-ink-3">Could not check what it reads.{reads.error ? ' ' + reads.error : ''}</p>
      )}
    </div>
  )
}
