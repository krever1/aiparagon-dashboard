import type { Metadata } from 'next'
import { ArrowUpRight } from 'lucide-react'
import { LEGACY_DASHBOARD_URL } from '@/lib/config'
import { type PageDef, legacyUrl, pageBySlug, productOf } from '@/lib/nav'

export function pageMetadata(slug: string): Metadata {
  return { title: pageBySlug(slug).title }
}

/**
 * A page's heading: its product (and what the product is for) above its name, as in the current dashboard, then a
 * line saying what the page is for and the page's main buttons on the right.
 */
export function PageHeader({
  page,
  eyebrow,
  title,
  sub,
  actions,
  children,
}: {
  page: PageDef
  /** the small line above the heading, when it is not the product's ("Catalyst · Lead pipeline" on a lead's page) */
  eyebrow?: string
  /** the heading, when it is not the page's title (the Catalyst overview is headed Overview) */
  title?: string
  sub?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  const product = productOf(page.product)
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-text">
          {eyebrow ?? `${product.name} · ${product.sub}`}
        </p>
        <h1 className="mt-1 break-words font-display text-[34px] font-semibold leading-tight text-ink sm:text-[38px]">{title ?? page.title}</h1>
        {sub ? <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{sub}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  )
}

/**
 * A page that has not moved to this app yet: its heading and a way to open it in the current dashboard, where it
 * still works as before. Porting a page replaces this in its page.tsx.
 */
export function MovingPage({ slug }: { slug: string }) {
  const page = pageBySlug(slug)
  return (
    <>
      <PageHeader page={page} />
      <section className="max-w-[640px] rounded-lg border border-line bg-panel p-6 shadow-card" data-testid="moving-page">
        <h2 className="font-display text-[22px] font-semibold text-ink">Still in the current dashboard</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          {page.label} is moving over to this new dashboard. Until it does, it works as before in the current one, which
          keeps its own sign-in.
        </p>
        <a
          href={legacyUrl(LEGACY_DASHBOARD_URL, page)}
          className="mt-5 inline-flex items-center gap-2 rounded-sm bg-action px-4 py-2.5 text-[14.5px] font-semibold text-action-ink transition-colors hover:bg-action-hover"
        >
          Open {page.label} in the current dashboard
          <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </section>
    </>
  )
}
