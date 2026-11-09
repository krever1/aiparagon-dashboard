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
  every current page address. A page not ported yet opens a card that links to it in the current dashboard.
- Catalyst, in four parts (agreed with Kser Nov 9): 1. reading (the Overview, the Lead pipeline board and list, a lead's
  page); 2. acting (moving cards, the run question, stage runs through n8n, run tracking, New run); 3. HubSpot contacts
  and Calls, with a lead's Calls tab; 4. the client proposal (view, edit, print, write), the meeting prep charts, What
  should change?, file uploads. `dev` goes to `main` once parts 1 and 2 are in, so production never has a board that
  cannot run anything.
- Part 1 (Nov 9, branch `catalyst/pipeline-read`): see Catalyst below. The cards' Run buttons and the prep tabs' Run
  are shown but off ("Runs move to this dashboard in the next update") until part 2.
- Next: Catalyst parts 2 to 4, then Touchpoint, Pipeline, Atlas, Canvas, Settings. Then the cutover.
- Live (Nov 9, PR #1): production at aiparagon-dashboard.vercel.app, Vercel's own domain for now (Kser's call; a
  custom domain can come later). Vercel project aiparagon-dashboard in Kaeser's projects, framework Next.js, the two
  Supabase values set for Production, Preview and Development. Production builds from `main`; `dev` deploys to
  aiparagon-dashboard-git-dev-kaesers-projects.vercel.app.
- Access: Standard Protection, as on the aiparagon project. Previews and per-deployment URLs need a Vercel login; the
  production domain aiparagon-dashboard.vercel.app is open, guarded by the app's own sign-in.
- Not set up yet: branch protection on `main`.

