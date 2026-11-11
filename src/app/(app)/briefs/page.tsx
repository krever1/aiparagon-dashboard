import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { ListSkeleton } from '@/components/catalyst/skeletons'
import { PageHeader, pageMetadata } from '@/components/moving-page'
import { BriefsView } from '@/components/pipeline/briefs-view'
import { getCurrentUser } from '@/lib/auth'
import { pageBySlug } from '@/lib/nav'
import { tabOf } from '@/lib/pipeline/briefs'
import { loadBriefs } from '@/lib/pipeline/briefs-load'

export const metadata = pageMetadata('briefs')

/** The Market Intelligence Briefs: /briefs, the tab in ?tab= (organic when none), the brief in ?run= (the newest when none). */
export default function Page({ searchParams }: PageProps<'/briefs'>) {
  return (
    <>
      <PageHeader page={pageBySlug('briefs')} />
      <Suspense fallback={<ListSkeleton label="Loading the briefs…" />}>
        <Briefs searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Briefs({ searchParams }: { searchParams: PageProps<'/briefs'>['searchParams'] }) {
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fbriefs')
  const tab = tabOf(typeof sp.tab === 'string' ? sp.tab : null)
  const run = typeof sp.run === 'string' && /^[\w.:-]{1,120}$/.test(sp.run) ? sp.run : null
  const data = await loadBriefs(tab, run)
  // one view for every tab and brief: a brief being edited stays open while another tab is looked at (V111.ed)
  return <BriefsView data={data} />
}
