import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { ListSkeleton } from '@/components/catalyst/skeletons'
import { PageHeader, pageMetadata } from '@/components/moving-page'
import { LandingView } from '@/components/pipeline/landing-view'
import { getCurrentUser } from '@/lib/auth'
import { pageBySlug } from '@/lib/nav'
import { loadLanding } from '@/lib/pipeline/landing-load'

export const metadata = pageMetadata('landing-pages')

/** Landing pages: /landing-pages, the sign-ups at ?tab=signups, and ?new=1 opens the picker once. */
export default function Page() {
  return (
    <>
      <PageHeader page={pageBySlug('landing-pages')} />
      <Suspense fallback={<ListSkeleton label="Loading pages…" />}>
        <Landing />
      </Suspense>
    </>
  )
}

async function Landing() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Flanding-pages')
  return <LandingView data={await loadLanding()} />
}
