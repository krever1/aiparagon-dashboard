import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { ListSkeleton } from '@/components/catalyst/skeletons'
import { PageHeader, pageMetadata } from '@/components/moving-page'
import { ContentView } from '@/components/pipeline/content-view'
import { getCurrentUser } from '@/lib/auth'
import { pageBySlug } from '@/lib/nav'
import { loadContent } from '@/lib/pipeline/content-load'

export const metadata = pageMetadata('content-transformation')

/** Content Transformation: /content-transformation (New draft), ?tab=drafts (with ?draft=<id>), ?tab=ideas. */
export default function Page() {
  return (
    <>
      <PageHeader page={pageBySlug('content-transformation')} />
      <Suspense fallback={<ListSkeleton label="Loading Content Transformation…" />}>
        <Content />
      </Suspense>
    </>
  )
}

async function Content() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fcontent-transformation')
  return <ContentView data={await loadContent()} />
}
