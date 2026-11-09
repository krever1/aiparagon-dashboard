import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { SUPABASE_ANON_KEY, SUPABASE_URL, isTeamEmail, supabaseConfigured } from '@/lib/config'
import { safeNext } from '@/lib/nav'

const PUBLIC_PATHS = ['/login']

function isPublic(pathname: string) {
  return PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/auth/')
}

/** A redirect that keeps the cookies (and the no-cache headers) the session refresh put on `from`. */
function redirectFrom(from: NextResponse, url: URL) {
  const to = NextResponse.redirect(url)
  from.cookies.getAll().forEach((c) => to.cookies.set(c))
  const cc = from.headers.get('cache-control')
  if (cc) to.headers.set('cache-control', cc)
  return to
}

/**
 * Runs before every page: refreshes the Supabase session cookies, sends anyone signed out to the sign-in page (and
 * back to the page they asked for afterwards), and turns away a session that is not an AI Paragon account (the
 * Supabase project is shared with the care portal and the voice agent, whose users have accounts there too).
 * This is the first check, not the only one: data reads check the user again (see src/lib/auth.ts).
 */
export async function updateSession(request: NextRequest) {
  // Without the Supabase settings there is no session to check, and creating the client would throw on every request.
  // The sign-in page opens and says what is missing; every other page is sent there.
  if (!supabaseConfigured()) {
    const { pathname, search } = request.nextUrl
    if (isPublic(pathname)) return NextResponse.next({ request })
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('next', pathname + search)
    return NextResponse.redirect(url)
  }

  let response = NextResponse.next({ request })
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value))
      },
    },
  })

  // getUser() asks Supabase Auth whether the session is still good (getSession() would trust the cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { pathname, search } = request.nextUrl

  if (!user) {
    if (isPublic(pathname)) return response
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('next', pathname + search)
    return redirectFrom(response, url)
  }

  if (!isTeamEmail(user.email)) {
    await supabase.auth.signOut({ scope: 'local' })
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = '?denied=1'
    return redirectFrom(response, url)
  }

  if (pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = safeNext(request.nextUrl.searchParams.get('next'))
    url.search = ''
    return redirectFrom(response, url)
  }

  return response
}
