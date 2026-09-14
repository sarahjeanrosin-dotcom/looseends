-- Release Impact Finder — initial schema
-- Run via the Supabase SQL editor, or `supabase db push` if using the CLI.

create extension if not exists "pgcrypto";

create table if not exists audits (
  id uuid primary key default gen_random_uuid(),
  release_name text not null,
  description text,
  brief_file_path text,
  created_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'complete', 'failed')),
  progress int not null default 0
    check (progress >= 0 and progress <= 100)
);

create table if not exists findings (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references audits (id) on delete cascade,
  source text not null check (source in ('website', 'sharepoint')),
  url_or_path text not null,
  title text not null,
  relevant boolean not null default false,
  reason text,
  suggested_action text,
  lift_score int check (lift_score >= 1 and lift_score <= 5),
  lift_label text
);

create index if not exists findings_audit_id_idx on findings (audit_id);
create index if not exists audits_created_at_idx on audits (created_at desc);

-- RLS: these tables are only ever accessed server-side (Netlify Functions
-- using the service role key), so lock them down to that key. The service
-- role bypasses RLS entirely, so these policies are a safety net for any
-- future client-side/anon usage rather than something the app relies on today.
alter table audits enable row level security;
alter table findings enable row level security;
