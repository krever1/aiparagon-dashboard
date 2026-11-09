'use client'

import { useState } from 'react'
import { LOGO_URL } from '@/lib/config'

/** The AI Paragon mark: the logo from the company site once it loads, the P until then or if it cannot load. */
export function BrandMark({ size = 34, className = '' }: { size?: number; className?: string }) {
  const [logo, setLogo] = useState(false)
  return (
    <span
      className={'brand-mark grid shrink-0 place-items-center overflow-hidden rounded-[10px] bg-art text-art-gold ' + className + (logo ? ' has-logo' : '')}
      style={{ width: size, height: size }}
      data-testid="brand-mark"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- an external logo shown as is, with a fallback */}
      <img src={LOGO_URL} alt="" width={size} height={size} className="h-full w-full object-contain" onLoad={() => setLogo(true)} onError={() => setLogo(false)} />
      <span className="brand-p font-display font-semibold" style={{ fontSize: Math.round(size * 0.59) }} aria-hidden="true">
        P
      </span>
    </span>
  )
}
