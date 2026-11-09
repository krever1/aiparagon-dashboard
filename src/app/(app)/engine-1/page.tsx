import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { PageHeader, pageMetadata } from '@/components/moving-page'
import { NewRunButton } from '@/components/catalyst/new-run'
import { OverviewView } from '@/components/catalyst/overview-view'
import { PipelineSkeleton } from '@/components/catalyst/skeletons'
import { getCurrentUser } from '@/lib/auth'
import { loadPipeline } from '@/lib/catalyst/load'
import { HEADINGS, pageBySlug } from '@/lib/nav'

export const metadata = pageMetadata('engine-1')

export default function Page() {
  return (
    <>
      <PageHeader
        page={pageBySlug('engine-1')}
        title={HEADINGS['engine-1']}
        sub="Prep for every meeting, from the first research to the client review."
        actions={<NewRunButton />}
      />
      <Suspense fallback={<PipelineSkeleton label="Loading Catalyst…" />}>
        <Overview />
      </Suspense>
    </>
  )
}

async function Overview() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fengine-1')
  return <OverviewView data={await loadPipeline()} />
}
