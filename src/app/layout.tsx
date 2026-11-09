import type { Metadata } from 'next'
import { IBM_Plex_Mono, Instrument_Sans, Newsreader } from 'next/font/google'
import { LOGO_URL } from '@/lib/config'
import './globals.css'

const newsreader = Newsreader({
  variable: '--font-newsreader',
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['opsz'],
})

const instrumentSans = Instrument_Sans({
  variable: '--font-instrument-sans',
  subsets: ['latin'],
  style: ['normal', 'italic'],
})

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

export const metadata: Metadata = {
  title: { default: 'AI Paragon', template: '%s · AI Paragon' },
  description: 'AI Paragon Consulting Group · Team workspace',
  // the AI Paragon logo, as on every app (it stays on the company site)
  icons: { icon: LOGO_URL, apple: LOGO_URL },
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${newsreader.variable} ${instrumentSans.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  )
}
