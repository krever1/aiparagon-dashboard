# AI Paragon internal dashboard (Next.js)

Brief for Claude sessions in this repo. Last reviewed 2026-11-09.

## What this is
The AI Paragon Consulting Group team workspace: Touchpoint (home and tasks), Catalyst (clients and meetings),
Canvas (client deliverables), Pipeline (content and ads), Atlas (knowledge and files) and Settings. It is being
rebuilt here, in Next.js, from the single-file dashboard in krever1/aiparagon (`new-aiparagon-dashboard.html`, live at
aiparagon.vercel.app/dashboard). Both apps use the same Supabase project and n8n workflows, so they run side by side
until every page has moved; then aiparagon.vercel.app/dashboard forwards here.

One repo per project (Kser, Nov 9): this repo is the internal dashboard only. The other projects (care portal, voice
agent Command Center, Advisory demo, website builder) stay in krever1/aiparagon until they get their own repos.

## Where it stands (as of 2026-11-09)
- Phase 1 (Nov 9, on `dev`): sign-in (Supabase Auth, team accounts only), the sidebar by product, the top bar, and
  every current page address. No page is ported yet: each opens a card that links to it in the current dashboard.
- Next, in this order: Catalyst (Lead pipeline board, a lead's page, stage runs, HubSpot contacts, Calls), then
  Touchpoint, Pipeline, Atlas, Canvas, Settings. Then the cutover.
- Not set up yet: the Vercel project, its environment variables, a domain, branch protection on `main`.

| Product | Pages | Status |
|---|---|---|
| Touchpoint | Today, Approvals, Tasks | current dashboard |
| Catalyst | Overview, Lead pipeline, HubSpot contacts, Calls | current dashboard |
| Canvas | Deliverables | current dashboard |
| Pipeline | Overview, Intel Tracker, Ad Strategist, Market Intelligence Briefs, Content Transformation, Marketing Generation, Landing pages, Ad Testing, Runs & uploads | current dashboard |
| Atlas | Knowledge base, Files, Company profile, Templates | current dashboard |
| Settings and account | Integrations, AI settings, Audit log, Your account | current dashboard |

## Working with Kser
- Kser (Kaeser Valencerina) builds everything. Erica Dresslar is founder/CEO; she demos to prospects and gives
  feedback by Loom, Slack and call transcripts.
- Casual, direct, short replies. No em dashes, no AI buzzwords, no made-up metrics.
- Targeted fixes, not long discussion. For a big feedback batch, confirm understanding before building.
- Write and run tests (including regression ones) before saying something is done.
- "Quick changelog" = short list by category, no mention of Loom or feedback.
- Keep secrets out of commits and this file, even though the repo is private.

## Stack and commands
Next.js 16.4 (App Router, Cache Components and Partial Prefetching on, Turbopack), React 19, TypeScript,
Tailwind CSS 4, Supabase (`@supabase/ssr`), Lucide icons, Playwright 1.56.1.

`npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm run test:e2e`

Read AGENTS.md first: Next.js 16 differs from older versions (middleware is now `proxy.ts`, Cache Components change how
cookies and dynamic routes work). The matching docs are in `node_modules/next/dist/docs/`.

## Branches and releases
- `main`: production, what the team uses. Changes arrive only by pull request from `dev`.
- `dev`: staging. Each change gets its own branch and a pull request into `dev`.
- Vercel (once set up): production from `main`, a preview link for every other branch.
- CI (`.github/workflows/ci.yml`): lint, type check and the browser tests on every pull request and every push to
  `dev` and `main`.

## Environment
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_LEGACY_DASHBOARD_URL`,
`NEXT_PUBLIC_TEAM_EMAIL_DOMAIN` (see `.env.example`). Set in Vercel; locally in `.env.local`. NEXT_PUBLIC_ values are
built into the page, so nothing secret goes in them. Server-only secrets (n8n, when pages call it) get names without
the prefix and are read only in server code.

## How it is put together
- `src/lib/nav.ts`: every page (address, sidebar label, heading, icon, product, and its address word in the current
  dashboard), grouped as the sidebar shows them. The sidebar, the top bar and the tests read it. A new page needs a
  line here and its own `src/app/(app)/<address>/page.tsx`.
- `src/app/(app)/<address>/page.tsx`: one per page. An unported page renders `<MovingPage>`; porting replaces that.
- `src/proxy.ts` and `src/lib/supabase/proxy.ts`: before every page, refresh the Supabase session cookies, send anyone
  signed out to `/login?next=<page>`, and sign out a session that is not an @aiparagonconsulting.com account (the
  Supabase project also holds care portal and voice agent accounts).
- `src/lib/auth.ts` `getCurrentUser()`: the signed-in teammate, checked with Supabase Auth. Call it in every Server
  Component, Server Action and Route Handler that reads or writes data. The proxy is the first check, not the only one.
- `src/lib/supabase/server.ts` `createClient()`: Supabase as the signed-in person, so the database's row rules apply.
  Never use a service key in this app.
- `src/app/login`: email and password sign-in and Forgot your password, in the current dashboard's words.
  `src/app/auth/signout`: signs this browser out.
- `src/components/shell`: the sidebar (one product open at a time; the page's product opens on arrival), the top bar
  (product, then page) and the user card. Below 900px wide the sidebar is a drawer.
- Styling: Tailwind with the current dashboard's tokens in `src/app/globals.css` (`@theme`: colors, Newsreader for
  headings, Instrument Sans for text, IBM Plex Mono). Use the theme names (`bg-panel`, `text-ink-2`, `bg-action`,
  `text-accent-text`, `rounded-lg`, `shadow-card`), not raw hex.
- `next.config.ts` redirects: `/` and `/home` to Today, a product's name to its first page, and
  `/dashboard/<page>` (an address copied from the current dashboard) to the same page here.

## Porting a page
1. Read the page in the current dashboard's file. The "Finding things in the file" index in krever1/aiparagon's
   CLAUDE.md (section 1) names its functions; its "Where it stands" notes say what each round changed and why.
2. Read data on the server with `getCurrentUser()` and `createClient()`. Anything that reads the session sits inside
   `<Suspense>` (a build error otherwise, with Cache Components).
3. n8n is called only from server code (Route Handlers or Server Actions), never from the browser. Every dashboard
   webhook checks the caller: send the user's Supabase access token as `auth` in the JSON body, as the current
   dashboard does.
4. Keep the same words and behavior as the current page unless Kser asks for a change.
5. Add a Playwright spec for the page, with stand-ins for Supabase and n8n. Update the status table above.

## Shared services
- Supabase project lesyptuwllcgajdxzjje, shared with the care portal (np_*) and the voice agent (vc_*). This
  dashboard's tables (e1_leads, agent_outputs, ai_settings, catalyst_sources, landing_pages and the rest) are listed in
  krever1/aiparagon CLAUDE.md, section 1.
- n8n at n8n.aiparagonconsulting.com runs every AI agent and sync. The workflows, their IDs, webhooks and what each
  writes are in krever1/aiparagon CLAUDE.md, section 1 (n8n workflows). That file stays the reference for the backend
  until those notes move here.

## Tests
- `tests/e2e`: Playwright against a production build. `tests/stub/supabase-auth.mjs` stands in for Supabase Auth with
  made-up accounts (qa.teammate@aiparagonconsulting.com, outsider@example.org), so the tests never touch the real
  project. `npm run test:e2e` builds with the stand-in's address (NEXT_PUBLIC_ values are built in).
- Playwright is pinned to 1.56.1: cloud sessions have its Chromium preinstalled. CI runs on `ubuntu-24.04`, since
  `ubuntu-latest` is 26.04, where Playwright 1.56 cannot install Chromium. A newer Playwright would fix that but
  no longer match the sessions' Chromium (launch it with `executablePath: '/opt/pw-browsers/chromium'` then).

## Gotchas
- With Cache Components, reading `cookies()` outside `<Suspense>` fails the build, `dynamicParams` is not supported,
  and `generateStaticParams` must return at least one param.
- A Supabase session check reads the clock (token expiry). Call `connection()` before it, as `getCurrentUser()` does,
  or prerendering logs "encountered the unstable value Date.now()".
- Next.js adds a hidden `role="alert"` route announcer to every page: in tests, scope alert checks (for example to the
  form).
- Sign out ends this browser's session only; the current dashboard keeps its own session.
- Password reset links open the current dashboard (the project's Site URL), which sets the password for both apps.
  Creating an account stays in the current dashboard for now.
- The logo is on www.aiparagonconsulting.com, which cloud sessions cannot reach: the mark shows the P until it loads,
  and the tests serve a stand-in picture.
