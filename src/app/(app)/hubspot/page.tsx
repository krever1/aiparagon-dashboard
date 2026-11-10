import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { PageHeader, pageMetadata } from '@/components/moving-page'
import { HubspotView } from '@/components/catalyst/hubspot-view'
import { ListSkeleton } from '@/components/catalyst/skeletons'
import { getCurrentUser } from '@/lib/auth'
import { loadHubspot } from '@/lib/catalyst/hubspot'
import { pageBySlug } from '@/lib/nav'

export const metadata = pageMetadata('hubspot')

export default function Page() {
  return (
    <>
      <PageHeader page={pageBySlug('hubspot')} sub="Synced from HubSpot into the shared knowledge base every 6 hours." />
      <Suspense fallback={<ListSkeleton label="Loading contacts…" />}>
        <Contacts />
      </Suspense>
    </>
  )
}

async function Contacts() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fhubspot')
  return <HubspotView data={await loadHubspot()} />
}
