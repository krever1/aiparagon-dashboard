# AI Paragon internal dashboard (Next.js)

Brief for Claude sessions in this repo. Last reviewed 2026-11-10.

## What this is
The AI Paragon Consulting Group team workspace: Touchpoint (home and tasks), Catalyst (clients and meetings),
Canvas (client deliverables), Pipeline (content and ads), Atlas (knowledge and files) and Settings. It is being
rebuilt here, in Next.js, from the single-file dashboard in krever1/aiparagon (`new-aiparagon-dashboard.html`, live at
aiparagon.vercel.app/dashboard). Both apps use the same Supabase project and n8n workflows, so they run side by side
until every page has moved; then aiparagon.vercel.app/dashboard forwards here.

One repo per project (Kser, Nov 9): this repo is the internal dashboard only. The other projects (care portal, voice
agent Command Center, Advisory demo, website builder) stay in krever1/aiparagon until they get their own repos.

## Where it stands (as of 2026-11-10)
- Phase 1 (Nov 9, on `dev`): sign-in (Supabase Auth, team accounts only), the sidebar by product, the top bar, and
  every current page address. A page not ported yet opens a card that links to it in the current dashboard.
- Catalyst, in four parts (agreed with Kser Nov 9): 1. reading (the Overview, the Lead pipeline board and list, a lead's
  page); 2. acting (moving cards, the run question, stage runs through n8n, run tracking, New run); 3. HubSpot contacts
  and Calls, with a lead's Calls tab; 4. the client proposal (view, edit, print, write), the meeting prep charts, What
  should change?, file uploads. `dev` goes to `main` once parts 1 and 2 are in, so production never has a board that
  cannot run anything.
