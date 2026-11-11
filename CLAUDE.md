# AI Paragon internal dashboard (Next.js)

Brief for Claude sessions in this repo. Last reviewed 2026-11-11.

## What this is
The AI Paragon Consulting Group team workspace: Touchpoint (home and tasks), Catalyst (clients and meetings),
Canvas (client deliverables), Pipeline (content and ads), Atlas (knowledge and files) and Settings. It is being
rebuilt here, in Next.js, from the single-file dashboard in krever1/aiparagon (`new-aiparagon-dashboard.html`, live at
aiparagon.vercel.app/dashboard). Both apps use the same Supabase project and n8n workflows, so they run side by side
until every page has moved; then aiparagon.vercel.app/dashboard forwards here.

One repo per project (Kser, Nov 9): this repo is the internal dashboard only. The other projects (care portal, voice
agent Command Center, Advisory demo, website builder) stay in krever1/aiparagon until they get their own repos.

## Where it stands (as of 2026-11-11)
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
  `pipeline/briefs-overview`, on top of 1a). With 1b, part 1 is done. See Pipeline below.
- Next: Pipeline parts 2 to 5, then Atlas, Canvas, Settings. Then the cutover.
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
| Pipeline | Ad Strategist, Content Transformation, Marketing Generation, Landing pages, Ad Testing, Runs & uploads | current dashboard |
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
      Transformation;
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
      with action ready), with Check and approve to Content Transformation, where drafts are approved;
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
    Every page Review opens but a lead's is still in the current dashboard (`out`: "Opens in the current dashboard");
    none of them can be opened at the exact draft or campaign from here.
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
    the address after hydrating) and Make an ad campaign, Turn content into a post, Put a landing page live, which
    open their pages in the current dashboard (the old page opened the form itself).
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
  (v104ReadSync and v104SyncDerived rewrite ai_rules), so that goes with the Company profile port, not a reader;
  `winner_creatives` is a view (check it takes writes before writing to it); the low-ticket rows keep their data as a
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
  - Write a post on this and Open the brief open the current dashboard's Content Transformation and briefs, until those
    pages move here.
- Changed on purpose on the Intel Tracker (reported to Kser): a run started is kept for the team (the old page kept it
  in one browser); the run picker lists the tracker's own runs (the old page took the 40 newest runs of every agent,
  so a busy week hid older tracker runs); the address keeps the run, the tab and the filters, and a bare address always
  opens the newest run; the "Social Listening" headings left over say the Intel Tracker; the switched-off message
  names the workflow as n8n does, "(scheduled + custom)" (the old page said daily); Write a post on this opens Content
  Transformation without filling it in (that page is still in the current dashboard).
- The Pipeline Overview (part 1b, `src/lib/pipeline/overview.ts` pure rules, `overview-load.ts`,
  `src/components/pipeline/overview-view.tsx` and `widget-store.ts`, `src/app/(app)/engine-3`; NW_PAGES['e3.overview'] as
  v107 to v115 left it):
  - The hello line ("Pipeline · Overview · <day>", the greeting, what needs you and when the Intel Tracker last ran),
    Take the tour (Today's) and Customize.
  - The cards, in this order until someone moves them: Needs you and Recent runs (Today's, now shared in
    `src/components/today/cards.tsx`); Quick start (Make an ad campaign, Turn content into a post, Log a result, in the
    current dashboard); Agents · open any section (six tiles, each with its number, a line, when it last ran and a dot:
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
  counted (the old page counted what it had loaded, at most 1,000 ads and 500 results); Write a post opens Content
  Transformation without the note filled in, and Log a result opens Ad Testing without its form open (both pages are
  still in the current dashboard); the How it fits together step that said Create says Content Transformation; a long
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
  - Organic: the record bar (published, the period, the agent, the industry with Change, the versions, the state,
    Approve brief; Structure and Edit open the current dashboard), the evidence note, the five things (the snapshot,
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
    the reason as feedback, author the teammate's email), the rows Approvals writes and AI settings reads. Request
    changes asks what should change first.
  - The team's layout (`layoutOf`): the sections in its order, those switched off left out (the record, the evidence
    and the review cannot be), and its options (how many five things, shifts, developments, hooks and offers; short or
    full reasons; topic watch). A section the team added to the layout says it is counted in the current dashboard. A
    saved review (the brief editor's) hides its sections too, and the bar says who edited the brief.
  - The three review checks are kept in this browser (localStorage `ap.nw.brchk`, as the current dashboard; the two
    apps do not share them). `briefs-parts.tsx` holds what the tabs share (the bar, a section, the rail, the review).
- Changed on purpose on the Briefs (reported to Kser): Request changes asks what should change and saves it (the old
  page opened the brief editor; editing a brief, its layout and putting back the agent's version stay in the current
  dashboard for now); a section the team added to the layout points there instead of being counted here; a brief
  older than the newest is read on its own (the old page opened the newest); the tab and the brief are in the address;
  the Call to action card names the action as the company profile does, Book a call when the offer has none (the old
  page showed the stored word, such as call); an angle is quoted from double quotes only (the apostrophe in firm's
  could start a quote); "uploaded by your team" is said once per ad; a shift from the brief's own list no longer
  repeats its note as the reading; a pattern from another market kept as an object reads as its words; the copy
  formula's arrows are spaced once; an ad row opens the ad in the Ad Library (its own panel is on the Ad Strategist,
  still in the current dashboard); Combined reads personas, offers and proof directly (the old loader rewrote house
  rules as it read); Approve cannot save twice on a double click; the brief links on Approvals, Today, the Intel
  Tracker and the Overview open the brief here, at its run.

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
  markdown; a creative brief; a persona, an offer and approved proof). Helpers in `helpers.ts`: `stubCalls`,
  `stubRows`, `stubSeed`, `stubHook`, `stubFathom`.
- The Storage stand-in (`/storage/v1`, bucket lead-files): signs an upload address for a signed-in session, takes the
  upload, serves public reads and removes files, and answers the browser's CORS checks; `/__storage` lists what it
  keeps, and `{deny: true}` turns signed-in teammates away, as Storage does before its rules for them. File Ingest saves
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
- A client component imports only types from a loader (`*-load.ts`, `server-only`): a value, even a constant, pulls
  the loader and the server's Supabase client into the browser bundle and the build fails. Constants the page and its
  loader share go in the rules module (the briefs' tabs are in `briefs.ts`).
