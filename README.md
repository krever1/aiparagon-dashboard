# AI Paragon internal dashboard

The AI Paragon team workspace (Touchpoint, Catalyst, Canvas, Pipeline, Atlas), rebuilt in Next.js.

The current dashboard is one HTML file (`new-aiparagon-dashboard.html` in krever1/aiparagon, live at
aiparagon.vercel.app/dashboard). This app replaces it one product at a time. Both use the same Supabase project and
n8n workflows, so they run side by side. Until a page is ported, its page here opens it in the current dashboard.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then fill in NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:3000
```

Sign in with your @aiparagonconsulting.com account (the same one as the current dashboard).

## Checks

```bash
npm run lint
npm run typecheck
npm run test:e2e   # builds the app and runs the browser tests against a stand-in for Supabase Auth
```

CI runs all three on every pull request and on every push to `dev` and `main`.

## Branches

- `main`: what the team uses (production). Changes arrive only by pull request from `dev`.
- `dev`: staging. Every change gets its own branch and a pull request into `dev`.

On Vercel, `main` deploys to production and every other branch gets a preview link.

## Environment

See `.env.example`. Set the same names in Vercel (Project Settings, Environment Variables). Keys never go in the repo.
