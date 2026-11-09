import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader, pageMetadata } from '@/components/moving-page'
import { LeadView } from '@/components/catalyst/lead-view'
import { ErrorNotice } from '@/components/catalyst/bits'
import { LeadSkeleton } from '@/components/catalyst/skeletons'
import { getCurrentUser } from '@/lib/auth'
import { loadLeadPage } from '@/lib/catalyst/lead-page'
import { pageBySlug } from '@/lib/nav'

export const metadata = pageMetadata('lead-pipeline')

/** A lead's page: /lead-pipeline/<name>-<code>, from a card, a list row or the Overview. */
export default function Page({ params }: PageProps<'/lead-pipeline/[lead]'>) {
  return (
    <Suspense fallback={<LeadSkeleton />}>
      <Lead params={params} />
    </Suspense>
  )
}

async function Lead({ params }: { params: PageProps<'/lead-pipeline/[lead]'>['params'] }) {
  const { lead } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=' + encodeURIComponent('/lead-pipeline/' + lead))
  const data = await loadLeadPage(decodeURIComponent(lead))
  if (!data.found) {
    return (
      <>
        <PageHeader page={pageBySlug('lead-pipeline')} eyebrow="Catalyst · Lead pipeline" title="Lead not found" />
        {data.error ? <ErrorNotice>{data.error}</ErrorNotice> : null}
        <section className="max-w-[640px] rounded-lg border border-line bg-panel p-6 shadow-card">
          <p className="text-[15px] leading-relaxed text-ink-2">
            This lead is not in Catalyst any more, or the link is not complete. Every prospect is on the lead pipeline.
          </p>
          <Link
            href="/lead-pipeline"
            className="mt-4 inline-flex rounded-sm bg-action px-4 py-2.5 text-[14.5px] font-semibold text-action-ink hover:bg-action-hover"
          >
            Open the lead pipeline
          </Link>
        </section>
      </>
    )
  }
  return <LeadView key={data.lead.id} data={data} />
}
