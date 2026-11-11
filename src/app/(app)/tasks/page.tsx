import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { ArrowUpRight } from 'lucide-react'
import { PageHeader, pageMetadata } from '@/components/moving-page'
import { ListSkeleton } from '@/components/catalyst/skeletons'
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
      {/* Asana connects with a personal token kept in the current dashboard's browser storage, so it stays there for now */}
      <section className="mt-5 max-w-[720px] rounded-lg border border-line bg-panel p-4 shadow-card sm:p-5" aria-labelledby="asana-h" data-testid="asana">
        <h2 id="asana-h" className="font-display text-[20px] font-semibold text-ink">
          Asana
        </h2>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">
          Your Asana tasks, and sending a call’s to-dos to Asana, are still in the current dashboard. Asana connects there with a personal token saved in that
          browser.
        </p>
        <a
          href={legacyUrl(LEGACY_DASHBOARD_URL, page)}
          className="mt-3 inline-flex items-center gap-2 rounded-sm border border-line px-3.5 py-2 text-[14px] font-semibold text-ink hover:border-line-2"
        >
          Open Asana in the current dashboard
          <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </section>
    </>
  )
}

async function Tasks() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Ftasks')
  return <TasksView data={await loadTasks()} />
}
