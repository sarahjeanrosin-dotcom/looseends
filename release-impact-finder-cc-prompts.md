# Release Impact Finder — Claude Code Build Prompts

Stack: GitHub (repo) + Supabase (DB + auth) + Netlify (hosting), with password protection for
single-user access.

SharePoint approach: no automated crawler. You'll pull relevant SharePoint files yourself via a
Claude chat (using the Microsoft 365 connector, same as the earlier content-audit project) and
upload the extracted content into the app manually before each audit run. No Azure app
registration needed.

Run these in order, one per session. Each assumes the prior stage is working before moving on.

---

## Stage 0 — Project scaffolding + GitHub + Supabase

```
Set up a new Node.js/TypeScript project called "release-impact-finder", ready to deploy on Netlify
with Supabase as the database.

Structure:
- /client — React frontend (Vite)
- /netlify/functions — serverless functions (this replaces a standalone Express server; Netlify 
  Functions handle the API routes)
- /supabase — SQL migration files for the schema below

Initialize it as a git repo (I'll create the GitHub repo myself and push).

Supabase schema (write as a SQL migration file):
- `audits` table (id uuid, release_name text, description text, brief_file_path text, created_at timestamptz,
  status text, progress int)
- `findings` table (id uuid, audit_id uuid references audits, source text [website|sharepoint], 
  url_or_path text, title text, relevant boolean, reason text, suggested_action text, 
  lift_score int [1-5], lift_label text)

Netlify Functions (stubs for now, no logic yet):
- create-audit.ts — starts a new audit run
- list-audits.ts — lists historic audits
- get-audit.ts — gets one audit + its findings

Give me a .env.example with placeholders for: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, 
ANTHROPIC_API_KEY, and a SITE_PASSWORD (for the password protection we'll add in Stage 6).

Also give me the exact steps to: create the Supabase project, run the migration, and connect 
this repo to Netlify.
```

---

## Stage 1 — Manual SharePoint content input

**Before running this stage, each time you run an audit:** open a Claude chat, use the Microsoft
365 connector to search/read the relevant files in the Marketing SharePoint folder for this
release, and export what you need as either the raw text or the original files. This stage just
builds where that content lands in the app — it does not build a live SharePoint connection.

```
Build a "SharePoint content" upload step for a new audit:
- A file upload area (accepts .docx, .pdf, .pptx, .txt, or pasted plain text) where I can drop in 
  the SharePoint files/content I've already pulled via a separate Claude chat session
- For each uploaded item, extract: file name (as title), and plain text content
  - .docx and .pptx → use a library that extracts plain text
  - .pdf → extract text (flag scanned/image-only PDFs as "not extractable" rather than failing)
  - .txt or pasted text → use as-is
- Also allow a simple "paste a SharePoint URL" field per item, purely as a reference link to store 
  alongside the extracted content (not something the app fetches itself)
- Output a normalized array: { source: 'sharepoint', path: <url or filename>, title, contentText }
- Store these against the audit record so they feed into the AI relevance pass in Stage 3

This is a manual input step, not a crawler — no Microsoft Graph API, no Azure credentials needed.
```

---

## Stage 2 — Website crawler

```
Build a website crawler (as a Netlify Function or background job) that:
- Starts from a sitemap.xml URL (I'll provide getgenea.com's sitemap)
- Fetches each page's HTML, strips nav/footer/boilerplate, and extracts main content text + title + URL
- Respects a reasonable crawl delay and skips non-HTML resources (PDFs linked from the site, images, etc.)
- Outputs the same normalized shape as the SharePoint input: { source: 'website', url, title, 
  lastModified (if available), contentText }

Cap it at a configurable max page count for testing. Write a CLI test script to run it standalone 
and print a summary (page count, any fetch failures) before wiring it into the deployed app.
```

---

## Stage 3 — Release brief ingestion + AI relevance pass