| Product | Pages | Status |
|---|---|---|
| Touchpoint | Today, Approvals, Tasks | current dashboard |
| Catalyst | Overview, Lead pipeline (board, list, a lead's page) | here (reading; runs in part 2) |
| Catalyst | HubSpot contacts, Calls | current dashboard |
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
- Vercel: production from `main` (aiparagon-dashboard.vercel.app), a preview link for every other branch.
- CI (`.github/workflows/ci.yml`): lint, type check and the browser tests on every pull request and every push to
  `dev` and `main`.

## Environment
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_LEGACY_DASHBOARD_URL`,
`NEXT_PUBLIC_TEAM_EMAIL_DOMAIN`, and the server-only `N8N_WEBHOOK_URL` (see `.env.example`). Set in Vercel; locally in
`.env.local`. NEXT_PUBLIC_ values are built into the page, so nothing secret goes in them. Server-only settings get
names without the prefix and are read only in server code. The n8n calls need no secret of their own: they carry the
signed-in teammate's token, as the current dashboard's do.
- The two Supabase values are required. Without them (a new deployment before its variables are set) the proxy sends
  every page to sign-in, which says the settings are missing; creating a Supabase client without them throws, which
  would fail every request. The other two default to the current dashboard's address and aiparagonconsulting.com.
- `N8N_WEBHOOK_URL` is optional (default https://n8n.aiparagonconsulting.com/webhook) and read at run time, in server
  code only; the tests point it at the stand-in.
- NEXT_PUBLIC_ values are read at build time: after changing one in Vercel, redeploy.

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
- `PORTED` and `HEADINGS` in `src/lib/nav.ts`: the pages that have moved here (the shell test expects the "Still in
  the current dashboard" card on every other page) and a page's h1 when it is not its title.
- `src/lib/n8n.ts` `callN8n()`: a POST to an n8n webhook from server code, with the signed-in teammate's access token as
  `auth`; errors in the current dashboard's words (a 404 says which workflow to switch on).
- `src/components/ui`: dates in the viewer's own time zone (`LocalDay`, `LocalDate`, `LocalDateTime`: UTC while the
  server renders, then the browser's zone, with no hydration mismatch), the toast, and the dialog (the browser's
  `<dialog>`).

## Catalyst
- `src/lib/catalyst/stages.ts`: the six meeting stages (V136_STAGES): key, name (the team's, from `ai_settings`
  `catalyst_stages`; only the name can change), short, doc, what, agent, link column, colour, from, role.
- `src/lib/catalyst/leads.ts`: leads worked out as the current dashboard does: `relink` (discovery and growth plan rows
  saved under the anonymizer's placeholder email go back to the lead of the same name), `synthesize` (a lead for
  documents with no e1_leads row), `mergeLeads` (rows of the same person, real rows first), `docOf` (a stage's
  document: the newest row of its agent, meeting prep by `data.stage`, else a link saved on the lead), `stageOf`
  (e1_leads.stage, else the furthest stage with a document), `docIds`, `docCount`.
- `src/lib/catalyst/load.ts` reads e1_leads, agent_outputs (no `content_md`) and the stage names as the teammate, fresh
  on every visit (the current dashboard kept its first read for the session), into `LeadView`s (`view.ts`).
  `lead-page.ts` adds one lead's documents with their text, its files (the agents' links, then uploads) and its HubSpot
  contact.
- A lead's address is `/lead-pipeline/<name>-<code>` (`lead-id.ts`): the code is 10 hex of a SHA-256 of an email, so
  emails stay out of addresses and any of the lead's emails finds it. The board's "✓ … ready" opens `?tab=<stage>`.
- Every Catalyst view keeps its tab in the address (`?tab=`), read with `useSearchParams` and changed with
  `history.replaceState`, so a link opens the same view and the sidebar's link goes back to the first one.
- Read here (`doc-reader.tsx`, `doc-format.ts`): the saved text (`content_md`), else the Google Doc through Dashboard ·
  Doc Reader (`readDocument`, a Server Action), else the PDF in Drive when the Doc is empty; Structured (title, key
  facts, a part per heading; JSON documents as cards) or Full text, remembered in this browser. Markdown goes through
  react-markdown with raw HTML left out and unsafe links as plain text (the current dashboard passed raw HTML through).
- Rename stages (`saveStageNames`): reads the row fresh, merges, stores '' for a usual name and `by`/`at` per stage.
- Changed on purpose from the current dashboard (reported to Kser): the list's rows open the lead's page (its v60 side
  panel saved a column e1_leads does not have); the Overview's Recent leads and Documents count the six stages, not the
  older five documents; a lead opens on the tab of its stage; the Documents tile counts documents, not PDF links; the
  list says 0 shown, not 1, when nothing matches.

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
- `tests/e2e`: Playwright against a production build. `tests/stub/supabase.mjs` stands in for Supabase (sign-in, and
  the data API over in-memory tables in `rest.mjs`, which answers only a signed-in session) and for n8n (`/webhook/*`,
  each checking the body's `auth`; Doc Reader answers from `docs()` in `fixtures.mjs`, and `/__hook` gives any webhook a
  canned answer), with made-up accounts (qa.teammate@aiparagonconsulting.com, outsider@example.org) and made-up leads
  at example.com (`fixtures.mjs` says where each one sits), so the tests never touch the real project.
  `npm run test:e2e` builds with the stand-in's address (NEXT_PUBLIC_ values are built in).
- `catalyst-logic.spec.ts` checks the lead rules without a browser; `catalyst.spec.ts` the pages. Helpers in
  `helpers.ts`: `stubCalls`, `stubRows`, `stubSeed`, `stubHook`.
- Playwright is pinned to 1.56.1: cloud sessions have its Chromium preinstalled. CI runs on `ubuntu-24.04`, since
  `ubuntu-latest` is 26.04, where Playwright 1.56 cannot install Chromium. A newer Playwright would fix that but
  no longer match the sessions' Chromium (launch it with `executablePath: '/opt/pw-browsers/chromium'` then).

## Gotchas
- With Cache Components, reading `cookies()` outside `<Suspense>` fails the build, `dynamicParams` is not supported,
  and `generateStaticParams` must return at least one param.
- A dynamic route (`/lead-pipeline/[lead]`) prerenders a shell without knowing its address, so `usePathname()` or
  `useSearchParams()` outside `<Suspense>` fails the build. The shell's sidebar and top bar read the address inside
  `<Suspense>` (`app-shell.tsx`); the sidebar's fallback has nothing open.
- An absolutely placed element (Tailwind's `sr-only`) inside a sideways-scrolling box escapes it, and the whole page
  scrolls sideways on a phone, unless the box is `relative`.
- Chromium reads a `<th>` as a plain cell unless it has `scope="col"`; tests find column headers by role.
- A Supabase session check reads the clock (token expiry). Call `connection()` before it, as `getCurrentUser()` does,
  or prerendering logs "encountered the unstable value Date.now()".
- Next.js adds a hidden `role="alert"` route announcer to every page: in tests, scope alert checks (for example to the
  form).
- Sign out ends this browser's session only; the current dashboard keeps its own session.
- Password reset links open the current dashboard (the project's Site URL), which sets the password for both apps.
  Creating an account stays in the current dashboard for now.
- The logo is on www.aiparagonconsulting.com, which cloud sessions cannot reach: the mark shows the P until it loads,
  and the tests serve a stand-in picture.
- The Vercel project was imported while `main` held only the README, so Vercel picked the framework Other and the
  first `dev` build failed after compiling ("No Output Directory named public"). It is set to Next.js now; keep it so.
- Twice on Nov 9 a push that changed `.github/workflows/ci.yml` started a CI run with no jobs (failed in under a
  minute); Re-run started it. Other pushes start CI normally.
