import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { ListSkeleton } from '@/components/catalyst/skeletons'
import { PageHeader, pageMetadata } from '@/components/moving-page'
import { RunsView } from '@/components/pipeline/runs-view'
import { getCurrentUser } from '@/lib/auth'
import { pageBySlug } from '@/lib/nav'
import { loadRuns } from '@/lib/pipeline/runs-load'

export const metadata = pageMetadata('runs')

/** Runs & uploads: /runs, the tab in ?tab= (all when there is none). */
export default function Page() {
  return (
    <>
      <PageHeader page={pageBySlug('runs')} sub="Your custom runs and uploaded ads, and what was built from them." />
      <Suspense fallback={<ListSkeleton label="Loading Runs & uploads…" />}>
        <Runs />
      </Suspense>
    </>
  )
}

async function Runs() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fruns')
  return <RunsView data={await loadRuns()} />
}
