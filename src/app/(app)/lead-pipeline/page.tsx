import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { PageHeader, pageMetadata } from '@/components/moving-page'
import { PipelineView } from '@/components/catalyst/pipeline-view'
import { PipelineSkeleton } from '@/components/catalyst/skeletons'
import { getCurrentUser } from '@/lib/auth'
import { loadPipeline } from '@/lib/catalyst/load'
import { pageBySlug } from '@/lib/nav'

export const metadata = pageMetadata('lead-pipeline')

export default function Page() {
  return (
    <>
      <PageHeader page={pageBySlug('lead-pipeline')} sub="Every prospect and client, by meeting stage, with the prep for each meeting." />
      <Suspense fallback={<PipelineSkeleton />}>
        <Pipeline />
      </Suspense>
    </>
  )
}

async function Pipeline() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Flead-pipeline')
  return <PipelineView data={await loadPipeline()} />
}
