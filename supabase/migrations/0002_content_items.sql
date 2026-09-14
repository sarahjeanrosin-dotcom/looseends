-- content_items holds the normalized pre-AI-pass content that both Stage 1
-- (manual SharePoint upload) and Stage 2 (website crawler) produce:
-- { source, path, title, contentText }. Stage 3's AI relevance pass reads
-- from this table and writes its verdicts into `findings`.

create table if not exists content_items (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references audits (id) on delete cascade,
  source text not null check (source in ('website', 'sharepoint')),
  url_or_path text not null,
  title text not null,
  content_text text not null default '',
  extractable boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists content_items_audit_id_idx on content_items (audit_id);

-- See the note on the same policy in 0001_init.sql — service-role-only access
-- today, RLS enabled as a safety net for any future client-side usage.
alter table content_items enable row level security;
