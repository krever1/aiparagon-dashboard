import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { ListSkeleton } from '@/components/catalyst/skeletons'
import { pageMetadata } from '@/components/moving-page'
import { TodayView } from '@/components/today/today-view'
import { getCurrentUser } from '@/lib/auth'
import { loadToday } from '@/lib/touchpoint/today-load'

export const metadata = pageMetadata('today')

export default function Page() {
  return (
    <Suspense fallback={<ListSkeleton label="Loading your day…" />}>
      <Today />
    </Suspense>
  )
}

async function Today() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Ftoday')
  const data = await loadToday()
  return <TodayView data={data} name={user.name} />
}
