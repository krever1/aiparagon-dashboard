'use client'

import { type ReactNode, Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Menu, X } from 'lucide-react'
import { Icon } from '@/components/icon'
import { Toaster } from '@/components/ui/toast'
import { pageForPath, productOf } from '@/lib/nav'
import { previousPlace, recordPlace, subscribePlaces, takeBack } from './back-store'
import { Sidebar } from './sidebar'

/**
 * The frame every signed-in page sits in: the sidebar (a drawer on a phone) and the top bar, which says where you
 * are (product, then page). Both read the address inside <Suspense>: a page whose address is only known at request
 * time (a lead's page) still gets a static shell, with the sidebar closed until the address is known. Every other
 * page's address is known when it is built, so it never shows the fallback.
 */
export function AppShell({ userCard, children }: { userCard: ReactNode; children: ReactNode }) {
  const [drawer, setDrawer] = useState(false)

  const sidebar = (onNavigate?: () => void) => (
    <Suspense fallback={<Sidebar userCard={userCard} pathname={null} onNavigate={onNavigate} />}>
      <RoutedSidebar userCard={userCard} onNavigate={onNavigate} />
    </Suspense>
  )

  return (
    <div className="min-h-screen min-[900px]:grid min-[900px]:grid-cols-[252px_minmax(0,1fr)]">
      {/* sidebar: in the page from 900px, a drawer below */}
      <div className="sticky top-0 hidden h-screen border-r border-line min-[900px]:block">{sidebar()}</div>
      {drawer ? (
        <div className="fixed inset-0 z-40 min-[900px]:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close the menu" className="absolute inset-0 bg-[rgba(14,18,34,.36)]" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] border-r border-line shadow-pop">
            {sidebar(() => setDrawer(false))}
            <button
              type="button"
              aria-label="Close the menu"
              onClick={() => setDrawer(false)}
              className="absolute right-2 top-3 grid h-9 w-9 place-items-center rounded-sm text-ink-2 hover:bg-sunk"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            aria-label="Open the menu"
            onClick={() => setDrawer(true)}
            className="grid h-9 w-9 place-items-center rounded-sm text-ink-2 hover:bg-panel min-[900px]:hidden"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          {/* Back reads the search too, so it has a boundary of its own: the breadcrumb stays in the static shell */}
          <Suspense fallback={null}>
            <Back />
          </Suspense>
          <Suspense fallback={null}>
            <Crumb />
          </Suspense>
        </header>
        <main id="main" className="w-full max-w-[1280px] px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </main>
        <Toaster />
      </div>
    </div>
  )
}

function RoutedSidebar({ userCard, onNavigate }: { userCard: ReactNode; onNavigate?: () => void }) {
  return <Sidebar userCard={userCard} pathname={usePathname()} onNavigate={onNavigate} />
}

/** The top bar's "Catalyst › Lead pipeline". */
function Crumb() {
  const page = pageForPath(usePathname())
  if (!page) return null
  const product = productOf(page.product)
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[14px]">
      <Icon name={product.icon} size={17} className="shrink-0 text-accent" />
      <span className="hidden text-ink-2 sm:inline">{product.name}</span>
      <ChevronRight size={14} aria-hidden="true" className="hidden shrink-0 text-ink-3 sm:inline" />
      <span className="truncate font-semibold text-ink" aria-current="page">
        {page.label}
      </span>
    </nav>
  )
}

/** A lead's own page (/lead-pipeline/<lead>): it names itself by the lead's name once it shows. */
const LEAD_PAGE = /^\/lead-pipeline\/[^/]+\/?$/

/**
 * Back (v143): the page before this one in this browser tab, a lead's own page included. It records where each page
 * settles (a page kept alive by Next comes back without mounting again, so the address is what counts), and going
 * back takes the place off the list first, so arriving there adds nothing. Hidden on the first page; on a phone only
 * the arrow shows.
 */
function Back() {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const router = useRouter()
  useEffect(() => {
    const name = LEAD_PAGE.test(pathname) ? 'the lead' : (pageForPath(pathname)?.title ?? 'the last page')
    recordPlace(pathname, pathname + (search ? '?' + search : ''), name)
  }, [pathname, search])
  const prev = useSyncExternalStore(subscribePlaces, previousPlace, () => null)
  if (!prev) return null
  const label = 'Back to ' + (prev.name || 'the last page')
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      data-testid="back"
      onClick={() => {
        const to = takeBack()
        if (to) router.push(to.href)
      }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-[9px] border border-line bg-panel py-1.5 pl-2 pr-2 text-[13px] font-semibold text-ink-2 hover:border-accent hover:text-ink sm:pr-3"
    >
      <ChevronLeft size={15} strokeWidth={2} aria-hidden="true" />
      <span className="hidden sm:inline">Back</span>
    </button>
  )
}
