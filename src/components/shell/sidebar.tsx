'use client'

import Link from 'next/link'
import { type ReactNode, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { BrandMark } from '@/components/brand-mark'
import { Icon } from '@/components/icon'
import { PRODUCTS, type ProductDef, type ProductKey, SETTINGS, pageForPath } from '@/lib/nav'

/**
 * The sidebar by product, as in the current dashboard: all five products stay on screen, the one you click opens its
 * pages, and the product of the page you are on opens when you get there. `pathname` is null while the address is not
 * known yet (the static shell of a page whose address is only known at request time): nothing is open then.
 */
export function Sidebar({
  userCard,
  pathname,
  onNavigate,
}: {
  userCard: ReactNode
  pathname: string | null
  onNavigate?: () => void
}) {
  const current = pathname === null ? null : pageForPath(pathname)
  const [openKey, setOpenKey] = useState<ProductKey | null>(pathname === null ? null : (current?.product ?? 'touchpoint'))
  const [seenPath, setSeenPath] = useState(pathname)
  if (pathname !== seenPath) {
    // a new page: open its product (state adjusted while rendering, not in an effect)
    setSeenPath(pathname)
    if (current && current.product !== 'account') setOpenKey(current.product)
  }

  const group = (p: ProductDef) => {
    const open = openKey === p.key
    const active = current?.product === p.key
    const listId = 'nav-' + p.key
    return (
      <div key={p.key} className="mb-0.5">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          data-product={p.key}
          onClick={() => setOpenKey(open ? null : p.key)}
          title={`${p.name}: ${p.sub}`}
          className={
            'flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-sunk ' +
            (active ? 'text-ink' : 'text-ink-2')
          }
        >
          <Icon name={p.icon} className={active ? 'text-accent' : 'text-ink-3'} />
          <span className="min-w-0 flex-1">
            <b className="block truncate text-[14.5px] font-semibold text-ink">{p.name}</b>
            <small className="block truncate text-[12px] text-ink-3">{p.sub}</small>
          </span>
          <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" className={'text-ink-3 transition-transform ' + (open ? 'rotate-180' : '')} />
        </button>
        <ul id={listId} role="list" aria-label={p.name} hidden={!open} className="mb-1 ml-[22px] border-l border-line pl-2.5">
          {p.pages.map((page) => {
            const here = current?.slug === page.slug
            return (
              <li key={page.slug}>
                <Link
                  href={'/' + page.slug}
                  aria-current={here ? 'page' : undefined}
                  onClick={onNavigate}
                  className={
                    'mt-0.5 flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[14px] transition-colors ' +
                    (here ? 'bg-accent-soft font-semibold text-ink' : 'text-ink-2 hover:bg-sunk hover:text-ink')
                  }
                >
                  <Icon name={page.icon} size={17} className={here ? 'text-accent-text' : 'text-ink-3'} />
                  <span className="truncate">{page.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-1.5 bg-panel px-3 pb-3 pt-4">
      <Link href="/today" onClick={onNavigate} className="mb-2 flex items-center gap-2.5 px-1.5 pb-2">
        <BrandMark />
        <b className="font-display text-[21px] font-semibold text-ink">AI Paragon</b>
      </Link>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {PRODUCTS.map(group)}
        <div className="mb-1 mt-4 px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Setup</div>
        {group(SETTINGS)}
      </div>
      {userCard}
    </nav>
  )
}
