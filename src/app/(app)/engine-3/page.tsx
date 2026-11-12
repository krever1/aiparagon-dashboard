import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { ListSkeleton } from '@/components/catalyst/skeletons'
import { pageMetadata } from '@/components/moving-page'
import { OverviewView } from '@/components/pipeline/overview-view'
import { getCurrentUser } from '@/lib/auth'
import { loadOverview } from '@/lib/pipeline/overview-load'

export const metadata = pageMetadata('engine-3')

export default function Page() {
  return (
    <Suspense fallback={<ListSkeleton label="Loading the Pipeline overview…" />}>
      <Overview />
    </Suspense>
  )
}

async function Overview() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fengine-3')
  const data = await loadOverview()
  return <OverviewView data={data} name={user.name} />
}
