import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { PageHeader, pageMetadata } from '@/components/moving-page'
import { CallsView } from '@/components/calls/calls-view'
import { ListSkeleton } from '@/components/catalyst/skeletons'
import { getCurrentUser } from '@/lib/auth'
import { loadCalls } from '@/lib/catalyst/calls-load'
import { pageBySlug } from '@/lib/nav'

export const metadata = pageMetadata('calls')

export default function Page() {
  return (
    <>
      <PageHeader page={pageBySlug('calls')} sub="Your Fathom recordings, ready to watch or turn into a draft." />
      <Suspense fallback={<ListSkeleton label="Loading calls…" />}>
        <Calls />
      </Suspense>
    </>
  )
}

async function Calls() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fcalls')
  return <CallsView data={await loadCalls()} />
}