- Part 1 (Nov 9, branch `catalyst/pipeline-read`) and part 2 (Nov 9, branch `catalyst/pipeline-runs`, on top of part
  1): see Catalyst below. Merged into `dev` (PR #2) and released to production on Nov 10 (PR #3, `dev` into `main`).
- Part 3 (Nov 10, branch `catalyst/hubspot-calls`): HubSpot contacts, Calls and a lead's Calls tab. Merged into `dev`
  (PR #4) and released to production on Nov 10 (PR #5). See Catalyst below.
- Part 4 (Nov 10, branch `catalyst/proposal-files`): What should change? on a lead's documents, the client proposal
  (write, read, edit, Save as PDF), the charts in the proposal and the meeting prep, and file uploads on a lead's Files
  tab. Uploads need Storage rules for signed-in teammates first (see Gotchas). See Catalyst below.
- Not ported from a lead's page, on purpose: comments on a document (only in Full text there; six ever, all resolved)
  and the Edit lead panel (broken in the current dashboard: it saves a column e1_leads does not have).
- Next: Touchpoint, Pipeline, Atlas, Canvas, Settings. Then the cutover.
- Not checked yet in production: the first calls from Vercel's servers to n8n (a Read here through the Doc Reader, a
  run question's Reads, a stage run). The current dashboard calls n8n from the browser; this app never does.
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
| Catalyst | Overview, Lead pipeline (board, list, a lead's page), New run | here (in production) |
| Catalyst | HubSpot contacts, Calls, a lead's Calls tab | here (in production) |
| Catalyst | A lead's client proposal, What should change?, meeting prep charts, file uploads | here (part 4) |
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
- Runs (part 2): a card's Run, a drop on another column, a lead page's Stage picker or a prep tab's Run opens the
  question (`stage-question.tsx`, v136Ask): what the stage writes and works from, what the run reads (`stageReads`:
  the template, the lead's Fathom calls, its HubSpot emails, the CRM record, the discovery questions), the meeting
  notes, and Just move it / Move and run it. `goStage` (a Server Action) reads the lead again, checks the plan
  (`planFor`: the proposal needs the assessment, a stage with nothing to work from needs notes or a call), moves it
  (e1_leads.stage on every row of the person, not the anonymizer's shared placeholder row), builds the notes
  (`composeNote`: the team's notes, the CRM record, the emails, then the transcripts, within 44,000 characters), starts
  only that stage (`plan.ts` `RUN_HOOKS`: the full run, the custom run with `entry`, or Meeting Prep; `only: true`),
  files the calls it read under the stage the lead was in, and keeps the run for the team in ai_settings
  `catalyst_runs` ({lead email: {s, t0, seen, by}}). A card says "Writing …" until a newer document of the stage lands
  or for 45 minutes (`runOf`), and the page checks back every 30 seconds while one runs (`useCheckBack`).
- New run (`new-run.tsx`, `newRun`): the older form for a lead not on the board yet, with the Fathom call picker
  (`recentCalls`, `callText`); the lead goes in the stage it picked, and its run shows on the board.
- n8n calls for runs go through `startN8n` (`src/lib/n8n.ts`): any 2xx is started, anything else "Webhook returned
  <status>", and the token goes out with at least 20 minutes left (renewed first), since the run hands it on.
- Changed on purpose from the current dashboard (reported to Kser): the list's rows open the lead's page (its v60 side
  panel saved a column e1_leads does not have); the Overview's Recent leads and Documents count the six stages, not the
  older five documents; a lead opens on the tab of its stage; the Documents tile counts documents, not PDF links; the
  list says 0 shown, not 1, when nothing matches; a run in progress is kept for the team and survives a reload (the
  current dashboard kept it in one tab's memory); a move leaves the anonymizer's shared placeholder row alone; New run
  runs show on the board.
- HubSpot contacts (part 3, `hubspot.ts`, `hubspot-view.tsx`, renderHubspot): the synced contacts, newest sync first,
  with search; Run Catalyst opens New run prefilled from the contact (`NewRunDialog` takes a `prefill`); Follow
  (`follow.ts`, `follow-dialog.tsx`, `followCompany`) puts the company on the watchlist (`competitors`, category
  ads_strategist) the Intel Tracker and the Ad Strategist read; Open lead shows when the contact's email is an
  e1_leads row (never the anonymizer's placeholder row).
- Calls (part 3, `calls.ts` pure rules, `calls-load.ts`, `fathom.ts`, `src/components/calls`, `src/app/(app)/calls`):
  - Fathom is read live through Dashboard · Fathom Proxy from the server (`ftStatus`, `ftList` a page at a time with a
    cursor, `ftTranscript`, `ftAccess` for the share links, `ftConnect`, `ftDisconnect`). Not connected, or the list
    failing, shows the Set up (or Connection) tab with the key form.
  - The page: the strip, All / Clients / Internal, the type buttons (`catButtons`, v121), search, folders and tags, and
    the open call. The tab, the type button, the call and its section are the address's (`?tab= ?type= ?call= ?seg=`),
    so a lead's "Open on Calls" (`/calls?call=<id>&seg=post`) lands on the call's post-call actions.
  - A call's type is the team's (`call_meta.meeting_type`), else the AI's pick on its post-call actions; the team's own
    types are `ai_settings` `call_types` (names). Its folder (`folderOf`): the folder set, the client, the Catalyst
    lead's company, the guests' company from their email domain, else AI Paragon (internal) or No client yet.
  - Edits (Edit details, the type, HubSpot results) go to `call_meta` (update, else insert) with `updated_by`.
  - Post-call actions (`post-call.tsx`): the newest `call_outputs` row per call; Write post-call actions and Write
    again start Meetings · Post-call Actions (`call-actions`) and the page checks `call_outputs` every 5 seconds for 4
    minutes; ticks write the task's `done`; Share to Slack (Integrations · Slack Proxy) and Sync to HubSpot (Meetings ·
    Call to HubSpot, `crmBody`) as the current dashboard words them; Run the assessment from this call opens New run
    with the transcript; Auto for new calls is `ai_settings` `call_auto_actions`.
  - The page checks for new calls every minute (`router.refresh()`, which reads the page's data again) and on coming
    back to the tab, and says "New call from Fathom: …".
- A lead's Calls tab (`leadCallsFor`, `callsOfLead`): every recorded call with the lead (set-aside ones too), filed
  or not; File it opens the new-transcript question (`call-question.tsx`, `answerCall`, v137AskCall): Not about this
  client (filed as none), Just file it (under the lead's stage), Move and run it (filed, the lead moved to the next
  stage, that stage run with the call; in Client review, the review again).
- Changed on purpose in part 3 (reported to Kser): no Integrations switcher above HubSpot contacts and Calls (the
  sidebar has them under Catalyst); Use as content source and Send to Asana are not here yet (Content Transformation
  and Tasks are still in the current dashboard; the team-wide Asana Proxy was never published); Refresh from Fathom and
  Key ending sit on the banner line; a HubSpot search with no match says so (the old page said no contacts were
  synced); Follow also saves the website it asks for and who added the company; the Assessment card on a discovery
  call says "Next: the Assessment" (the old one said the Growth Plan over the same button); due dates no longer show the
  day before in US time zones; a call's lead box counts the six stages; File it on a lead's page files the call under
  that lead (the old one picked the first lead among the guests).
- What should change? (part 4, `change-ask.tsx`, `askChange`, v125): on each finished document card (the five older
  documents) and on the client proposal. A reason of at least 12 characters goes to `agent_feedback` (target_type
  e1_document, target_id `<lead email, lowercase>:<agent>`, action changes, author the teammate's email); the card counts
  the asks on its document (`lead-page.ts` `asks`) and the count opens AI settings in the current dashboard. Not on the
  onboarding plan or the client review brief, as before.
- The client proposal (part 4, `proposal.ts` pure rules, `proposal-run.ts`, `proposal-card.tsx`, `proposal-doc.tsx`,
  `doc-actions.ts`; v132 and v138): on the Proposal tab once the assessment is done (or a proposal or a run exists).
  - Write the client proposal asks first (`proposalUses`: the templates in use, what the Proposal stage reads, the
    lead's documents, "Using …"), then `writeProposal` sends the meetings' notes (`composeNote` with no typed notes: the
    CRM record when it is on, the emails, the transcripts; no single call's title) to Catalyst · Client Proposal
    (`catalyst-proposal`) and keeps the run for the team in ai_settings `catalyst_proposal_runs` ({lead email: {t0, by,
    uses}}). The card checks every 8 seconds (`proposalLanded`) and opens the proposal when it lands; after 15 minutes
    it stops and says so. The calls it reads are not filed (only the board's runs file them).
  - Read here draws the newest saved proposal (`data.doc`, else `content_md` read as one) in its brand (its own, else
    the proposal template's in use: `brandVars` CSS variables, the logo, Google Fonts for a font that is not a system
    one), with the chips, the [FILL IN] / [TO CONFIRM] / [ASSUMED] markers and the charts; `?read=proposal` keeps it
    open. The document's styles are the `.prop-*` and `.chart-*` rules in `globals.css`.
  - ✎ Edit makes the title, the subtitle and each section's heading and text editable in place; `saveProposal` applies
    the edits on the server to the row read fresh (`applyEdits`), so only those can change, writes `data.doc`,
    `data.edited`, `content_md` (`docMd`, with a Chart: line under each chart's section) and `edited_by_human`, and keeps
    the agent's version once in `snapshot`. Save as PDF prints the saved version alone in a new window
    (`printProposal`: the page's styles plus letter-page rules; tests set `window.__apPrint`).
- Charts (part 4, `charts.ts`, `chart.tsx`, v138): `checkCharts` checks `visuals` again (two at most, two to twelve
  items each), `layoutChart` lays out a timeline or bars in a 600-wide drawing, with the same numbers as a table for
  screen readers that stands in for the drawing on a phone. A brand color draws the marks only when it stands out on
  white (`inkOf`). In the proposal a chart goes under the section it names (`chartsBySection`), in the onboarding plan and
  client review brief at the end of the ## section it names (`placeCharts`), else at the end.
- Files (part 4, `files-panel.tsx`, `file-actions.ts`, `files.ts`): Upload sends the file from the browser straight to
  Storage (bucket lead-files, under the lead's email) at an address signed as the teammate (`startUpload`; a Vercel
  request takes 4.5 MB at most, a file up to 25 MB), then `finishUpload` saves the row and sends a copy to HubSpot
  after answering (Lead File → HubSpot Sync, `after()`), and `indexFile` reads the text for the Ask bot: a Word file on
  the server (mammoth), anything else through Lead File Text Ingest (`file-ingest`). Index and Re-index read it again;
  ✕ asks first, then deletes the row and its stored file. The server fetches only files kept in lead-files.
- Changed on purpose in part 4 (reported to Kser): deleting a file asks first (the Files page always did); an upload
  whose row cannot be saved takes its stored file back out; Word files are read on the server, not in the browser; an
  upload whose text could not be read says so (the old page said nothing); the question before writing the proposal
  opens at once and checks what it reads inside it (the old one opened only after); a proposal run is kept for the team
  and survives a reload (the old one kept it in one tab); the help under Files says uploads stay with the lead (the old
  one said they land in the shared knowledge base, which lead uploads never did); the stage picker has no "✎ Type your
  own…".

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
- `catalyst-logic.spec.ts` checks the lead, call and follow rules without a browser, `proposal-logic.spec.ts` the
  chart and client proposal rules; `catalyst.spec.ts` and `catalyst-runs.spec.ts` the Catalyst pages; `hubspot.spec.ts`
  HubSpot contacts; `calls.spec.ts` Calls and a lead's Calls tab; `proposal.spec.ts` the client proposal;
  `lead-docs.spec.ts` What should change? and the meeting prep charts; `files.spec.ts` a lead's files. Helpers in
  `helpers.ts`: `stubCalls`, `stubRows`, `stubSeed`, `stubHook`, `stubFathom`.
- The Storage stand-in (`/storage/v1`, bucket lead-files): signs an upload address for a signed-in session, takes the
  upload, serves public reads and removes files, and answers the browser's CORS checks; `/__storage` lists what it
  keeps, and `{deny: true}` turns signed-in teammates away, as Storage does before its rules for them. File Ingest saves
  a stored file's text on its row (a file named "scan…" has none); Catalyst · Client Proposal and the HubSpot file sync
  answer as their workflows do, and a test writes the client_proposal row n8n would save. `tests/fixtures` holds a
  made-up Word file.
- The Fathom stand-in keeps the team's key (`/__fathom`, `stubFathom({connected: false})` disconnects it), lists two
  pages (`fathomCalls()`, then `fathomOlderCalls()` for cursor `page2`), answers `access` with 'team' for a share token
  containing TeamOnly, and takes connect (a key starting "bad" is turned away) and disconnect. Slack, HubSpot sync
  and post-call actions answer as their workflows do; a test writes the `call_outputs` row the workflow would save.
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
- Chromium starts no native drag from a `<button>` inside a draggable card, and Playwright's `dragTo` starts at the
  centre (often the card's Run button): the tests start drags on the card's name (`sourcePosition`) and use a 1440
  window, where the board's six columns sit in one row.
- The old dashboard does not read `catalyst_runs`: a run started here shows "Writing …" here only, and the other way
  round, until the cutover.
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
- React's lint (`react-hooks`) refuses a ref written during render and a setState called straight from an effect: keep
  refs in step inside an effect, and read data in an effect with a `live` flag and `.then` (as `stage-question.tsx`
  and the lead page's Calls tab do).
- A card drawn on the server is on screen before the page's timers are set: a test that moves the clock waits for the
  page to say it is checking back (`html[data-check-back="on"]`, set by `useCheckBack`).
- An `apAgo`-style "3h ago" changes with the clock, so it is drawn only once the page has hydrated (`Ago`); the server
  draws the date.
- Storage's rules for the lead-files bucket cover the public key only (the current dashboard uploads with it). Here an
  upload address is signed as the teammate, and a delete goes as the teammate, so the bucket needs rules for signed-in
  team accounts (insert, select and delete, checked on the email's domain as catalyst_sources' rules are). Until they
  are in, an upload says "Storage turned the upload away" and a delete leaves the stored file behind.
- React's `autoFocus` does nothing inside the dialog (it focuses before the dialog's own effect opens it): focus in an
  effect of the dialog's content instead (`change-ask.tsx`).
- The proposal is drawn once and left alone while it is edited in place (React never redraws text a teammate is
  changing); a new version or Cancel draws it afresh under a new key (`proposal-doc.tsx`). Keep anything that changes
  while editing outside the memoized document.
- A `'use server'` file exports async functions only: constants the browser shares with it go in a plain module
  (`src/lib/catalyst/files.ts`).
- The old dashboard does not read `catalyst_proposal_runs` either: a proposal started here shows "Writing…" here only.
