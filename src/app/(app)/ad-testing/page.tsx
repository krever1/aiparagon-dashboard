import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { ListSkeleton } from '@/components/catalyst/skeletons'
import { PageHeader, pageMetadata } from '@/components/moving-page'
import { TestingView } from '@/components/pipeline/testing-view'
import { getCurrentUser } from '@/lib/auth'
import { pageBySlug } from '@/lib/nav'
import { loadTesting } from '@/lib/pipeline/ad-testing-load'

export const metadata = pageMetadata('ad-testing')

/** Ad Testing: /ad-testing (the Strategy read), ?tab=results, ?tab=board, and ?log=1 opens Log a result once. */
export default function Page() {
  return (
    <>
      <PageHeader page={pageBySlug('ad-testing')} />
      <Suspense fallback={<ListSkeleton label="Loading Ad Testing…" />}>
        <Testing />
      </Suspense>
    </>
  )
}

async function Testing() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fad-testing')
  return <TestingView data={await loadTesting()} />
}
