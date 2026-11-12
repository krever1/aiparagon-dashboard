import { Suspense } from 'react'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LandingPreview, PreviewGone } from '@/components/pipeline/landing-preview'
import { getCurrentUser } from '@/lib/auth'
import { loadPreview } from '@/lib/pipeline/landing-load'

/** The tab's title as the public page sets it: the page's headline, then the brand. */
export async function generateMetadata({ params }: PageProps<'/preview/landing/[id]'>): Promise<Metadata> {
  const { id } = await params
  if (!(await getCurrentUser())) return { title: 'Preview' }
  const { page, brand } = await loadPreview(decodeURIComponent(id))
  return { title: { absolute: page ? (page.content.headline || page.title || brand) + ' · ' + brand : 'Not available · ' + brand } }
}

/** A landing page's preview, drawn from its saved row: /preview/landing/<page id>, from the editor's Preview. */
export default function Page({ params }: PageProps<'/preview/landing/[id]'>) {
  return (
    <Suspense
      fallback={
        <div className="lp">
          <div className="lp-loading">Loading…</div>
        </div>
      }
    >
      <Preview params={params} />
    </Suspense>
  )
}

async function Preview({ params }: { params: PageProps<'/preview/landing/[id]'>['params'] }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=' + encodeURIComponent('/preview/landing/' + id))
  const data = await loadPreview(decodeURIComponent(id))
  return data.page ? <LandingPreview page={data.page} brand={data.brand} /> : <PreviewGone brand={data.brand} error={data.error} />
}
