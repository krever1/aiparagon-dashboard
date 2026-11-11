import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { ApprovalsView } from '@/components/approvals/approvals-view'
import { ListSkeleton } from '@/components/catalyst/skeletons'
import { PageHeader, pageMetadata } from '@/components/moving-page'
import { getCurrentUser } from '@/lib/auth'
import { pageBySlug } from '@/lib/nav'
import { loadApprovals } from '@/lib/touchpoint/approvals-load'

export const metadata = pageMetadata('approvals')

export default function Page() {
  return (
    <>
      <PageHeader page={pageBySlug('approvals')} />
      <Suspense fallback={<ListSkeleton label="Loading what is waiting…" />}>
        <Approvals />
      </Suspense>
    </>
  )
}

async function Approvals() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fapprovals')
  return <ApprovalsView data={await loadApprovals()} />
}
