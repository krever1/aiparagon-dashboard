import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { ListSkeleton } from '@/components/catalyst/skeletons'
import { PageHeader, pageMetadata } from '@/components/moving-page'
import { IntelView } from '@/components/pipeline/intel-view'
import { getCurrentUser } from '@/lib/auth'
import { pageBySlug } from '@/lib/nav'
import { loadIntel } from '@/lib/pipeline/intel-load'

export const metadata = pageMetadata('intel-tracker')

/** The Intel Tracker: /intel-tracker, the run on screen in ?run= (the newest with posts when there is none). */
export default function Page({ searchParams }: PageProps<'/intel-tracker'>) {
  return (
    <>
      <PageHeader page={pageBySlug('intel-tracker')} sub="Posts from the people, companies and topics you follow, and the replies drafted for you to approve." />
      <Suspense fallback={<ListSkeleton label="Loading the Intel Tracker…" />}>
        <Intel searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Intel({ searchParams }: { searchParams: PageProps<'/intel-tracker'>['searchParams'] }) {
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fintel-tracker')
  const run = typeof sp.run === 'string' && /^[\w.:-]{1,120}$/.test(sp.run) ? sp.run : null
  const data = await loadIntel(run)
  return <IntelView key={data.run} data={data} />
}
