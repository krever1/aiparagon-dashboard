import Link from 'next/link'
import { BrandMark } from '@/components/brand-mark'

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-6">
      <div className="max-w-[440px] text-center">
        <div className="mb-4 flex justify-center">
          <BrandMark size={44} />
        </div>
        <h1 className="font-display text-[30px] font-semibold text-ink">This page does not exist</h1>
        <p className="mt-2 text-[15px] text-ink-2">The address may be mistyped, or the page has moved.</p>
        <Link href="/today" className="mt-5 inline-block rounded-sm bg-action px-4 py-2.5 text-[14.5px] font-semibold text-action-ink hover:bg-action-hover">
          Go to Today
        </Link>
      </div>
    </main>
  )
}
