# AI Paragon internal dashboard (Next.js)

Brief for Claude sessions in this repo. Last reviewed 2026-11-12.

## What this is
The AI Paragon Consulting Group team workspace: Touchpoint (home and tasks), Catalyst (clients and meetings),
Canvas (client deliverables), Pipeline (content and ads), Atlas (knowledge and files) and Settings. It is being
rebuilt here, in Next.js, from the single-file dashboard in krever1/aiparagon (`new-aiparagon-dashboard.html`, live at
aiparagon.vercel.app/dashboard). Both apps use the same Supabase project and n8n workflows, so they run side by side
until every page has moved; then aiparagon.vercel.app/dashboard forwards here.

One repo per project (Kser, Nov 9): this repo is the internal dashboard only. The other projects (care portal, voice
agent Command Center, Advisory demo, website builder) stay in krever1/aiparagon until they get their own repos.

## Where it stands (as of 2026-11-12)
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
  tab. The Storage rules uploads need were added on Nov 10 (see Gotchas). Merged into `dev` (PR #6) and released to
  production on Nov 10 (PR #7). See Catalyst below.
- Not ported from a lead's page, on purpose: comments on a document (only in Full text there; six ever, all resolved)
  and the Edit lead panel (broken in the current dashboard: it saves a column e1_leads does not have).
- Touchpoint, in three parts (Nov 11): 1. Tasks; 2. Approvals; 3. Today, which reads Approvals' list for Needs you.
  Part 1 (Nov 11, branch `touchpoint/tasks`, PR #8 into `dev`): the post-call to-dos. Part 2 (Nov 11, branch
  `touchpoint/approvals`, on top of part 1, PR #9): Approvals, in pieces: A, the briefs and the Intel Tracker's replies,
  and B, ad images waiting for a decision, content drafts and failed requests (both done); C, leads and comments (Nov
  11, in the finishing PR below). `dev` goes to `main` only once Approvals lists every kind the current page does, so
  production never shows fewer things waiting. Part 3 (Nov 11, branch `touchpoint/today`, on top of part 2): Today:
  the hello line, the Catalyst card (new clients from HubSpot, new transcripts), Needs you, Quick start, Your
  workspace, Recent runs and Latest sign-ups. The finishing PR (Nov 11, branch `touchpoint/finish`, on top of part 3;
  Kser: "fix the 3"): Approvals' leads and comments, the Catalyst line by the same rule, and Take the tour on Today.
  With it Approvals lists every kind the current page does. See Touchpoint below.
- Pipeline, in five parts (agreed Nov 11): 1. reading the market (the Intel Tracker, the Market Intelligence Briefs,
  the Overview); 2. ads (the Ad Strategist, Runs & uploads, the upload, build-a-brief and ad copy windows, the brief
  editor); 3. results (Ad Testing, Landing pages); 4. Content Transformation, with the creation kit it shares; 5.
  Marketing Generation. Part 1 comes as two PRs: 1a the Intel Tracker (Nov 11, branch `pipeline/intel-tracker`, on top
  of the finishing PR, PR #12), 1b the Overview and the Market Intelligence Briefs (Nov 11, branch
  `pipeline/briefs-overview`, on top of 1a, PR #13). With 1b, part 1 is done. Part 2 comes as three PRs: 2a the Ad
  Strategist (Nov 11, branch `pipeline/ads`, on top of 1b, PR #14), 2b Runs & uploads and the upload, build-a-brief and
  ad copy windows, with Read this ad and Send to Marketing Generation (Nov 11, branch `pipeline/uploads`, on top of the
  link fix, PR #16), 2c the brief editor and its Structure view (Nov 11, branch `pipeline/brief-editor`, on top of 2b).
  With 2c, part 2 is done. Part 3 comes as three PRs: 3a Landing pages, with the preview of a page that is not live
  (Nov 12, branch `pipeline/landing-pages`, on top of 2c, PR #18), 3b Ad Testing's Results, Leaderboard, Log a
  result and the sync line (Nov 12, branch `pipeline/ad-testing`, on top of 3a, PR #19), 3c Ad Testing's Strategy read
  (New read, Remember) and Import a CSV (Nov 12, branch `pipeline/strategy-read`, on top of 3b). With 3c, part 3 is
  done. Part 4 starts with 4a, Content Transformation's Drafts and Ideas (Nov 12, branch `pipeline/content-drafts`, on
  top of 3c, PR #21); New draft follows: 4b the form and its run, with Paste, Read link and New idea (Nov 12, branch
  `pipeline/content-new`, on top of 4a, PR #22), 4c a file read in the browser, Fathom calls (with Calls' Use as
  content source) and Fill it in for me (Nov 12, branch `pipeline/content-files`, on top of 4b, PR #23), 4d the plan
  (Nov 12, branch `pipeline/content-plan`, on top of 4c), 4e the briefs' findings, 4f video and audio (transcription
  and clips). See Pipeline below.
- Links into a page kept alive (Nov 11, branch `fix/link-state`, on top of 2a): a link that asks for a tab, a filter,
  a reply or a form now gets it on a page Next.js kept from a moment ago (see Gotchas: React Activity). Found while
  testing 2a: the briefs page's link to the Intel Tracker's Following tab landed on the tab the tracker had before.
- Next: Content Transformation's briefs' findings (Pipeline 4e), and video and audio (4f), then part 5 (Marketing
  Generation), then Atlas, Canvas, Settings. Then the cutover.
- Not checked yet in production: the first calls from Vercel's servers to n8n (a Read here through the Doc Reader, a
  run question's Reads, a stage run). The current dashboard calls n8n from the browser; this app never does.
- Live (Nov 9, PR #1): production at aiparagon-dashboard.vercel.app, Vercel's own domain for now (Kser's call; a
  custom domain can come later). Vercel project aiparagon-dashboard in Kaeser's projects, framework Next.js, the two
  Supabase values set for Production, Preview and Development. Production builds from `main`; `dev` deploys to
  aiparagon-dashboard-git-dev-kaesers-projects.vercel.app.
- Access: Standard Protection, as on the aiparagon project. Previews and per-deployment URLs need a Vercel login; the
  production domain aiparagon-dashboard.vercel.app is open, guarded by the app's own sign-in.
- Not set up yet: branch protection on `main` (Settings, Rules, Rulesets: block force pushes and deletions, require a
  pull request and the CI check `check`). Rules on a private repo need a paid GitHub plan; there is no API for them in
  these sessions, so Kser sets them in GitHub.

| Product | Pages | Status |
|---|---|---|
| Touchpoint | Today, with Take the tour | here (Touchpoint part 3 and the finishing PR, not released) |
| Touchpoint | Approvals: briefs, the Intel Tracker's replies, ad images, content drafts, failed requests, leads, comments | here (Touchpoint part 2 and the finishing PR, not released) |
| Touchpoint | Tasks (the post-call to-dos; Asana stays in the current dashboard) | here (Touchpoint part 1) |
| Catalyst | Overview, Lead pipeline (board, list, a lead's page), New run | here (in production) |
| Catalyst | HubSpot contacts, Calls, a lead's Calls tab | here (in production) |
| Catalyst | A lead's client proposal, What should change?, meeting prep charts, file uploads | here (in production) |
| Canvas | Deliverables | current dashboard |
| Pipeline | Intel Tracker | here (Pipeline part 1a, not released) |
| Pipeline | Overview, Market Intelligence Briefs | here (Pipeline part 1b, not released) |
| Pipeline | Ad Strategist | here (Pipeline part 2a, not released) |
| Pipeline | Runs & uploads; the upload, build-a-brief and ad copy windows; Read this ad | here (Pipeline part 2b, not released) |
| Pipeline | The briefs' editor (Edit, Preview, Put back the agent's version) and Structure view | here (Pipeline part 2c, not released) |
| Pipeline | Landing pages, with the preview of a page that is not live | here (Pipeline part 3a, not released) |
| Pipeline | Ad Testing: Results, Leaderboard, Log a result, the Meta and LinkedIn sync line | here (Pipeline part 3b, not released) |
| Pipeline | Ad Testing: the Strategy read (New read, Remember) and Import a CSV | here (Pipeline part 3c, not released) |
| Pipeline | Content Transformation: Drafts (the review, Mark ready, What should change?, the library) and Ideas | here (Pipeline part 4a, not released) |
| Pipeline | Content Transformation's New draft: the kinds, Paste, Read link, New idea, the details, the side, Generate | here (Pipeline part 4b, not released) |
| Pipeline | Content Transformation's New draft: Upload (a file read here), Fathom call, Calls' Use as content source, Fill it in for me | here (Pipeline part 4c, not released) |
| Pipeline | Content Transformation's New draft: the plan (the parts, the team's default) | here (Pipeline part 4d, not released) |
| Pipeline | Content Transformation's New draft: video and audio, the briefs' findings | current dashboard |
| Pipeline | Marketing Generation | current dashboard |
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
  `auth`; errors in the current dashboard's words (a 404 says which workflow to switch on). `minLeftSec` renews the
  token first when less time is left on it (a call whose workflow hands the token on).
- `src/components/ui`: dates in the viewer's own time zone (`LocalDay`, `LocalDate`, `LocalDateTime`: UTC while the
  server renders, then the browser's zone, with no hydration mismatch), the toast, the dialog (the browser's
  `<dialog>`) and the side panel (`drawer.tsx`, a `<dialog>` on the right). `useNow` (`clock.ts`) is the clock for
  words that change with the time ("Good morning", "12 days ago"): the server's time while it renders, then the
  browser's, by the minute (React's lint refuses `Date.now()` while drawing).

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
  sidebar has them under Catalyst); Send to Asana is not here yet (Tasks' Asana is still in the current dashboard; the
  team-wide Asana Proxy was never published), and Use as content source came with Pipeline 4c; Refresh from Fathom and
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

## Touchpoint
- Tasks (part 1, `tasks.ts` pure rules, `tasks-load.ts`, `src/components/tasks/tasks-view.tsx`, `src/app/(app)/tasks`;
  apTkHtml as v121 redefined it): the post-call to-dos.
  - The cards: every call whose post-call actions are written (`call_outputs` status done) and have next steps, open
    ones first, then the newest by `call_start` (else `created_at`), 40 at most (`taskCards`).
  - The type buttons over them (`taskButtons`, the same as Calls'). The pick is the address's (`?type=`); a picked kind
    with nothing in it shows everything again, unless it is one of Erica's three (`shownCat`).
  - The calls are filed in client folders, the folder with the newest call first (`taskFolders`); a folder folds up.
  - Each call: its title (the team's, else `call_outputs.call_title`, else "Call"), the day, "in Asana · <project>"
    once its tasks were sent there, Open call (`/calls?call=<id>&seg=post`), the type picker with + New type…, the
    people line, Edit people and client, and the ticks (`tickTask`, which reads the tasks again before saving).
  - The reads are Calls': `readCallRows`, `callLeads`, and Fathom's first page, waited for 4 seconds
    (`ftList(undefined, 4000)`), as the current dashboard waits. Without Fathom a call has only the people the team
    saved on it, and its folder follows `folderOf` with no call (v121Folder: no people and no folder set means the team's
    own call only when its type is internal or dev). A call Fathom did not list gets a stand-in call for Edit details,
    built from its post-call actions, as apCxEdit does.
  - The Asana panel (a personal token saved in the current dashboard's browser storage) and Send to Asana stay in the
    current dashboard, behind a card that links to it. No call had ever been sent to Asana (`call_outputs.asana`, Nov 11).
- Changed on purpose on Tasks (reported to Kser): Asana stays in the current dashboard (above); the heading line reads
  "Touchpoint · Home and tasks" like every ported page (the old page said "Touchpoint"); the heading's tooltip leaves
  out Send to Asana; a failed read of the post-call actions says so (the old page said "None yet"); the open count is
  the calls shown under the picked button, before and after ticks (the old one changed what it counted after a tick);
  a tick reads the tasks again first, so it never undoes a teammate's tick. On Calls too: the type buttons follow the
  current dashboard's order, Client work before Internal development (the Calls port had them the other way round).
- Approvals (part 2, `approvals.ts` pure rules, `approvals-load.ts`, `src/components/approvals/approvals-view.tsx`,
  `src/app/(app)/approvals`; nwApprovalsHtml as v117 and v127 left it): one list of everything waiting for a person.
  - What waits (`approvalItems`), in the current dashboard's order:
    - failed content requests (content_requests with status error, among the newest 60), opened on Content
      Transformation's Drafts here, where Try again is (since 4a; one made from the briefs on Marketing Generation);
    - the newest organic brief (agent_outputs, intel_tracker intel_brief) and the newest ads brief (creative_briefs)
      while undecided (no brief_approval decision, or the newest one is reopened or edited). A brief's line is the
      first item of its snapshot (agent_outputs.snapshot by run id, the newest that reads), else its TL;DR or its
      hooks; an ads brief 14 days old or more says so. Review opens the briefs page;
    - the ad images of the three newest book a call and low-ticket campaigns (agent_outputs low_ticket_content, the
      newest row per run; its data is a JSON string) that nobody has approved or turned down (agent_feedback
      ad_image_variant by file, the newest decision): "Ad 2 · <offer>", the campaign's hook for that image
      (funnel_packages ad_variations.hook_variations, empty ones dropped first, as v97LtLoad does) else the image's
      label, and how many of the campaign's ads are approved. Review opens Marketing Generation;
    - content drafts not marked ready (agent_outputs content_generation content_draft, newest 60; a draft_review row
      with action ready), with Check and approve to Content Transformation's Drafts here, at that draft (since 4a;
      one made from the briefs on Marketing Generation, in the current dashboard);
    - the Intel Tracker's pending replies (engagement_drafts), newest first;
    - the board's leads waiting on a person (`leadWaits`, `waitsOnNext` in `catalyst/view.ts`): not a weak fit
      (`fitTone` bad: weak or disqualified), nothing being written for them, and a next document not written yet
      (`nextDocOf`: the lead's own stage's document, else the first later stage's without one; none once every stage
      from its own on has its document), newest first: "Lee Ready · Ready Example LLC", "Next: Assessment report",
      Open lead to the lead's page at that document's tab. Nothing to approve. Only from a whole read of the leads and
      their documents (without the documents every lead would look as if it had none);
    - open comments (dashboard_comments where resolved is not true, the newest 40): "Comment from <author>" (an email's
      part before the @), the comment, Resolve, and Open where it was left, by its target_key: `e1:<email>:<agent>` a
      lead's page here at that document's tab (the lead found by any of its emails; the board when none has it),
      `brief:<run>` the briefs and `funnel:<run>:<part>` Marketing Generation in the current dashboard, anything else
      the Intel Tracker there, where the current dashboard always sent it. On Nov 11 the live table held 14
      comments (brief, e1 and funnel keys), none open.
    Every page Review opens but a lead's, a draft's and a failed request's is still in the current dashboard (`out`:
    "Opens in the current dashboard"); a campaign cannot be opened at itself from here.
  - The tabs (`viewOf`): All, each kind with something waiting, then Skipped. The tab is the address's (`?tab=`); a tab
    left with nothing in it shows All and All becomes the choice (as V107D.filter does), so a later skip or undo does
    not jump back. All shows five replies and a line for the rest. Replies more than a week old are out of the counts
    and sit under Older than a week on Replies (v117: Replies says 0 when only those are left). 20 rows at a time.
  - Approve, one or several (the boxes, Select all; `approveItems`, one at a time, the first failure stops the rest):
    a brief's decision in agent_feedback (brief_approval, approved, "Approved in Approvals"), an ad image's
    (low_ticket_content, ad_image_variant, target_id the image's file; Marketing Generation and Landing pages count
    these), a reply's status in engagement_drafts with its agent_feedback row (engagement_draft, "Reviewed on the
    dashboard"), author the teammate's email; a comment's Resolve sets resolved and resolved_by (the teammate's name,
    as the document's own comments do). Drafts, failed requests and leads are not approved from the list. The message
    that confirms has Undo (`undoItems`: reopened, "Undone in Approvals"; a reply back to pending; a comment open
    again, resolved_by cleared); it says "Comment resolved" / "2 comments resolved" when every row was a comment.
  - Skip keeps a row out for now in this browser only (localStorage `ap.nw.skip`, as the current dashboard; the two
    apps are on different addresses, so they do not share it), with Undo and Bring back. Nothing is saved.
  - A reply's Review opens it in full: the post it answers (only a web address), the draft to change (saved when it
    changed, then approved), Copy, Approve, and Reject, which asks why first (v127: six reasons and a note, `whyText`,
    saved as the decision's feedback); Cancel, the X or Esc keep the reply.
  - On Nov 11 the live data had 4 ad images waiting (two campaigns), no content requests, no content drafts, no open
    comments and 3 leads (none with a fit rating).
  - The board's leads are read once per visit: `loadApprovals({pipeline})` takes Today's read of them.
- Approvals opens a reply's window from the address once (`?review=reply:<id>`, Today's Next up); closing it drops
  the word from the address. The Skip store is `src/components/approvals/skips.ts` (`useSkips`), shared with Today.
- Today (part 3, `today.ts` pure rules, `today-load.ts`, `src/components/today/today-view.tsx`, `src/app/(app)/today`;
  v115TodayHtml as v137 left it):
  - The hello line: "Touchpoint · Wednesday 11 November", "Good morning, Kser." (the first word of the teammate's
    name; morning before noon, afternoon until six) and "3 things need you." The server draws them in UTC, the
    browser in the viewer's own time zone once the page is in it (`data.now`, then the clock by the minute).
  - Needs you: what Approvals lists less this browser's skips and replies older than a week (`waiting`), the number,
    a chip per kind (to that tab of Approvals), Next up (the first three; a reply opens in its window on Approvals,
    the rest where Approvals sends them), Start reviewing. Nothing waiting: You are all caught up, Open Approvals.
  - Quick start: Run Catalyst for a lead (`/lead-pipeline?run=new`, which opens New run once; `NewRunButton` reads
    the address after hydrating), Make an ad campaign (Marketing Generation, in the current dashboard), Turn content
    into a post (New draft here on its Upload tab, `/content-transformation?src=upload`, since 4b) and Put a landing
    page live (the picker on Landing pages).
  - Your workspace: the five products with their pages and a line each: things waiting (with this browser's skips),
    leads and how many wait on a next stage (the leads Approvals lists, `waitsOnNext`), Canvas's and Atlas's fixed
    lines, briefs to review (all undecided, skipped or not, as before) and live landing pages.
  - Recent runs (`runs`, the four newest by start, a run with no start last), Latest sign-ups (`lp_signups`, the four
    newest, "5 minutes ago", the page's title on hover). The page reads its data again every 10 minutes while open
    (`html[data-today-refresh="on"]` while the timer is set).
  - The Catalyst card (Catalyst · Before your next meetings; v137TodayCard and v137Load; `inbox.ts` pure rules,
    `inbox-load.ts`, `src/components/today/crm-question.tsx`, `src/app/(app)/today/actions.ts`), first when there is
    anything: new clients from HubSpot (hubspot_contacts first seen in the last 14 days, not a lead, not the team's,
    not set aside in ai_settings `catalyst_inbox`) and new transcripts (Fathom's first page, waited for 4 seconds:
    calls from the last 14 days with a lead among the guests, not filed in call_meta.lead_stage), newest first, four
    at a time with Show N more, and counted in the hello line. They are checked against the leads, so nothing shows
    as new when the leads could not be read.
  - A new client's question: what the prospect brief reads (the template, the CRM record; the contact is looked up by
    its email as HubSpot keeps it and in lower case), then Not a client (set aside for the team), Add without running
    (an e1_leads row in Prospect research, lead_source HubSpot; a row there already only gets the stage when it has
    none) or Run the prospect brief (the same, then the full run with `only: true`, the HubSpot title, company and
    website and hearAboutUs HubSpot, kept in catalyst_runs). A new transcript opens the call question of a lead's
    Calls tab (`CallQuestion`; its Reads list is `reads-box.tsx`, shared with the new client's).
  - Take the tour (`tour.tsx`, `TOUR` in `today.ts`; NW_TOUR, nwTourHtml), a button on the hello line: four steps in a
    window, "1 of 4", a picture, the words, dots, Skip (or Back) and Next (or Done), the main button taking the keyboard
    at each step; Esc or the X close it, and it starts again at the first step. The first three are the current
    dashboard's words (the first as v115 left it, its picture now the five products); the fourth is new (Some pages are
    still moving over: a page not moved yet opens a card that links to it, both work on the same data, and the current
    dashboard has its own sign-in), since the old one spoke of Ask, Ctrl K, G shortcuts and Customize, which this
    dashboard does not have.
- Changed on purpose on Today (reported to Kser): the Catalyst line counts the leads Approvals lists (by the six
  stages: the next document from the lead's own stage on); the old page counted leads missing any of the five older
  documents, so a lead without the retired follow-up guide always counted. The tour's fourth step and its first
  picture (the old picture showed the Intel Tracker's flow). Canvas's line says what it holds instead
  of counting documents (that count comes with the Deliverables port). Between 641 and 1080 px wide every card takes
  the whole width. A read that fails says so in its card. The Catalyst card's items past four open with Show N more
  (the old page sent them to the bell, which this app does not have yet).
- Changed on purpose on Approvals (reported to Kser): a reply's approval or rejection is credited to the teammate's
  email (the old page credited the company profile's contact name, whoever clicked); one message per approval (the old
  page also said "Draft approved"); a failed read says so (the old page showed nothing waiting); Undo says "Undone" only
  when it worked; changing tab clears the selection, so Approve N only takes rows on screen; the tab is in the address;
  the link to a reply's post opens only when it is a web address. Leads: by the six stages (the old page counted the
  five older documents, the follow-up guide among them, and so named a lead's next step wrongly); a lead being written
  for, or disqualified, is not waiting; Open lead opens the lead's page at its next document. Comments: the newest 40
  open ones (the old page took the newest 40 and kept the open ones); Open goes where the comment was left (the old one
  always opened the Intel Tracker); resolved_by is the teammate's name (the old page wrote the company profile's
  contact name).

## Pipeline
- Notes for the later parts, from the map of the current pages: the old Company profile loaders write while they read
  (v104ReadSync and v104SyncDerived rewrite ai_rules), so that goes with the Company profile port, not a reader. The
  newest strategy read reaches the house rules (ai_rules source profile:read, "From the latest results, lean into: …")
  only through v104ReadSync, which the current dashboard runs when its pages load the reads (Ad Testing, Marketing
  Generation's plan, the Overview, the Company profile); the Ad Testing page here writes nothing on view, so until
  Marketing Generation and the Company profile move, the old pages keep that rule up to date;
  `winner_creatives` is a view of ad_records (the Ad Strategist writes to ad_records); the low-ticket rows keep their data as a
  JSON string; Content Transformation's transcription has size limits to keep; a run in progress is kept for the team
  in ai_settings, as Catalyst's are; the ad-upload, ad-brief, regen-ad-image and e3-content-run webhooks need `auth` in
  the body, like every other; the ads part needs Storage rules for the creatives bucket first, as lead-files did.
- The Intel Tracker (part 1a, `src/lib/pipeline/intel.ts` pure rules, `intel-load.ts`, `src/components/pipeline`,
  `src/app/(app)/intel-tracker`; the nwIntel and apIr functions as v96, v108, v111 and v127 left them):
  - What it reads, as the teammate, fresh on every visit: the tracker's runs (`runs`, agent intel_tracker, the 40
    newest), its organic briefs (agent_outputs intel_tracker intel_brief, the newest per run, and the brief of the run
    on screen when it is older), the posts and drafted replies of the run on screen (intel_items, 400 at most, and
    engagement_drafts), the briefs' snapshots, who it follows (`competitors`), the team settings agent_runs,
    intel_focus, intel_follow, intel_keywords, ad_industries and intel_runs, and the company profile.
  - The run on screen: the newest with posts, else the newest brief's, else the newest run (`pickRun`). The address
    names a run (`?run=`) only when it is not that one (`latest`), so a bare /intel-tracker follows new runs. The tab
    (`?tab=`) and the Posts filters (`val`, `theme`, `cap`, `five`) are in the address; search, sort and the view start
    afresh with each run.
  - The header: a run started (for 45 minutes, until its run shows), the last run, the next one (ai_settings
    agent_runs.intel: cadence, day, time and zone; weekly, Monday 06:00 Pacific when none is saved), the window the run
    covers, the run picker and Run now; what it does; five numbers (posts read, in the brief, high value, replies
    drafted, themes), each opening its view.
  - Posts: cards or a list, by score (`scoreFrom`, five factors weighted 35, 20, 15, 20 and 10), value, engagement or
    date; Value chips, Theme, Captured in, search, Show N more. A post in full (the side panel): its score and factors,
    why it is in the brief or not (`capOf`, `whyShort`, `whyFull`: from the brief's items, high-value signals, shifts
    in language, drafted replies, topic watch and the run's keep count), the takeaways it feeds and its replies.
  - Replies: by status; a reply opens in the window Approvals uses (`src/components/approvals/reply-window.tsx`), and
    Reject asks why first (v127).
  - Takeaways & themes: the five things from the brief (`fiveFor`: its snapshot's items, else its TL;DR), each with the
    posts closest to it (`rankPosts`, the old page's tokens and stop words; ties go to engagement) and See them in Posts;
    posts per theme; the shifts in language. Run library: each run with its numbers, themes and lead finding, and the
    themes across the briefed runs.
  - Following: Reads for (the company profile's industry and target market; Change), what it tracks (ai_settings
    intel_focus: themes, the team's own, categories), who it follows (competitors: people and companies; those followed
    for ads only apart, with Read their posts too; stopped ones below, with Follow again) and the searches (intel_follow,
    with intel_keywords kept in step; 12 at most).
  - Run now: the names (a card each or a pasted list; each needs a website or a social profile; 25 at most), only these
    or everyone followed, and an ad strategy after it if ticked. `startRun` sends them to the Intel Tracker workflow's
    intel-run with the teammate's token (renewed first when under 20 minutes are left, since a run that builds an ad
    strategy hands it on) and keeps the run for the team in ai_settings `intel_runs` ({runs: [{run_id, names, t, by,
    cascade}]}).
  - Write a post on this opens Marketing Generation in the current dashboard, where the current dashboard writes posts
    from the briefs (v97Start('brief')); Open the brief opens the briefs page here.
- Changed on purpose on the Intel Tracker (reported to Kser): a run started is kept for the team (the old page kept it
  in one browser); the run picker lists the tracker's own runs (the old page took the 40 newest runs of every agent,
  so a busy week hid older tracker runs); the address keeps the run, the tab and the filters, and a bare address always
  opens the newest run; the "Social Listening" headings left over say the Intel Tracker; the switched-off message
  names the workflow as n8n does, "(scheduled + custom)" (the old page said daily); Write a post on this opens Marketing
  Generation without filling it in (that page is still in the current dashboard; until 4a it opened Content
  Transformation by mistake).
- The Pipeline Overview (part 1b, `src/lib/pipeline/overview.ts` pure rules, `overview-load.ts`,
  `src/components/pipeline/overview-view.tsx` and `widget-store.ts`, `src/app/(app)/engine-3`; NW_PAGES['e3.overview'] as
  v107 to v115 left it):
  - The hello line ("Pipeline · Overview · <day>", the greeting, what needs you and when the Intel Tracker last ran),
    Take the tour (Today's) and Customize.
  - The cards, in this order until someone moves them: Needs you and Recent runs (Today's, now shared in
    `src/components/today/cards.tsx`); Quick start (Make an ad campaign in the current dashboard, Turn content into a
    post on New draft here, Log a result on Ad Testing here); Agents · open any section (six tiles, each with its number, a line, when it last ran and a dot:
    bad when the last run failed, warn when the tracker or the Ad Strategist last ran over 9 days ago or something
    waits; How it fits together opens six steps); This week's lead (the newest organic brief's five notes, from its
    snapshot, else its TL;DR; Write a post, Open the brief); Latest campaign (the newest book a call or low-ticket
    campaign: up to three pictures, its offer and kind, how many of its ads are approved); Voice and context (eight
    things the agents read: the newest brand voice, its mission and values, the company profile's industry and ideal
    client, ai_settings brand_context's offer and difference, the tracker's topics, the accounts followed); Latest
    thought leadership (the newest content draft, Ready or To check).
  - Customize moves cards earlier or later or hides them, in this browser only (localStorage `ap.nw.ord` and
    `ap.nw.hidew`, as the current dashboard), with Reset.
  - What it reads, as the teammate, on every visit: what Approvals lists (with the board's leads), the four newest runs
    and the newest run of the tracker and of the Ad Strategist, the newest organic brief and its snapshot, the newest ads
    brief, the 60 newest drafts and which are ready, the 40 newest campaign rows (one campaign per run), how many
    results, ads and posts are kept, the newest strategy read, and the voice and context rows. A read that fails says
    so in its card.
- Changed on purpose on the Overview (reported to Kser): each tile's last run is that agent's own newest run (the old
  page looked only among the 40 newest runs of every agent, so a quiet agent said Not run yet); ads and results are
  counted (the old page counted what it had loaded, at most 1,000 ads and 500 results); Write a post opens Marketing
  Generation without the note filled in (it is still in the current dashboard; until 4a it opened Content
  Transformation by mistake), the newest draft's Open opens it on Content Transformation here, and Log a result opens Ad
  Testing's Results here with its form open (`/ad-testing?tab=results&log=1`, since 3b); the How it fits together step that said Create says Content Transformation; a long
  title in Needs you stays inside its card on a phone (Today's had the same overflow).
- The Market Intelligence Briefs (part 1b, `src/lib/pipeline/briefs.ts` and `ads.ts` pure rules, `briefs-load.ts`,
  `src/components/pipeline/briefs-*.tsx`, `src/app/(app)/briefs`; NW_PAGES['e3.briefs'] and the nwBr functions as v109
  to v127 left them):
  - What it reads, as the teammate, fresh on every visit: the 14 newest organic briefs (agent_outputs intel_tracker
    intel_brief, one per run), the 12 newest ads briefs (creative_briefs), the 300 newest brief_approval decisions
    (agent_feedback), the content requests done with a brief (the creative briefs), the team's layout (ai_settings
    brief_structure) and the company profile. Then the brief on screen in full: an organic brief with its snapshot,
    its run's posts and replies; an ads brief with its snapshot and the ads it names by id (winner_creatives), else the
    list in its markdown ("## 8.") matched to ad_records and winner_creatives by link; Combined with the personas,
    offers and proof read directly.
  - The address: `?tab=` (organic when none, ads, combined) and `?run=` only when the brief is not the newest, so a
    bare address follows new briefs. A run older than the newest is read on its own; one nobody has opens the newest.
  - The header: how many of the newest briefs (organic, ads, creative) wait for a review, and a dot on each tab whose
    newest brief waits.
  - Organic: the record bar (published, the period, the agent, the industry with Change, the versions, Brief or
    Structure, the state, Approve brief and Edit), the evidence note, the five things (the snapshot,
    else the TL;DR), each opening what the agent saw and the closest posts, the short version, what changed (the
    first shift open, its evidence opening the post), notable developments, themes (each opening the Intel Tracker on
    it) and topic watch, the content handoff, the posts behind the brief (sortable by engagement; a row opens the
    Intel Tracker's post panel), the review, and the rail with the numbers at a glance.
  - Ads: the same bar, a note when the brief is more than 21 days old, the five things with the ads closest to each,
    the angle and the organic brief it was built with, the creative structure (the copy formula and the hooks, each
    with where it was seen, from the snapshot's hook sources), offers, pains and objections, other markets, the test
    plan, the ads behind the brief (a row opens the Ad Library) and the signal quality numbers.
  - Combined: six cards (angle, audience, hook to test, offer, proof, call to action) from the newest approved brief
    of each kind, else the newest, and the company profile; then the creative briefs Content Transformation wrote from
    the team's own material, each with Approve and Request changes.
  - Approve and Request changes (`decideBrief`): an agent_feedback row (target_type brief_approval, target_id the run
    or `content:<request id>`, agent intel_tracker, ad_strategist or content_generation, action approved or changes,
    the reason as feedback, author the teammate's email), the rows Approvals writes and AI settings reads. On an
    organic or ads brief Request changes opens the editor, whose Leave a note instead asks what should change (the
    old page did both); on a creative brief it asks what should change first.
  - The team's layout (`layoutOf`): the sections in its order, those switched off left out (the record, the evidence
    and the review cannot be), and its options (how many five things, shifts, developments, hooks and offers; short or
    full reasons; topic watch). A section the team added to the layout says it is counted in the current dashboard. A
    saved review (the brief editor's) hides its sections too, and the bar says who edited the brief.
  - The three review checks are kept in this browser (localStorage `ap.nw.brchk`, as the current dashboard; the two
    apps do not share them). `briefs-parts.tsx` holds what the tabs share (the bar, a section, the rail, the review).
  - Structure (part 2c, `briefs-structure.tsx`, `saveLayout`; v111StHtml): the record bar's Brief or Structure. Every
    section of the kind in its order, shown or hidden (the record, the evidence and the review always in; an ads
    brief's creative structure is needed for drafts), moved up or down (the record and the five things lead, the review
    closes), its options (how many, detail, topic watch), the sections a team can add (Added, Take it out), Standard
    layout, Cancel and Save layout. Saved for the team in ai_settings `brief_structure` ({org, ads, updated_by,
    updated_at}; the other kind's layout is kept as it was), read fresh before the save and cleaned (`cleanLayout`:
    known sections, locked ones never off, options with one of their choices). Another tab opens on its brief again.
  - The brief editor (part 2c, `src/lib/pipeline/brief-edit.ts` pure rules, `briefs-edit.tsx`,
    `src/app/(app)/briefs/edit-actions.ts`; v111EdStart, v111EdHtml, v111EdSide, v111EdSave, v111Restore): Edit (or
    Request changes) on an organic or ads brief. A card per section, each row with Edit (its own fields, `FORM`; the
    same words close it, all empty is refused), Remove and, for a post or an ad, Open; Remove section, except the
    sections drafts need and the evidence (single posts or ads come out instead). Removing a post takes it out of the
    brief's lists, topic watch and developments and flags the shifts and lines that quoted it; removing an ad takes it
    out of `source_ad_ids`; the last hook stays. Each change has Undo (the bar, and the message); the bar holds Edit or
    Preview, the count, Undo, Discard (asks when there are changes) and Save changes; the head has the note for the
    record and Leave a note instead. Preview draws the brief as it now stands, every list in full, and the review card
    waits for the edit. The editing state is the page's (`useEditor` in BriefsView): it stays open while another tab
    is looked at, and another brief's Edit asks before dropping it.
  - Save (`saveOrgEdit`, `saveAdsEdit`), as the teammate: an organic brief's words, data (with the review) and
    `edited_by_human` on its intel_brief row, its five things on the run's snapshot row; an ads brief's changed columns
    on creative_briefs (lists kept as JSON text stay text) and the review on the run's Ad Strategist rows. The review
    (`reviewNew`) keeps who, when, what changed (`sumOf`), the note, the sections taken out, the posts or ads removed,
    the agent's own version from the first edit and the last 12 edits. An `edited` decision in agent_feedback (the
    summary and the note) sends the brief back to Needs review, and the decision line says who edited it. Put back the
    agent's version (`restoreBrief`, asks first) writes the kept version back, drops the review and leaves an edited
    decision, "Put back the agent’s own version."; a kept version without its words leaves the words as they are.
- Changed on purpose on the Briefs (reported to Kser): a section the team added to the layout points to the current
  dashboard instead of being counted here; a brief
  older than the newest is read on its own (the old page opened the newest); the tab and the brief are in the address;
  the Call to action card names the action as the company profile does, Book a call when the offer has none (the old
  page showed the stored word, such as call); an angle is quoted from double quotes only (the apostrophe in firm's
  could start a quote); "uploaded by your team" is said once per ad; a shift from the brief's own list no longer
  repeats its note as the reading; a pattern from another market kept as an object reads as its words; the copy
  formula's arrows are spaced once; an ad opens in its own panel on the Ad Strategist here (`/ad-strategist?ad=<id>`;
  one with no record opens in the Meta Ad Library), and "See every ad from this run" opens that run's ads there;
  Combined reads personas, offers and proof directly (the old loader rewrote house rules as it read); Approve cannot
  save twice on a double click; the brief links on Approvals, Today, the Intel Tracker and the Overview open the brief
  here, at its run.
- The Ad Strategist (part 2a, `src/lib/pipeline/ad-strategist.ts` pure rules, `ads-load.ts`,
  `src/components/pipeline/ads-*.tsx`, `src/app/(app)/ad-strategist`; NW_PAGES['e3.ads'] as v109, v111 and v113 left it,
  with v99's "which brief an ad went into"):
  - What it reads, as the teammate, fresh on every visit: the 1,000 newest ads (`winner_creatives`, a view of every
    ad_records row), the Ad Strategist's brief rows (agent_outputs ad_strategist creative_brief, for section 8 of their
    markdown) and its ads briefs (creative_briefs, one per run, the twelve newest), its runs (`runs`, agent
    ad_strategist), the snapshots of those briefs, who it follows (`competitors`), the team settings agent_runs,
    ads_follow, ad_industries, ad_industries_ai and ad_runs, the company profile and the ad copy written from uploads
    (agent_outputs ad_copywriter). An ad asked for in the address that is older than the 1,000 is read on its own.
  - The address: `?tab=` (top when none; the old words winners, swipe, copy, brief and follow still work), `?ad=` (the
    open ad), `?brief=` (the Takeaways brief when not the newest, read on the server) and All ads' filters (`st`, `adv`,
    `ind`, `run`, `cap`, `sort`); search starts afresh. A run with no ads among those read shows the ads in a brief, as
    the briefs page's link did.
  - The header: a run started (for 45 minutes, until a newer run or brief lands), the last run and how long ago, Runs
    after each Intel Tracker run (agent_runs.ads.after_intel), Upload ads, Run now, what it does and five numbers that
    open the list they count (a number clears the search, as the old one did not).
  - The industries banner on Top and All ads (some advertisers with none: Suggest them, Set by hand). Once per browser
    tab (sessionStorage `ap.ads.indAuto`), as the old page did once per page load, the page asks the industry agent
    (Engine 3 · Advertiser Industries, `e3-ad-industries`) for the advertisers with none; the server works out which,
    from the settings read fresh, and keeps the answers in `ad_industries_ai`.
  - Top: the n best scored Ad Library ads (agent_runs.ads.top, 5 when none, 3 to 10), real copy first when there are
    enough, at most two per advertiser; Top 5, 8, 10 and the team's own number; How the score works.
  - All ads: search, Still running and Uploaded, Advertiser, Industry, Found in and Captured in, eight columns that
    sort, 20 at a time; each ad's line says which brief it went into, or why not (`whyShort`).
  - Uploads: what they show (patterns, takeaways, offers, the average fit), the cards and the ad copy sets (search, ten a
    page, each opening in place with Copy). Upload ads, Build a brief from these and Write ad copy open their windows
    (see Runs & uploads and the windows below).
  - Takeaways: the brief's five things (its snapshot, else four hooks and a pain), each with the ads closest to it in a
    side panel, the short version, a brief picker and an old brief's warning. Run library: the twelve newest runs with
    their rule, numbers and lead finding; Open takeaways, Its ads, Brief.
  - An ad in full (`ads-panel.tsx`): the preview, key takeaways and how it fits the strategy (the findings of the six
    newest briefs it backs), the offer, the score and its four parts, the fit with what the team follows, the briefs it
    went into (with the pick and the brief's rule) or why not, the copy (Copy the copy), its patterns, Next ads brief
    (`ad_records.in_brief`) and its details. Change the score keeps 0 to 100 on the ad (`performance_score` / 100,
    `score_overridden`) with an agent_feedback row (`performance_score_override`, "Score manually set to N (was M)").
    Read this ad (an upload not read yet) sends it to the analyzer again; Utilize this ad copy opens Marketing
    Generation in the current dashboard. An ad's link is named for where it goes (`linkLabel`: the Meta Ad Library,
    LinkedIn, or View the ad).
  - Following: the accounts followed for ads (`competitors` with a Facebook page, not posts only): Add an account,
    Ads only or Ads and posts, Stop following or Stop reading ads (asks first), and those followed for posts only (Pull
    their ads too, Add page); the searches and filters (ai_settings `ads_follow`: keywords up to 10, industries up to 8,
    ad types, running now or not, country), saved with Save; what each advertiser sells, with Suggest the missing ones
    and the window that sets them (`ad_industries`).
  - Run now: Start a run calls Engine 3 · Ad Strategist's `ad-strategist-run` with the team's limits and keeps the run
    for the team in ai_settings `ad_runs` ({runs: [{run_id, names, t, by, cascade}]}); From the ads you uploaded's Pick
    ads opens the build-a-brief window.
  - Writes go to `ad_records` (the table under the view) and `competitors` as the teammate; both take a team account's
    update.
- Changed on purpose on the Ad Strategist (reported to Kser): the tab, the open ad and the filters are in the address;
  a run still going says so (the old page said it did not finish); runs are the Ad Strategist's own (the old page took
  the 40 newest runs of every agent); a number above the tabs clears the search; an ad switched out of the next brief
  says so on any ad (the old page said it only on uploads); no price stored no longer reads as free; Change the score
  works on 0 to 100 as the page shows scores (the old window worked on 0 to 1), saves as the teammate and checks the
  ad took it, and the next-brief switch checks too; the Top choices include the team's own number; All ads with no ads
  says so (the old page said "Nothing matches"); the score's text says 0 to 100; the industry agent gets no catalog
  template words or "Untitled ad"; the industries window saves only the boxes changed, so an agent's suggestion left
  alone stays the agent's, and an emptied box removes the agent's too (the old window saved every suggestion as the
  team's and could not remove one); adding an account keeps what was typed when it fails and finds the account by its
  id for Add page; the searches' Save keeps its message; an ad opened from another page opens here
  (`?ad=<id>`), and one not found says so.
- Runs & uploads (part 2b, `src/lib/pipeline/uploads.ts` pure rules, `runs-load.ts`,
  `src/components/pipeline/runs-view.tsx`, `src/app/(app)/runs`; apRenderHistory and apHistBody with the Intel rows its
  wrapper adds):
  - What it reads, as the teammate, fresh on every visit: the team's uploads (winner_creatives with `uploaded_by`, 300),
    the ads briefs built from them (agent_outputs ad_strategist `agent2_custom_*`, 100), the ad copy sets
    (ad_copywriter, 100), the campaigns (low_ticket_content, 60; listed only when built from a brief made from uploads),
    every Intel Tracker brief (40) and who started each run (`runs`), the custom Intel runs still reading (ai_settings
    `intel_runs`), the campaigns started from here (ai_settings `campaign_runs`) and who the Ad Strategist follows (for
    the upload window's question). A read that fails says so above the list.
  - The page: Build ad strategy and New Intel run (the Intel Tracker's Run now window); the campaign banner; the newest
    ads brief built from uploads, with Send to Marketing Generation; four numbers (uploads, strategies, content runs,
    Intel runs: custom and by the agent) that open their tab; the tabs (All, Intel runs, Uploaded ads, Strategies, Ad
    copy, Content runs) in `?tab=`; Add competitor ads; search (the titles, the line under them and the start of each
    brief's text, 6,000 characters), 12 rows a page. Titles read as the old page showed them (`tidyTitle`: dashes as
    dots, a date at the end left to the date beside it, Creative Brief as Advertisement brief).
  - A row opens in place: an upload (its pictures, hook and takeaways, Open the ad on the Ad Strategist, Read this ad
    when not read yet), a strategy (its hook patterns, Open the brief on the briefs page, Send to Marketing
    Generation), a set of ad copy (the variant cards, `copy-cards.tsx`), a campaign (its ad images, Open in Marketing
    Generation in the current dashboard), an Intel run (custom or by the agent, the first three points of its TL;DR,
    Open in Intel Tracker), or one still reading.
  - Send to Marketing Generation (`startCampaign`): the Low-Ticket Ads Content Agent's `e3-low-ticket-run` with the brief
    (the newest built from uploads when none is named) and who asked. One at a time for the team: a campaign started in
    the last 15 minutes that has not landed holds the next one back. Kept in ai_settings `campaign_runs` ({runs:
    [{brief, t, by}]}, a week). The banner says it is running (the page checks back every 30 seconds), written (a
    low_ticket_content row from that brief, created after the start) or not seen after 15 minutes; Dismiss hides it in
    this browser (localStorage `ap.campaign.dismissed`).
- The windows (part 2b, `upload-window.tsx`, `brief-window.tsx`, `copy-window.tsx`, `copy-cards.tsx`, and
  `src/app/(app)/ad-strategist/upload-actions.ts`), opened from the Ad Strategist (Upload ads, the Uploads tab, Run
  now's Pick ads) and from Runs & uploads:
  - Add competitor ads (apOpenAdUpload with v113's question): screenshots dropped, chosen or pasted (pictures only, 8 MB
    each, 10 at most), Each screenshot is a separate ad, the advertiser (suggested from who is followed and the
    advertisers seen), the platform, the ad link (a web address; a bare one gets https), the copy, and Use these in the
    next ads brief. Each ad's pictures go from the browser straight into Storage (bucket creatives,
    `uploads/<day>/<id>.<ending>`) at addresses the server signs as the teammate (`startAdUploads`); then
    `saveUploadedAd` sends them to Engine 3 · Ad Upload Analyzer (`ad-upload`, mode analyze) and saves the ad_records row
    (`adRowOf`: source swipe_file, run upload_<day>, uploaded_by the teammate's email, in_brief; an ad the analyzer
    cannot read is saved as not read yet). The table takes a link once: only the first ad of a batch keeps it as its Ad
    Library link, and a link already there goes in under an upload id with the link kept as where the ad goes. Then, for
    an advertiser not followed for ads and not set aside in this browser (localStorage `ap.v111.nofollow`, the current
    dashboard's key), Follow them too? (`followForAds`; Not now sets them aside), with the upload's log under it. On the
    Ad Strategist the new ad opens on the Uploads tab; on Runs & uploads its row opens.
  - Read this ad (`rereadAd`): the analyzer reads an upload again; what it does not say keeps the old value, and the
    format and the stage are values the table takes.
  - Build an ad strategy from your uploads (`briefChoices`, `buildBrief`): the team's read uploads (ticked unless
    switched out of the next ads brief) and, if ticked, the high-value Intel Tracker findings of the last 30 days (the
    newest 25), to Engine 3 · Custom Ad Strategy (`ad-brief`), which answers with the brief it saved (`agent2_custom_…`):
    its angle and hook patterns, Open the brief (`/briefs?tab=ads&run=`) and Send to Marketing Generation, which goes on
    to Runs & uploads.
  - Write ad copy (`copyChoices`, `writeAdCopy`, `saveAdCopy`): the read uploads (else up to 12 Ad Library ads with a
    hook), the platform, 2 to 5 variants, the guidelines on file (guide_files with readable text), the brand voice and
    the offer (`offerOf`: the team's default offer, else its newest; the old page's own when there is none) to the
    analyzer's copy mode; Copy all, Save to Pipeline (an agent_outputs row: agent ad_copywriter, run
    `adcopy_<YYYYMMDDHHMM>`), then ✓ Saved · view in history.
- Changed on purpose on Runs & uploads and the windows (reported to Kser): a campaign started from here is kept for the
  team (the old page kept it in one browser) and one runs at a time for the team; its wait ends only on a campaign from
  that brief (the old one ended on anyone's); Dismiss hides the banner in this browser only; a read that fails says so
  (the old page showed an empty list); search reads the start of each brief's text, not all of it; upload rows say Read
  this ad, as the ad panel does (the old row said Analyse again, and on a fresh load it did nothing); a re-read keeps
  values the table takes; an upload from Runs & uploads stays there and opens its row (the old one jumped to the Ad
  Strategist); the upload's log stays on screen during the follow question (the old window replaced it, so an ad the
  analyzer could not read went by unseen); the ad link has to be a web address (a bare one gets https; the old page
  saved any text); the build-a-brief window starts with uploads switched out of the next ads brief unticked, names
  catalog ads instead of showing their template words, reads the newest high-value findings (the old one read 25 in no
  order) and builds one brief per window; Write ad copy writes for the team's default offer from the offers table (the
  old page always sent its own copy of it, the same offer today) and says when it learns from Ad Library ads; brief rows
  say Open the brief (the old Open in Ad Strategist opened the briefs page anyway); an ad's link is named for where it
  goes (the old panel called every link the Meta Ad Library); the copy sets show the picture and the pattern under the
  names the copy writer saves them by (the 2a port read other names and showed neither).

- Changed on purpose in the brief editor (reported to Kser): an ad's Open in the editor opens the ad in a new tab, so
  the edits stay (the old one opened its panel in place); Put back says so when a brief has no agent's version kept
  (the old page stopped without a word) and, for an organic brief kept without its words, leaves the words alone; a
  save that fails says why in the editor, which stays open (the old page did too, with the error's raw text); the
  Edit and Preview buttons are a group of their own, named Editing view.
- Landing pages (part 3a, `src/lib/pipeline/landing.ts` pure rules, `landing-load.ts`, `src/components/pipeline/landing-*.tsx`,
  `src/app/(app)/landing-pages`, `src/app/preview/landing/[id]`; v115 as v116, v120, v121 and v123 left it):
  - What it reads, as the teammate, fresh on every visit: the 200 most recently changed pages (`landing_pages`), the
    1,000 newest sign-ups (`lp_signups`; never their answers, referrer or address hash) and the visits of the last 30
    days (`lp_views`).
  - The page: how many pages are live, Refresh and Put a page live; four numbers (live, visits and sign-ups in 30 days,
    and the rate: sign-ups in 30 days over visits); Pages and Sign-ups, the tab in the address (`?tab=signups`). A page:
    its address on aiparagon.vercel.app/go (a link once live), its state, kind and numbers, Ad links (a page with ads),
    Copy link (live) and Edit.
  - Sign-ups: when, who, the page, where they came from (the ad's code and source, else Direct), HubSpot (Added, Not
    added with why, Waiting) and Open lead (the lead's page here) for one added to the pipeline; search (name, email,
    company, job title, ad code, page), 200 at a time, and Export CSV of what the search shows (a cell a spreadsheet
    would run as a formula starts with a quote mark).
  - Put a page live (the picker; `?new=1` opens it once: Today's quick start): the 40 newest funnels and book-a-call
    campaigns (`funnel_packages`), where each stands (approved by its status, or a book-a-call campaign whose ad images
    are all approved; a Funnel Builder package sent back reads Sent back) and its page if it has one (Open its page).
    Use this (`makePage`, on the server) builds the page from the campaign (`pageFrom`: its main step and the step after
    sign-up, the link after sign-up from where Marketing Generation saved it, the form's fields, a book-a-call
    campaign's survey questions, the ads with a code each, P and four letters then -A1, -A2…), at an address from its
    name that no other page uses, as a draft carrying the campaign's review flags.
  - The editor (a side panel): the name, the address (a warning once it has been live), the top of the page (When and
    Who presents for a webinar or when filled, How often for a newsletter or when filled, Proof when there is some),
    sections and questions people ask (an unfinished one is left out on Save, and the message says so), the form's
    fields (the email always), the campaign's qualifying questions (on or off), the button, after sign-up (the link a
    book-a-call page and a download need), the lead pipeline switch, and the review flags with I checked these (ticked
    for a page that has been live). What still holds it from going live ([ADD…] and [FILL IN…], by box) shows at the top.
  - `savePage` (as the teammate) reads the page again, checks the address (3 to 60 lowercase letters, numbers and single
    dashes; no other page's), reads the boxes back onto the stored content (`contentFrom`: other keys kept, each box cut
    to what the page shows, the questions only switched), runs the checks before a page goes or stays live
    (`goLiveProblem`, in the old order), and on Put it live reads the campaign behind it: not approved, the first click
    says so and the button becomes Approve and put it live; that click sets the package approved, adds an
    agent_feedback row (target_type funnel_package, "Approved by putting its landing page live (/go/<page>)", author
    the teammate's email) and puts the page live (`published_at` the first time). Pause, Save, and Delete (a draft
    that never went live, asking first; the database keeps any other). A page that goes live with ads opens its Ad
    links.
  - Ad links: each ad's code, its hook, and its link for Meta, LinkedIn and a post (the page's address with
    utm_source, utm_medium paid or organic, utm_campaign the page and utm_content the code), each with Copy; a page
    that is not live says what its links show.
  - Preview saves first, then opens a new tab: a live page on the public page with `?preview=1` (which counts no
    visit), any other page at `/preview/landing/<id>` here, drawn from its row as go.html draws it
    (`landing-preview.tsx`, the `.lp` rules in `globals.css`: the preview line, the brand from the newest company
    profile as lp_public reads it, the top of the page, the form, whose button only says sign-ups are off, the sections,
    the proof, the questions and the footer), with the tab's title from `generateMetadata`.
- Changed on purpose on Landing pages (reported to Kser): Preview of a page that is not live opens here (go.html reads
  a draft only with the current dashboard's own sign-in, kept in that site's browser storage), and a page that is gone
  says so with a link back to Landing pages; Today's quick start opens the picker on Landing pages (the old one opened
  it over Today) and Today's sign-ups open the Sign-ups tab; a save checks the address against every page in the
  database (the old page checked the pages it had loaded); a page's code is made on the server from a strong random
  source, and if another page took the address meanwhile the next one along is used; Delete says when the database
  kept the page (a draft that went live meanwhile; the old page said Deleted); the tab is in the address; the Refresh
  and Put a page live buttons sit together on the right.
- Ad Testing (parts 3b and 3c, `src/lib/pipeline/ad-testing.ts`, `strategy.ts` and `ad-testing-import.ts` pure rules,
  `ad-testing-load.ts`, `src/components/pipeline/testing-*.tsx`, `src/app/(app)/ad-testing`; NW_PAGES['e3.testing']
  with v98, v106, v113, v115 and v116 in the current dashboard):
  - What it reads, as the teammate, fresh on every visit: the 500 newest results (`content_results`, by the day posted,
    newest first, then when they were saved), the 12 newest strategy reads and what the next one would read (below),
    the reads started from the dashboard and what became of them, what is remembered, and the landing pages that have
    been live with their sign-ups and visits of the last 30 days.
  - The header: a strategy read running, the newest read's day and how many results are logged; Import a CSV and Log a
    result; six numbers (posts and ads logged, the ads' spend, leads, clients won and revenue), each opening Results or
    the Leaderboard. The tab is the address's: the Strategy read at a bare address, `?tab=results` and `?tab=board`
    (the old word insights is the Strategy read); `?log=1` opens Log a result once (the Pipeline Overview's quick start
    sends `?tab=results&log=1`).
  - The sync line, once the page is on screen (`syncStatus`: Engine 3 · Ad Results Sync, action status): where the daily
    Meta and LinkedIn numbers come from and the last sync, with Sync now (action sync; "3 ads updated" or "Nothing new
    to sync"); not connected, Connect on Integrations (the current dashboard); the workflow off, it says so.
  - Results: the landing pages' sign-ups by ad code (visits, sign-ups, the rate, the spend matched by the code in the
    ad's name over the same 30 days, its synced numbers when it has any, else what was logged, never both, and the cost
    per sign-up), how the results came in (by hand, imported, from a CRM export, synced), what is working and what is not
    yet (by cost per lead against the middle of the ads with spend, or by return once revenue is logged), then the ads
    and the posts, each with its day, where and how it came in, its link (a web address only), its note, and Edit and
    Delete unless it is synced (the next sync would undo them; the server refuses both too). Download the template.
  - The Leaderboard: the leading ad, cost per lead as bars (lower is better), every ad ranked (return on spend, then what
    a client won, a booked call, a qualified lead and a lead cost, then the most spent) and the posts by engagement.
  - Log a result (`testing-log.tsx`, `saveResult`): an organic post or an ad; the piece it was (a book-a-call or
    low-ticket campaign and which of its ads, which also saves the ad image's file; a draft; a library piece); the title,
    where, the day posted, a link, the platform's numbers as they are (spend, impressions, reactions, comments, shares,
    clicks, leads, qualified leads, booked calls, clients won, revenue: those of the kind) and what the team noticed.
    The server checks it as the old form did (`resultFrom`, in the same order and words) and saves it as the teammate
    (a new one attribution manual, created_by and updated_by the teammate's email). Edit opens the same window; Delete
    asks first.
- The Strategy read (part 3c, `strategy.ts`, `testing-read.tsx`, `read-actions.ts`; nwTsReadHtml, nwTsReadCard and
  nwTsReadsHtml as v107 left them, with v98's run and reference chips, v106's Remember and v113's daily read):
  - The read on screen (the newest, or one picked from Earlier reads, kept by its id): its day, then Daily read or who
    asked; the headline, what was asked and the review flags; Why, Fits your offer and Gaps (the vision fit's gaps, else
    what is missing); Make next, each with its priority and kind, Why (the reason, the angle and its sources) and
    Create, which opens Marketing Generation (a campaign or an ad) in the current dashboard, or New draft here filled in
    from the read (since 4b, `readHref`: the kind, then from the material the title and the angle as the takeaway, or
    an idea of the title and the angle, and the line "Filled in from the strategy read…");
    and More from this read (Double down and Change or stop, each line with Remember; the content mix; what is missing
    when the gaps were given). The read's [CODE]s are chips naming what it read (Organic brief, Ad brief, Campaign
    6 Nov, Draft, Library, Idea, Ad result, Post result; the whole name on hover); a code the read does not name is
    left out. A source opens where it lives: a brief on the briefs page at that brief, a result on Results, a draft on
    Content Transformation's Drafts at that draft, a library piece or an idea on its Ideas (since 4a), a campaign on
    Marketing Generation in the current dashboard. The Drafts, Library and Open ideas chips open those tabs here.
  - What it read (the chips over New read): Voice (a brand_voice row), Offer and context (ai_settings brand_context: an
    offer, a difference or claims to avoid), Campaigns (the runs of agent_outputs funnel_package), Drafts, Library and
    Open ideas (counted), Post results and Ad results (the page's), Briefs (the newest organic and ads briefs' days);
    what is missing is marked.
  - New read, with Anything to focus on? (`startRead`): Engine 3 · Strategy Insights (`e3-strategy-insights`) gets the
    focus and who asked and answers at once with the run id (or "Not enough to read yet…", said on the page). The run is
    kept for the team in ai_settings `strategy_runs` ({runs: [{run_id, t, by, focus}]}, a day of them); a read started
    in the last five minutes that has not landed holds the next one back. While it runs, every teammate sees Reading
    your content and results and the page checks every 5 seconds, on any of its tabs (`useStrategyRun`, `checkRead`),
    for the read, or the row n8n saves when it cannot make one (strategy_insights_error, its data.error said on the
    page for half an hour). After five minutes
    it says it is taking longer and checks every 30 seconds, for half an hour.
  - Remember (`rememberLine`, v106Remember): the line, without its codes, goes first in ai_settings e3_prefs.memory
    ({id read:<read id>:<dd|cs>:<n>, text "Double down: …" or "Change or stop: …", at, by}, 40 at most; the rest of
    e3_prefs is kept), then the post writer's house rules are made again from the list (ai_rules source
    profile:memory, category Other, for content_generation, as few rules as fit 900 characters, "The team asked to
    remember: …"), the new ones in before the old ones come out.
- Import a CSV (part 3c, `ad-testing-import.ts`, `testing-import.tsx`, `import-actions.ts`; v106ImpOpen to v106ImpGo):
  - The file is read in the browser (3 MB, 5,000 rows at most; commas, semicolons or tabs; quotes; the header is the
    first line naming two columns we know, so a report line or two before it is fine). Which column holds what is
    guessed from the headers and can be changed. A file of people with a stage and no spend or impressions is read as a
    CRM export: one row per lead, each stage guessed (Lead, Qualified, Booked a call, Became a client, Leave out; a booked
    call is qualified too) and changeable, forty shown. Numbers and days are read as the file writes them (a decimal
    comma, the day first, no day after today).
  - A results file becomes one result per ad or post, day and platform (two ad sets added together); a CRM export, the
    leads, qualified leads, booked calls and clients won of each ad. Each row matches a result logged here (the same
    kind and name, the same platform when both say; the same day, else the only one with no day; for leads, the one
    logged nearest before), never one synced from the ad platforms. The first six rows show what will be written and
    which update a result already logged.
  - Import reads the results logged again (`importExisting`), then sends the rows a hundred at a time (`importChunk`,
    every row checked again on the server): a new one with attribution csv (crm for a CRM export) and created_by the
    teammate, a matched one with only the numbers the file gives. A stop says how many went in, and Try again matches
    those. The window stays open while it writes.
- Changed on purpose on Ad Testing (reported to Kser): the sync line says when the ad platforms could not be checked
  (the old one said to connect them); a synced result cannot be changed or deleted from the server either (the old page
  only hid the buttons); the Overview's Log a result opens Results here with the form. In 3c: the daily read says Daily
  read (the old page said "asked by Daily read": v113 changed a function the page no longer drew); a read started is
  kept for the team, one runs at a time for the team, and a read that failed or is taking longer says so to every
  teammate (the old page kept a read started in one tab); Create opens Marketing Generation without filling it in, and
  a campaign opens its page, not the item (those are still in the current dashboard; New draft is filled in since 4b); the import never matches or changes a synced result (the old one could, and the
  next sync then counted that ad twice), so a row for such an ad comes in as a new result; the import's preview gives
  the day of a matched result for a results file too; a stage written with a curly apostrophe ("Won’t buy") is a lead,
  not a client won; the newest read's day in the header has the year when it is not this one.

- Content Transformation (part 4a, `src/lib/pipeline/content.ts` pure rules, `content-load.ts`,
  `src/components/pipeline/content-*.tsx`, `src/app/(app)/content-transformation`; NW_PAGES['e3.create'] as v110 to
  v127 left it, with v97's drafts, v113's formats and cards, v126's What should change? and the content library):
  - What it reads, as the teammate, fresh on every visit: the 60 newest content requests and drafts (agent_outputs
    content_generation content_draft), the drafts' reviews (agent_feedback draft_review, by draft), the library
    (content_pieces not archived, 200), the team's ideas (idea_notes, 200), the newest organic brief with its snapshot,
    and the days of the briefs each draft was packaged with (by their runs).
  - It lists the drafts made from the team's own material. One made from the briefs (its source_type, or its request's,
    is brief) is Marketing Generation's (v97DraftOrigin, `draftOrigin`); a link to one here says so.
  - The head: Writing N drafts (requests running for under 12 minutes) or Ready, and N drafts to review (not marked
    ready); the three caps; New draft. The tabs: New draft at a bare address, Drafts (`?tab=drafts`, with
    `?draft=<id>`), Ideas (`?tab=ideas`); the old words library, requests, voice and how are carried over.
  - New draft: see New draft below (4b).
  - Drafts: the requests still being written or that did not finish (8 at most: Queued, Reading, Writing, Not picked up
    after 4 minutes, Did not finish with the request's error), with Try again (`retryRequest`: back to queued, then
    Engine 3 · Content from Source's `e3-content-run` with request_id and requested_by; a workflow that does not start
    leaves it queued and its row says why); the drafts, newest first, each Ready or Needs review; the picked one's
    review under the list: what it was made from and became, the title, the source line and See the creative brief
    (`/briefs?tab=combined&creative=<request id>`, which opens that creative brief's panel there), the hooks or subject
    lines, the draft as it reads (a deck, script, clip plan or event kit with two or more "Slide 1:" style lines as
    cards), where each part came from, Edit and save to library (Open saved piece once kept), Copy this version, Copy
    all hooks, Download .txt; the four checks and Mark ready (`markReady`: agent_feedback draft_review ready with the
    checks as JSON, once per draft); the agent's flags; What should change? (`askDraftChange`: the reasons and the note
    as one sentence that starts with the kind, as v126 saves it, which the next drafts read) and how many changes were
    asked (to AI settings, in the current dashboard); How this draft was made, folded behind Show.
  - While a request is being written the page reads its data again every 5 seconds (`html[data-check-back="on"]`),
    and says when one is ready or failed.
  - The library piece editor (`savePiece`, `archivePiece`; apCpEditor): a draft kept as a piece (the hook on screen
    first) or a piece changed or archived. A draft already in the library opens its piece, and saving a draft twice
    changes the same piece.
  - Ideas: the newest organic brief's five things (its snapshot, else its TL;DR), the team's open ideas with Add an idea
    (`addIdea`) and delete (asks first, `deleteIdea`), and what the team has given the engine (the library's pieces,
    which open in the piece editor, and earlier requests' material, once by title, six then all). Draft this, Use and
    Add a piece open New draft here, filled in (since 4b).
- Changed on purpose on Content Transformation (reported to Kser): a newer format (a report, a deck) is named as such in the list, the
  review and the download (the old list called a report a Newsletter); a draft made from a report, a presentation, a
  video or a call names it (the old page said Your source); the line under a draft's title reads the same whichever
  parts it has (the old one fell back to "Primary signal: …" when a draft had no supporting brief); "2 stories" (the old
  page said storys); the briefs a draft was packaged with are found by their runs, so an older draft's brief shows its
  day (the old page looked among the newest ten and twelve and said Earlier brief); the reviews read are those of the
  drafts on screen (the old page read the 300 newest); Mark ready is saved once per draft, and saving a draft to the
  library twice changes the same piece; Try again checks the request is still on file and not written already; a
  draft's or a failed request's link from Approvals, the Overview or a strategy read opens it here, and one made from
  the briefs goes to Marketing Generation (the old Approvals sent both to Content Transformation, where a draft made
  from the briefs is not listed); Write a post on the Intel Tracker and the Overview opens Marketing Generation, as the
  current dashboard does (the earlier ports sent it to Content Transformation).
- New draft (part 4b, `src/lib/pipeline/content-new.ts` pure rules, `loadForm` in `content-load.ts`,
  `src/components/pipeline/content-new.tsx` and `content-new-preview.tsx`, `sendRequest`, `readLink` and `materialFor` in
  `src/app/(app)/content-transformation/actions.ts`; nwCtFormHtml, nwCtSide and nwCtSend as v105, v111, v113 and v126
  left them):
  - What it reads besides the page's own (`loadForm`, never v104SyncDerived, which rewrote house rules as it read): the
    personas (oldest first) and offers (newest first) not archived, the proof, the newest voice, the team's templates
    (doc_templates, active), the briefs' layout (ai_settings brief_structure), the changes asked on drafts in the last
    120 days with each draft's kind, and the briefs a draft can lead with (the 10 newest organic, the 12 newest ads
    briefs) with the decisions on them, and the five things of the organic one it leads with.
  - 1 What are you making?: the tiles in five groups (14 kinds; `KINDS`, `GROUPS`) and the categories (`CATS`: they set
    the kind of post for LinkedIn post and Newsletter, the ad type for Paid ad; Email has none). 2 Your material: the
    tabs Upload and Fathom call (since 4c, below), Paste (Source text with its word count, Read link, Try it with a
    sample article) and New idea; What is this
    material?; the line for a file's or a call's text. 3 Details: Who is it for? (the persona chips, Anyone who follows
    us, + New persona in the company profile), the kind's questions and Topics (`QS`), Core takeaway or Proof or
    example, Must use (chips; the first three approved proof items and the default offer suggested), Anything else?,
    More options (Voice and its hint, Structure: the usual shape, the simple shapes, Your templates; What are we
    offering?; What should they do?; Source title). The steps number themselves; 4d puts the briefs' findings second.
  - The side: You’ll get, It will use (the brief it leads with: the newest approved, else the newest, Approve while it
    waits, Open once decided, its age past 21 days; the material; the voice; what was asked on earlier drafts), Generate
    (300 characters of material or 60 of an idea), the line under it, See everything it will use (`previewOf`, from the
    same pieces as the request), and the draft on its way (Writing, Draft ready with Review it, did not finish with Try
    again).
  - Generate (`sendRequest`): the form is checked on the server (`formFrom`), what it uses is read fresh, and
    `buildRequest` writes the content_requests row as the current dashboard's wrappers wrote it (the setup in their
    order: type, persona, offer, call to action, angle, source, must use, feedback, questions, notes, format label,
    category; the template: the kind's shape or the one picked, its rules, who it is for, the offer, what it must use,
    the answers and notes in the description, what the briefs' layout leaves out first). A saved template counts a use;
    a team idea drafted from Ideas is marked used (with the request) when the idea that goes out still has its opening
    words; then Engine 3 · Content from Source is asked (`e3-content-run`). After a send the material, the idea, what it
    must use, the notes and the typed answers go; the kind, the choices and More options stay.
  - Read link (`readLink`): Engine 3 · Read a Link (`e3-read-link`), with the current dashboard's messages.
  - Filled in from the address, once, then the address goes back to bare (`prefillOf`, `newDraftHref`): `kind`, `src`,
    `idea`, `note` (a team idea), `use` (`piece:<id>` or `req:<id>`, read by `materialFor`), `title`, `take`, `call`
    and `link` (a Fathom call and its share link, since 4c), and `from=read` (the strategy read's line). Ideas' buttons
    write it with replaceState; Today, the Overview, the briefs page's Start from your own material, the strategy
    read's Create and Calls' Use as content source link to it.
  - The form stays mounted (hidden) on Drafts and Ideas, so what was typed is kept while another tab is looked at.
- Changed on purpose on New draft (reported to Kser): a carousel or video ad keeps
  the team's answers and notes after its own shape (the old page put the shape over them, so they were lost); after a
  send the typed answers (topics, who gets it, the event's date) empty with the notes; a team idea is marked written up
  only when the idea that goes out still has its words (the old page marked it on the next idea sent, whatever it
  said); pasted text is kept to 120,000 characters, as text from a file or a call always was; a brief undone or edited
  reads Needs review with Approve (the old row said Changes asked), as Approvals counts it; Paid ad's What should they
  do? no longer follows the kind picked before it; a template for anything else can be picked under Something else
  (it could never be picked); See everything it will use is built from the request (the old one ignored the answers,
  notes, must use and feedback, and showed the organic brief and the last kind of post for a paid ad); Read link's
  messages say "add it on the Upload tab" (the old ones said "drop it above"); the toast after a workflow that did not
  start says Try again from Drafts (the old one named Your requests); Today's and the Overview's Turn content into a
  post, the briefs page's Start from your own material, Ideas' Draft this, Use and Add a piece, and the strategy read's
  Create open New draft here.
- New draft's material and Fill it in for me (part 4c, `src/lib/pipeline/content-files.ts` and `content-fill.ts` pure
  rules, `withMaterial` in `content-new.ts`, `src/components/pipeline/content-read.ts` and `content-material.tsx`,
  `contentCalls`, `contentCallText` and `fillItIn` in the content actions; apCfFile, apCfReadFile, apCfCallPick,
  apCfUseCall, apCallToCreate and v99Fill with v105's, v110's and v113's wrappers):
  - Upload: the drop zone and the file box (the current dashboard's list: text, captions, PDF, Word, web pages, video and
    audio). A file is read in this browser, of any size (a Vercel request takes 4.5 MB at most), and nothing is sent
    until the draft goes out: txt, md, markdown and csv as they are; vtt and srt without the WEBVTT line, the cue
    numbers, timings and tags; html and htm without scripts, styles, menus and footers, a line per block; a PDF with
    pdf.js (`pdfjs-dist` 6, its legacy build, loaded when the first PDF comes), up to its 120th page, a page's runs of
    text joined by spaces, the pages by a blank line; a Word file with mammoth's browser build. Under 40 characters, a
    type it does not read (.doc, pictures), a damaged file or a locked PDF says why. Video and audio say they are still
    transcribed in the current dashboard, with a link (4e). The text is cut to 120,000 characters, What is this
    material? is guessed from the file (video and captions a video, audio a podcast, PDF and Word a document, else an
    article) unless it was picked by hand (`typeSet`), and the file names the material (`fileTitle`). The zone then
    shows the file and its words; the line under it says Loaded <name> (the first 120,000 characters when cut), with
    See the text.
  - A material's title (`withMaterial`): a file, a call, a link, a piece or request to use, and the piece Fill it in
    picks name the material unless a title was typed (`titleFrom` is the title the last material gave), and a file or a
    call clears the link a link left.
  - Fathom call: the tab reads the newest page of calls (`contentCalls`, through `loadCalls`, again after about a
    minute), each under the title the team gave it (else Fathom's), Client when a client was on it, the day and time in
    the viewer's zone and the minutes; the search reads what Calls' search reads (the people, the folder, the type, the
    tags), never the Calls page's filters, 40 calls at most. A pick reads its transcript (`contentCallText`, "Speaker:
    text" lines) and puts it in with the call's title and share link, What is this material? Call or meeting unless
    picked by hand, says "Call transcript loaded as the source" and puts the cursor in Core takeaway; the list closes,
    with Pick another call. Not connected: Connect Fathom (Calls, which shows the key form). No transcript: said.
  - Calls' ✎ Use as content source (a call's actions, before Open in Fathom): opens
    `/content-transformation?call=<id>&title=<its title>&link=<its share link>`, and New draft loads the transcript on
    its Fathom call tab (a link that is not Fathom's is dropped).
  - Fill it in for me (Details' heading, with an i that says how it works): Engine 3 · Auto-fill (`e3-autofill`, 100
    seconds) gets a request built on the server from the form and what is on file, read fresh (`fillRequest`): the
    format and kind of post, an idea or material, the briefs in use (the newest approved, else the newest; a paid ad
    needs an advertisement brief, anything else an organic brief), what was typed (an idea and who it is for, or the
    team's own material, its first 4,000 characters, when it has 300 or more and is not the sample), and the voices,
    structures (a template with what it is for) and calls to action the form offers. The answer is checked
    (`fillAnswerOf`) and goes in at once (`applyFill`): the idea, the proof (with where it came from) and the takeaway
    only where nothing was typed; with no material of the team's own, the piece it picked (an earlier request's
    material, a knowledge base file or a library piece, read on the server, 300 characters or more) comes in whole and
    the old takeaway goes; the voice, the call to action and the structure when the form offers them; More options
    opens. A reason sits under each field it filled (one line, whole on a click, gone once the field is changed by
    hand); with no personas, who it suggests writing for is said. The strip at the top of Details: Reading the briefs
    and your context… (what is typed meanwhile is kept), Could not fill it in with Try again, or Filled in from the
    organic brief of <day> with what it was built on, Kept what you typed, the figures it flags, Undo (each field it
    changed back) and Fill it in again. Another kind, category, or an idea in place of material ends the fill, as a
    send does; an answer for what is no longer on the form is not put in.
- The plan (part 4d, `src/lib/pipeline/content-plan.ts` pure rules, `baseParts` and `planKeyOf` in `content-new.ts`,
  `src/components/pipeline/content-plan.tsx`, `savePlanDefault`; v121's plan pane for pieces): at the top of the side,
  in place of You’ll get. What comes back ("1 post, in these parts:"), the parts in order (each with what goes in it,
  else "Nothing set for this part yet"), "Also:" the rest of what comes back. The parts start as the template's
  sections (`baseParts`: the structure picked, a saved template (named: "From the <name> template."), else the kind of
  post's usual shape; a carousel or a video ad its own shape), unless the team saved a default for that kind
  (ai_settings `build_plans`, keyed `piece:<kind of post>`, the keys Marketing Generation's posts share; a structure
  picked has a `:tpl:<structure>` key of its own, never the team's). A part opens to rename it (80), say what goes in
  it (600), move it up or down or remove it; Add a part (twelve at most) opens a new part with its name picked. The
  edits stay with that kind and structure while the page is open (a send keeps them, as before), "Changed" says they
  differ from the default, Reset drops them, Save as our default writes the plan for the team (read fresh and merged,
  so another kind's default stays; each part with key, kind part, name, does, note, q and added, who and when, the
  current dashboard's shape) and goes back to it; the team's default says "Your team’s default" with Use the usual
  steps. The request's `template.sections` are the plan's parts (twelve, the untitled left out), when the plan sent is
  for the kind and structure on the form (`plan` in the form, checked by `planFrom`); See everything it will use shows
  them.
- Changed on purpose in 4d (reported to Kser): a carousel or a video ad's plan starts from its own shape and sends
  it (the old pane showed "Follow the ads brief", then the old page sent the ad type's shape over the plan, so edits
  never reached the writer), and has a key of its own (`piece:ad_carousel`, `piece:ad_video`) so an image ad's plan is
  not a carousel's; See everything it will use lists the plan's parts.
- Changed on purpose in 4c (reported to Kser): video and audio are still transcribed in the current dashboard (a
  dropped one says so, with a link; 4e moves them); a second file, call or link names the material after itself unless
  a title was typed (the old page kept the first file's title, and a call's title replaced even a typed one); a file or
  a call clears the link a read link left (the old page sent that link with the new material); a web page keeps a line
  per block, and a PDF's page loses its runs of spaces; a locked PDF and a damaged PDF or Word file say so in plain words
  (the old page showed pdf.js's own message); the call search reads what Calls' search reads, without the Calls page's
  filters, and the list shows the team's title for a call; Calls' Use as content source opens New draft and loads the
  transcript there (the old page loaded it on Calls first); Fill it in for me's i leaves out the old "Make one from the
  latest brief" (not on this page) and the problem it no longer fills in (the form has no box for it), and names the
  advertisement brief for a paid ad's new idea; the reason for a piece it picked shows on every material tab (the old one
  sat under the Paste box); a piece it picks keeps what kind of material it is (a report, a call), where the old page
  made anything but six kinds Other.

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
  `lead-docs.spec.ts` What should change? and the meeting prep charts; `files.spec.ts` a lead's files;
  `tasks-logic.spec.ts` (without a browser) and `tasks.spec.ts` Tasks, on the rows in `tasks-fixtures.ts`;
  `approvals-logic.spec.ts` (without a browser) and `approvals.spec.ts` Approvals, on the rows in
  `approvals-fixtures.ts` (times count back from now, so a week and 14 days hold on any day; `approvalRows` empties
  e1_leads and dashboard_comments, so the stand-in's own leads do not wait there, and `catalystRows` seeds leads and
  comments for their tests); `today-logic.spec.ts`
  (without a browser), `today.spec.ts` Today (the page's clock set to a Wednesday morning) and `today-catalyst.spec.ts`
  its Catalyst card (contacts and calls dated from now); `intel-logic.spec.ts` (without a browser) and `intel.spec.ts`
  the Intel Tracker, on the rows in `intel-fixtures.ts` (three runs: the newest with six posts and two replies, one
  whose posts are not stored, one that did not finish; JSON columns kept as text, as they are live);
  `overview-logic.spec.ts` (without a browser) and `overview.spec.ts` the Pipeline Overview, on `overview-fixtures.ts`
  (Approvals' rows plus runs, a brief's snapshot, results, ads, posts and the voice and context rows);
  `briefs-logic.spec.ts` (without a browser) and `briefs.spec.ts` the Market Intelligence Briefs, on
  `briefs-fixtures.ts` (two organic briefs, the newest in the live markdown with its snapshot and posts, an older
  custom run someone edited; two ads briefs, the newest naming its ads by id, an older one listing them in its
  markdown; a creative brief; a persona, an offer and approved proof); `ad-strategist-logic.spec.ts` (without a
  browser) and `ad-strategist.spec.ts` the Ad Strategist, on `ads-fixtures.ts` (nine ads in ad_records: six from the
  Ad Library, two uploads, one from the swipe file; three ads briefs, one built from uploads and an old one with no
  snapshot; four runs, one that did not finish; who it follows, the searches, the industries and a set of ad copy;
  dates count back from now); `brief-edit-logic.spec.ts` (without a browser) and `brief-edit.spec.ts` the brief editor
  and the Structure view, on the briefs' rows (confirms answered with `page.once('dialog')`: Playwright dismisses
  them otherwise); `uploads-logic.spec.ts` (without a browser) and `uploads.spec.ts` the upload, build-a-brief and ad
  copy windows and Read this ad, on the same rows; `runs.spec.ts` Runs & uploads, on `runs-fixtures.ts` (the ads
  rows plus a newer ads brief built from uploads, two campaigns, a scheduled and a custom Intel brief, and a custom
  Intel run still reading); `landing-logic.spec.ts` (without a browser) and `landing.spec.ts` Landing pages and the
  preview, on `landing-fixtures.ts` (a live book-a-call page with two ads, a draft webinar page whose campaign was sent
  back, a paused download page with no campaign; four campaigns for the picker, one approved by its ads; visits and
  sign-ups dated from now); `testing-logic.spec.ts`, `strategy-logic.spec.ts` and `import-logic.spec.ts` (without a
  browser) and `testing.spec.ts`, `testing-read.spec.ts` (the Strategy read, New read, Remember) and
  `testing-import.spec.ts` (Import a CSV) Ad Testing, on `testing-fixtures.ts` (four ads: one with revenue, one synced
  from Meta whose title holds a landing page ad's code, one logged by hand with the same code and no leads, one
  imported; three posts; a landing page with visits and sign-ups; two strategy reads, a daily one with codes in its
  text and an older one asked for, kept as text; what the next read reads; a line remembered and its house rule; the
  pieces a result can belong to); `content-logic.spec.ts` (without a browser) and `content.spec.ts` Content
  Transformation, on `content-fixtures.ts` (eight requests: a LinkedIn post from an article, a story being read, one
  that failed, one queued and not picked up, one made from the briefs, a newsletter from a new idea, a deck from a report
  and an ad; their drafts, the newest kept as text; one marked ready and two changes asked; a piece kept from the ad
  draft, one of the team's own and one archived; two open ideas and a used one; the newest organic brief and its
  snapshot; every id a uuid); `content-new-logic.spec.ts` (without a browser) and `content-new.spec.ts` New draft, on
  the same rows and `formRows()` (two personas and an archived one, two offers with the default at $497, approved and
  pending proof, the voice, three templates (one for posts, one switched off, one for anything else) and the briefs'
  layout with two organic parts switched off); `content-material-logic.spec.ts` (without a browser) and
  `content-material.spec.ts` Upload, the Fathom call tab, Calls' Use as content source and Fill it in for me, on the
  same rows, the made-up files in `tests/fixtures` (a two-page PDF and a Word file; the others are made in the tests)
  and the Fathom stand-in's calls; `content-plan-logic.spec.ts` (without a browser) and `content-plan.spec.ts` the plan.
  A test that opens an address filling the form in signs in first, then
  goes there (`openWith`): the form puts the address back to bare at once, so `signIn` cannot wait for it. Helpers in
  `helpers.ts`: `stubCalls`, `stubRows`, `stubSeed`, `stubHook`, `stubFathom`.
- The data stand-in serves `winner_creatives` as a view of `ad_records`, as the project does, unless a test seeds
  `winner_creatives` itself (the briefs suite does), and keeps each ad link once (`ad_records.ad_library_url`, 23505,
  as the project's unique index does). The n8n stand-in starts an Ad Strategist run (`agent2_stub`) and answers the
  industry agent with no industries; the Ad Upload Analyzer reads an ad from what it is sent (an advertiser named
  "Unreadable…" cannot be read) and writes copy for the offer it is sent; Custom Ad Strategy answers with the brief
  `agent2_custom_stub`; the Low-Ticket agent starts. A test gives its own answer with `stubHook`.
- The data stand-in keeps the project's rules for landing pages: a slug once (23505), the slug, status and kind
  checks (23514, on insert and update), a new page's column defaults (`DEFAULTS`: draft, landing, updated_at now), and
  a delete only of a draft that never went live (`DELETABLE`; the rest are kept, as the project's row rules do); and
  content_results' checks (kind, title, no negative numbers). The n8n stand-in answers Engine 3 · Ad Results Sync
  (`e3-ad-results`) with nothing connected and nothing to sync; a test gives connected platforms and the rows a sync
  updated with one `stubHook` (status and sync read the same answer). Engine 3 · Strategy Insights
  (`e3-strategy-insights`) starts a read as `insights_stub`; a test writes the read, or the error row, n8n would save
  under it.
- The data stand-in gives new content_pieces, idea_notes and content_requests rows a uuid, as the project does (the
  Content Transformation actions check ids are uuids), with their column defaults, and keeps content_requests' checks
  (format, start_mode, status). The n8n stand-in answers Engine 3 · Content from Source (`e3-content-run`) as queued,
  and Engine 3 · Read a Link (`e3-read-link`) with a made-up article for any link but a YouTube one, which it turns
  away as the workflow does (youtube_blocked). It answers Engine 3 · Auto-fill (`e3-autofill`) from what it is sent:
  the first voice, the second call to action and the first simple shape, an idea (the one typed kept) or, with no
  material on the form, the first library piece of 300 characters or more (none: no_material), and the briefs it was
  sent with their days; a test gives other answers with `stubHook`. The Fathom stand-in takes a test's own transcripts
  (`stubFathom({connected: true, items, transcripts})`).
- The Storage stand-in (`/storage/v1`, buckets lead-files and creatives): signs an upload address for a signed-in
  session, takes the upload, serves public reads and removes files, and answers the browser's CORS checks; creatives
  takes uploads under `uploads/` only, as the project's rule does; `/__storage` lists what lead-files keeps
  (`?bucket=creatives` the ads' pictures), and `{deny: true}` turns signed-in teammates away, as Storage does before its
  rules for them. File Ingest saves
  a stored file's text on its row (a file named "scan…" has none); Catalyst · Client Proposal and the HubSpot file sync
  answer as their workflows do, and a test writes the client_proposal row n8n would save. `tests/fixtures` holds a
  made-up Word file.
- The Fathom stand-in keeps the team's key (`/__fathom`, `stubFathom({connected: false})` disconnects it; a test can
  give its own first page with `stubFathom({connected: true, items})`), lists two
  pages (`fathomCalls()`, then `fathomOlderCalls()` for cursor `page2`), answers `access` with 'team' for a share token
  containing TeamOnly, and takes connect (a key starting "bad" is turned away) and disconnect. Slack, HubSpot sync
  and post-call actions answer as their workflows do; a test writes the `call_outputs` row the workflow would save.
- Playwright is pinned to 1.56.1: cloud sessions have its Chromium preinstalled. CI runs on `ubuntu-24.04`, since
  `ubuntu-latest` is 26.04, where Playwright 1.56 cannot install Chromium. A newer Playwright would fix that but
  no longer match the sessions' Chromium (launch it with `executablePath: '/opt/pw-browsers/chromium'` then).
  Chromium's system packages are a CI step of their own that may fail without failing CI: they come from Ubuntu's
  mirror, which the runner could not reach for hours on Nov 11, and the runner image already has what Chromium needs.

## Gotchas
- pdf.js runs on the page: `content-read.ts` imports `pdfjs-dist/legacy/build/pdf.worker.mjs` with the library, which
  sets `globalThis.pdfjsWorker`, so pdf.js works without a worker of its own (no worker file to serve, no
  `workerSrc`); `src/types/pdfjs-worker.d.ts` types the import. pdfjs-dist 6 takes no `isEvalSupported`. Its optional
  `@napi-rs/canvas` packages in the lock file are for Node and never load in the browser. mammoth is imported in the
  browser as is: its package's browser field swaps in its browser unzip.
- React's lint (`react-hooks/purity`) refuses `Date.now()` in a function declared in a component's body, even one
  only a click calls: use the page's clock (`now`, by the minute) there, or call it inside a promise's callback.
- Content Transformation's New draft stays mounted (hidden) while Drafts or Ideas is open, and it has a tablist of its
  own (Your material): tests find the page's tabs inside `getByRole('tablist', { name: 'Content Transformation' })`,
  and a container's `toContainText` reads the hidden form's text too.
- Content Transformation and Marketing Generation share content_requests and the content drafts: a draft made from the
  briefs (source_type brief, on the draft or its request) is Marketing Generation's. Anything that lists drafts or links
  to one picks by origin (`draftOrigin` in `src/lib/pipeline/content.ts`, `approvalItems` in Approvals).
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
- Storage's lead-files bucket has rules for the public key (the current dashboard uploads with it) and, since Nov 10
  (migration lead_files_storage_team_rules), for signed-in team accounts: insert, select and delete, checked on the
  email's domain as catalyst_sources' rules are. Here an upload address is signed, and a file removed, as the teammate,
  so without those rules an upload says "Storage turned the upload away" and a delete leaves the stored file behind.
  Checked with a rolled-back insert as a team account (allowed) and an outsider (refused).
- React's `autoFocus` does nothing inside the dialog (it focuses before the dialog's own effect opens it): focus in an
  effect of the dialog's content instead (`change-ask.tsx`).
- The proposal is drawn once and left alone while it is edited in place (React never redraws text a teammate is
  changing); a new version or Cancel draws it afresh under a new key (`proposal-doc.tsx`). Keep anything that changes
  while editing outside the memoized document.
- A `'use server'` file exports async functions only: constants the browser shares with it go in a plain module
  (`src/lib/catalyst/files.ts`).
- The old dashboard does not read `catalyst_proposal_runs` either: a proposal started here shows "Writing…" here only.
- Approvals' Skipped lives in the browser (`ap.nw.skip`), read with `useSyncExternalStore`: while the page hydrates it
  is empty, so anything that acts on Skipped being empty waits for `useHydrated()` (the tab falling back to All does,
  or a reload on `?tab=skipped` would lose the tab).
- Several live jsonb columns hold JSON as a string: a brief's agent_outputs.data and snapshot, runs.stats, intel_items
  themes, observed_engagement and score_parts. Read them through `json()` and `arr()` in `src/lib/pipeline/intel.ts`,
  which also undo a double encoding.
- The old dashboard does not read `intel_runs`: a run started here says "A run started" here only, and one started
  there only there (it keeps them in the browser, `ap.intelPending`).
- A required field's mark (`*`) is hidden from screen readers and the input says it is required, so the field's name
  is its label alone: tests find it with `getByRole('textbox', { name, exact: true })` (`getByLabel` matches the
  label's whole text, mark included).
- A grid with no column template sizes its one column to its widest child: a line that does not wrap (`truncate`) or
  a table that scrolls sideways (`min-w-[640px]`) widens every card in it, and the page scrolls sideways on a phone.
  Grids that hold such things get `grid-cols-[minmax(0,1fr)]` (the briefs page's, Today's lists).
- Next.js 16 with Cache Components keeps the last three pages alive (React Activity, hidden with `display: none`): a
  link back to one of them shows it with the state it had, and only its address changes. A view that copies the
  address into state must adopt an address that asks for something else, or a link to a tab lands on the old one. The
  Ad Strategist, the Intel Tracker and Runs & uploads compare the address with what their state would write, during
  render (a bare address keeps the page as it was, as the old dashboard kept tabs for the session); Approvals'
  `?review=`, the proposal card's `?read=proposal` and New run's `?run=new` open again when the address newly asks
  (New run reads it through `useSearchParams` in a Suspense of its own: the header is drawn before the address is
  known, and a static page is not drawn again on a link). Views that read the address on every render (the Catalyst
  pages, Calls, Tasks, Approvals' tab) or get it from the server (the briefs) need nothing. `bfcacheId` keys would
  reset on every link instead. Tests that query by test id can match a hidden page's copy: use `getByRole` or
  `.filter({ visible: true })`.
- A view that writes its own address calls `window.history.replaceState(null, '', url)`. Passing Next's own history
  state (`window.history.state`) makes Next skip syncing its router, so the next refresh from a server action puts the
  old address back (found in 2b: Follow on the upload window lost `?tab=uploads&ad=`). The Pipeline views also write
  the address again whenever it drifts from their state (the search params are in the effect's list).
- Storage's creatives bucket has rules for uploads under `uploads/` and for reading, none for removing a file: the
  pictures of an ad whose row could not be saved stay in Storage, as with the current dashboard.
- The clock (`useNow`) is to the minute, so something exactly two days old can read "yesterday" for up to a minute:
  test rows that a "days ago" line reads are dated a little past the whole day (`RUN1_AT` in `ads-fixtures.ts`).
- A client component imports only types from a loader (`*-load.ts`, `server-only`): a value, even a constant, pulls
  the loader and the server's Supabase client into the browser bundle and the build fails. Constants the page and its
  loader share go in the rules module (the briefs' tabs are in `briefs.ts`).
- A tab title set in an effect (`document.title`) is overwritten by Next's metadata, which streams in after a page's
  deferred content. A page whose title comes from its data sets it in `generateMetadata`, with the read wrapped in
  React's `cache` so the page and its title share one read per request (`loadPreview`).
- The landing page preview (`/preview/landing/[id]`) sits outside the `(app)` group, so it has no sidebar or top bar;
  the proxy still sends anyone signed out to sign-in, and the page checks the teammate again.
- The briefs page draws one `BriefsView` for every tab and brief (no key), so a brief being edited stays open while
  another tab is looked at, as in the old page. State that belongs to one brief goes in `OrgBrief` or `AdsBrief`,
  which are keyed by run; the view only resets Brief or Structure when the tab changes.
- A label that wraps a select holds the select's options in its text, so a test that filters labels by their text
  matches every column whose select lists that header: find the select by its place, or by the label's own span
  (`testing-import.spec.ts`). Playwright names such a select by the label's words and its chosen option together.
