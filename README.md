# Release Impact Finder

Finds which website and SharePoint content needs updating for an upcoming product release, and
estimates how much effort ("lift") each update needs.

Stack: React (Vite) frontend, Netlify Functions API, Supabase (Postgres) database, deployed on
Netlify with password protection for single-user access.

## Project structure

```
/client                — React frontend (Vite + TypeScript)
/netlify/functions      — serverless API routes (Netlify Functions)
/supabase/migrations    — SQL migration files for the schema
```

This is being built in stages (see `release-impact-finder-cc-prompts.md`). This is **Stage 0**:
scaffolding, schema, and function stubs only — no crawling, uploads, or AI logic yet.

## Setup

### 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → New Project.
2. Pick an organization, name it (e.g. `release-impact-finder`), set a database password, choose a
   region, and create it.
3. Once it's provisioned, go to **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role secret** (not the `anon` key) → `SUPABASE_SERVICE_ROLE_KEY`
4. Copy `.env.example` to `.env` and fill in those two values (plus `ANTHROPIC_API_KEY` and
   `SITE_PASSWORD` when you get to Stage 3 / Stage 6).

### 2. Run the migrations

In the Supabase dashboard: **SQL Editor → New query**, paste the contents of each file in
`supabase/migrations/` **in order** (`0001_init.sql`, then `0002_content_items.sql`, etc. as new
ones are added), running each one. `0001_init.sql` creates `audits` and `findings`;
`0002_content_items.sql` adds `content_items`, which holds the normalized SharePoint/website
content produced by Stage 1 and Stage 2 before the AI pass (Stage 3) turns it into findings.

(If you'd rather use the Supabase CLI: `supabase link --project-ref <your-project-ref>` then
`supabase db push` from the repo root, with the CLI installed and logged in.)

### 3. Connect the repo to Netlify

1. Push this repo to GitHub.
2. In the [Netlify dashboard](https://app.netlify.com): **Add new site → Import an existing
   project**, pick GitHub, and select this repo.
3. Build settings should be auto-detected from `netlify.toml`:
   - Build command: `npm run build:client`
   - Publish directory: `client/dist`
   - Functions directory: `netlify/functions`
4. Under **Site configuration → Environment variables**, add `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, and `SITE_PASSWORD` (same values as your
   local `.env`).
5. Deploy.

### Local development

```bash
npm install                 # installs root + client workspace deps
npx netlify-cli login        # first time only
npx netlify-cli link         # link this folder to the Netlify site
npx netlify-cli dev          # runs the Vite client + Netlify Functions together
```

`netlify dev` reads `.env` automatically and proxies `/api/*` to the functions (see the redirect
in `netlify.toml`), and serves the Vite client with hot reload.

## Status

- [x] Stage 0 — scaffolding, Supabase schema, function stubs
- [x] Stage 1 — manual SharePoint content input
- [ ] Stage 2 — website crawler
- [ ] Stage 3 — release brief ingestion + AI relevance pass
- [ ] Stage 4 — frontend: run a new audit + view results
- [ ] Stage 5 — CSV export
- [ ] Stage 6 — historic audits + password protection
