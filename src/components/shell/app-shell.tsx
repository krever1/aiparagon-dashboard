'use client'

import { type ReactNode, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronRight, Menu, X } from 'lucide-react'
import { Icon } from '@/components/icon'
import { pageForPath, productOf } from '@/lib/nav'
import { Sidebar } from './sidebar'

/**
 * The frame every signed-in page sits in: the sidebar (a drawer on a phone) and the top bar, which says where you
 * are (product, then page).
 */
export function AppShell({ userCard, children }: { userCard: ReactNode; children: ReactNode }) {
  const [drawer, setDrawer] = useState(false)
  const pathname = usePathname()
  const page = pageForPath(pathname)
  const product = page ? productOf(page.product) : null

  return (
    <div className="min-h-screen min-[900px]:grid min-[900px]:grid-cols-[252px_minmax(0,1fr)]">
      {/* sidebar: in the page from 900px, a drawer below */}
      <div className="sticky top-0 hidden h-screen border-r border-line min-[900px]:block">
        <Sidebar userCard={userCard} />
      </div>
      {drawer ? (
        <div className="fixed inset-0 z-40 min-[900px]:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close the menu" className="absolute inset-0 bg-[rgba(14,18,34,.36)]" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] border-r border-line shadow-pop">
            <Sidebar userCard={userCard} onNavigate={() => setDrawer(false)} />
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
          {page && product ? (
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[14px]">
              <Icon name={product.icon} size={17} className="shrink-0 text-accent" />
              <span className="hidden text-ink-2 sm:inline">{product.name}</span>
              <ChevronRight size={14} aria-hidden="true" className="hidden shrink-0 text-ink-3 sm:inline" />
              <span className="truncate font-semibold text-ink" aria-current="page">
                {page.label}
              </span>
            </nav>
          ) : null}
        </header>
        <main id="main" className="w-full max-w-[1280px] px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
