import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { PageHeader, pageMetadata } from '@/components/moving-page'
import { ListSkeleton } from '@/components/catalyst/skeletons'
import { AsanaCard } from '@/components/tasks/asana-send'
import { TasksView } from '@/components/tasks/tasks-view'
import { getCurrentUser } from '@/lib/auth'
import { loadTasks } from '@/lib/catalyst/tasks-load'
import { LEGACY_DASHBOARD_URL } from '@/lib/config'
import { legacyUrl, pageBySlug } from '@/lib/nav'

export const metadata = pageMetadata('tasks')

export default function Page() {
  const page = pageBySlug('tasks')
  return (
    <>
      <PageHeader page={page} sub="Your post-call to-dos and Asana tasks." />
      <Suspense fallback={<ListSkeleton label="Loading your calls…" />}>
        <Tasks />
      </Suspense>
      <AsanaCard legacy={legacyUrl(LEGACY_DASHBOARD_URL, page)} />
    </>
  )
}

async function Tasks() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Ftasks')
  return <TasksView data={await loadTasks()} />
}
