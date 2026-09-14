-- Stage 4's New Audit screen allows multiple product brief / release doc
-- files (Stage 3 only supported one, stored directly on `audits`). This
-- moves brief storage to its own table, one row per uploaded file — same
-- pattern as content_items for SharePoint/website content.
--
-- audits.brief_file_path / brief_content_text (added in Stage 0 / Stage 3)
-- are superseded by this table and no longer written to, but are left in
-- place rather than dropped since existing rows still carry data in them.

create table if not exists release_briefs (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references audits(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  content_text text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists release_briefs_audit_id_idx on release_briefs (audit_id);

alter table release_briefs enable row level security;
