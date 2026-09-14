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

This was built in stages (see `release-impact-finder-cc-prompts.md` and the Status section below) —
all six are now complete.

## Setup

### 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → New Project.
2. Pick an organization, name it (e.g. `release-impact-finder`), set a database password, choose a
   region, and create it.
3. Once it's provisioned, go to **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role secret** (not the `anon` key) → `SUPABASE_SERVICE_ROLE_KEY`
4. Copy `.env.example` to `.env` and fill in those two values (plus `ANTHROPIC_API_KEY` for the
   Stage 3 AI pass).

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
   `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, and optionally `WEBSITE_SITEMAP_URL` (same
   values as your local `.env`).
5. Deploy.
6. See **Password protection** below to gate the site — this project uses Netlify's built-in
   Visitor Access rather than the app-level `SITE_PASSWORD` gate, so no extra env var is needed for it.

### Local development

```bash
npm install                 # installs root + client workspace deps
npx netlify-cli login        # first time only
npx netlify-cli link         # link this folder to the Netlify site
npx netlify-cli dev          # runs the Vite client + Netlify Functions together
```

`netlify dev` reads `.env` automatically and proxies `/api/*` to the functions (see the redirect
in `netlify.toml`), and serves the Vite client with hot reload.

### Testing the website crawler standalone

Before relying on the deployed `crawl-website` function, you can run the crawler directly against
a real sitemap with no timeout and no database writes:

```bash
npm run crawl:test -- https://www.getgenea.com/sitemap.xml --max=20 --delay=300
```

Prints a summary (URLs discovered, pages crawled, skipped non-HTML resources, any fetch failures)
plus a preview of each page's extracted title/content. The deployed `crawl-website` function uses
more conservative defaults (10 pages, 200ms delay) to stay inside Netlify's synchronous function
time limit — for a fuller crawl during development, use this CLI script instead.

### Testing the AI relevance pass standalone

```bash
npm run audit:test -- <auditId> --limit=10 --concurrency=3
```

Runs the real matching logic against a real audit's content items using the real Anthropic API —
but as a **dry run** (nothing is written to the database), so you can iterate on prompt quality
without disturbing real audit state. Needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
`ANTHROPIC_API_KEY` in your local `.env`. To actually run an audit (persisting findings), use the
deployed `run-audit-pass` function instead — call it repeatedly until it returns `done: true`.

## Password protection

This site is on a Netlify **Pro** plan, so it uses Netlify's built-in Visitor Access rather than a
custom login screen (the app-level `SITE_PASSWORD` fallback the original spec described for
plans without that feature). To enable it:

1. Netlify dashboard → this site → **Project configuration → General → Visitor access → Project
   visibility** (older Netlify UIs label this **Site settings → Visitor access → Password
   protection**, since Netlify's product terminology has shifted from "site" to "project").
2. **Edit visibility** → select **Password** → enter a password.
3. Scope: choose **Production and previews** so the live site itself is gated, not just deploy
   previews.
4. **Save.**

That's it — no code, no deploy needed. Netlify prompts every visitor for that password before
serving any page. Rotate it any time from the same screen.

## Getting SharePoint content into an audit

Two ways to get SharePoint content into `content_items` — same endpoint (`add-content-items`)
either way, so nothing downstream (the AI pass, the Results screen) knows or cares which one you used:

**1. Upload it yourself** — the SharePoint upload widget on the New Audit screen (Stage 1).
Drag in files you've already pulled, or paste text directly, with an optional reference URL per
item. Always available, no live Claude session required.

**2. Ask Claude to pull it live** — in a Claude Code session with the Microsoft 365 connector
(this repo's sessions have it), just ask, e.g. *"Pull SharePoint content from the Marketing site
for the Web Provisioning audit — it's about wallet-based mobile credential provisioning."* Claude
searches the Marketing SharePoint site (`genea.sharepoint.com/sites/Marketing`) with
`sharepoint_search`/`sharepoint_folder_search`, reads matches with `read_resource`, and pushes the
relevant ones straight into the audit via `add-content-items` — no separate chat, no manual
export/upload round-trip. Give it the audit name (or id) and a topic/keywords; it works best
scoped to one release rather than "pull everything," since the Marketing site has hundreds of
files.

This mirrors `contentcrawl`'s approach (a sibling project — a broader quarterly content-quality
audit, kept separate on purpose; see conversation history for the comparison): neither project
does *live, unattended* SharePoint search from the deployed app itself. That would need an Azure
AD app registration with Graph API permissions and admin consent — real infrastructure, not
something either app is built for. What both actually do is have Claude pull SharePoint content
by hand, live, during a session that already has the Microsoft 365 connector — this app just
skips contentcrawl's extra step of caching that pull into a committed file first.

## Status

- [x] Stage 0 — scaffolding, Supabase schema, function stubs
- [x] Stage 1 — manual SharePoint content input
- [x] Stage 2 — website crawler
- [x] Stage 3 — release brief ingestion + AI relevance pass
- [x] Stage 4 — frontend: run a new audit + view results
- [x] Stage 5 — CSV export
- [x] Stage 6 — historic audits + password protection
