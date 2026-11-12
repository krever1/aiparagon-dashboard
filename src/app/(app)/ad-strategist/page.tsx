import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { ListSkeleton } from '@/components/catalyst/skeletons'
import { PageHeader, pageMetadata } from '@/components/moving-page'
import { AdsView } from '@/components/pipeline/ads-view'
import { getCurrentUser } from '@/lib/auth'
import { pageBySlug } from '@/lib/nav'
import { loadAds } from '@/lib/pipeline/ads-load'

export const metadata = pageMetadata('ad-strategist')

/** The Ad Strategist: /ad-strategist, the ads brief on the Takeaways tab in ?brief= (the newest when there is none). */
export default function Page({ searchParams }: PageProps<'/ad-strategist'>) {
  return (
    <>
      <PageHeader page={pageBySlug('ad-strategist')} sub="Competitor ads that keep running, the ads your team uploads, and the ads brief they feed." />
      <Suspense fallback={<ListSkeleton label="Loading the Ad Strategist…" />}>
        <Ads searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Ads({ searchParams }: { searchParams: PageProps<'/ad-strategist'>['searchParams'] }) {
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fad-strategist')
  const brief = typeof sp.brief === 'string' && /^[\w.:-]{1,120}$/.test(sp.brief) ? sp.brief : null
  const ad = typeof sp.ad === 'string' && /^[0-9a-f-]{36}$/i.test(sp.ad) ? sp.ad : null
  const data = await loadAds(brief, user.email, ad)
  return <AdsView key={data.take?.runId ?? ''} data={data} />
}
