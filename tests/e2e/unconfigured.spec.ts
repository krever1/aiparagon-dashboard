/* eslint-disable @typescript-eslint/no-require-imports -- the app's modules must load after the settings are cleared */
import { expect, test } from '@playwright/test'

type Config = typeof import('../../src/lib/config')
type Proxy = typeof import('../../src/lib/supabase/proxy')
type Server = typeof import('next/server')

// A deployment without the Supabase settings (a new Vercel project before its environment variables are set) must not
// fail every request: the proxy lets the sign-in page and /auth/ through and sends every other page to sign-in, which
// says what is missing. The proxy runs here directly, in Node, with both settings empty. They are read when the module
// loads, so they are cleared first and the modules loaded with require (no other spec loads the app's modules; a
// dynamic import would not resolve next/server).
test('without the Supabase settings, every page goes to sign-in instead of failing', async () => {
  const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
  process.env.NEXT_PUBLIC_SUPABASE_URL = ''
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ''
  try {
    const { NextRequest } = require('next/server') as Server
    const { supabaseConfigured } = require('../../src/lib/config') as Config
    const { updateSession } = require('../../src/lib/supabase/proxy') as Proxy
    expect(supabaseConfigured()).toBe(false)

    const page = await updateSession(new NextRequest('http://localhost:3100/lead-pipeline?tab=new'))
    expect(page.status).toBe(307)
    expect(page.headers.get('location')).toBe('http://localhost:3100/login?next=%2Flead-pipeline%3Ftab%3Dnew')

    const home = await updateSession(new NextRequest('http://localhost:3100/today'))
    expect(home.headers.get('location')).toBe('http://localhost:3100/login?next=%2Ftoday')

    for (const path of ['/login', '/login?next=%2Ftoday', '/auth/signout']) {
      const res = await updateSession(new NextRequest('http://localhost:3100' + path))
      expect(res.headers.get('x-middleware-next'), path).toBe('1')
      expect(res.headers.get('location'), path).toBeNull()
    }
  } finally {
    // process.env turns undefined into the string "undefined", so a value that was not there is deleted.
    for (const [name, value] of [['NEXT_PUBLIC_SUPABASE_URL', saved.url], ['NEXT_PUBLIC_SUPABASE_ANON_KEY', saved.key]] as const) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})