```
Build the core matching logic:

1. Accept a release input: name, free-text description, and an uploaded file (the product brief — 
   .docx, .pdf, or .pptx). Store the uploaded file in Supabase Storage and extract text from it the 
   same way the SharePoint upload step does.

2. Combine into one "release context" string: name + description + brief content.

3. For each content item — from the website crawler (Stage 2) AND the manually uploaded SharePoint 
   content (Stage 1) — call the Anthropic API (use ANTHROPIC_API_KEY from .env, model 
   claude-sonnet-4-6) with a prompt that:
   - Gives it the release context
   - Gives it the content item (title, source, excerpt of contentText — truncate long docs sensibly)
   - Asks it to return structured JSON: 
     { relevant: boolean, reason: string, suggested_action: string, 
       lift_score: 1-5, lift_label: string }
   - Lift scale definitions to give the model: 
     1 = Super easy (single word/term swap, no design or review needed)
     2 = Easy (a few sentences, no layout change)
     3 = Moderate (new section/paragraph, or requires a screenshot/image swap)
     4 = Hard (structural change, multiple pages, or needs stakeholder review)
     5 = Super hard (full asset rebuild — deck, case study, or page redesign)

4. Only keep items where relevant = true, plus a small sample of borderline ones for my review.

5. Save the audit run and all findings to Supabase (audits + findings tables from Stage 0).

Batch the AI calls with reasonable concurrency limits (not all at once) and handle rate limits/retries. 
Given Netlify Function time limits, structure this as a background function or a job that processes 
in chunks and updates progress in Supabase (`status` and `progress` columns on `audits`) so the 
frontend can poll it.
```

---

## Stage 4 — Frontend: run a new audit + view results

```
Build the React frontend:

1. "New Audit" screen:
   - Release name (text input)
   - Description (textarea)
   - Upload product brief / release docs (file upload, multiple files allowed)
   - Upload SharePoint content pulled via Claude chat (file upload + optional reference URL per 
     item, from Stage 1)
   - "Run Audit" button → kicks off the website crawl + AI pass, shows a progress indicator by 
     polling the audit's status/progress from Supabase

2. "Audit Results" screen:
   - Table of findings grouped by source (Website / SharePoint tabs or sections)
   - Columns: Title/URL, Reason flagged, Suggested action, Lift (show as a 1-5 badge with the 
     label, color-coded: green=1, red=5)
   - Sortable/filterable by lift score and source
   - "Download CSV" button (see Stage 5)

Keep styling simple and clean — functional over polished for now.
```

---

## Stage 5 — CSV export

```
Add a CSV export Netlify Function: GET /.netlify/functions/export-audit-csv?id=...

Columns: Release Name, Source, Title, URL or Path, Reason, Suggested Action, Lift Score, Lift Label

Wire the "Download CSV" button in the frontend to hit this endpoint and trigger a browser download.
```

---

## Stage 6 — Historic audits + password protection

```
Part A — Historic audits:
Build a "Past Audits" screen:
- List all audits from Supabase (release name, date run, item counts by lift score)
- Click into any past audit to view its full results (reuse the Audit Results screen from Stage 4)
- Each historic audit should also support CSV re-download

Part B — Password protection:
Since this is single-user, add simple password protection rather than a full auth system:
- Use Netlify's built-in password protection for the whole site (Site settings > Visitor access), 
  OR if that's not available on my plan, add a lightweight gate: a login screen that checks a 
  password against SITE_PASSWORD (from .env, set as a Netlify environment variable) and stores a 
  signed session token (e.g., in an httpOnly cookie) so I don't have to re-enter it every visit.
- Tell me which approach fits my Netlify plan and walk me through enabling it.
```

---

## Notes for you (not for Claude Code)

- **Per-release SharePoint pull** — before each audit run, open a Claude chat and use the 
  Microsoft 365 connector to find/read the relevant Marketing folder files for that release, 
  then export/upload them into the app's SharePoint upload step (Stage 1). This replaces an 
  automated crawl and needs no Azure setup.
- **Sitemap URL** — have getgenea.com's sitemap.xml URL ready for Stage 2.
- **Anthropic API key** — you'll need a standalone API key (separate from claude.ai) for Stage 3.
- **Supabase project** — create this before Stage 0's migration step; you'll need the project URL 
  and service role key.
- **Netlify site + password protection tier** — password-protected sites may require a specific 
  Netlify plan; Stage 6 has Claude Code check this and fall back to the custom login gate if needed.
