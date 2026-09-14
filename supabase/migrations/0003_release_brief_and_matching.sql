-- Stage 3: release brief storage + AI matching bookkeeping

-- Extracted text of the uploaded product brief, alongside the existing
-- brief_file_path (the Storage object path) added in Stage 0.
alter table audits add column if not exists brief_content_text text;

-- Tracks which content_items have already been run through the AI pass,
-- independent of whether they produced a finding — a "not relevant" verdict
-- intentionally produces no finding row (see findings.borderline below), so
-- "already processed" can't be inferred from the findings table alone. This
-- is what lets run-audit-pass resume a partially-processed audit in chunks
-- without ever re-evaluating (or skipping) an item.
alter table content_items add column if not exists processed boolean not null default false;

-- Traceability from a finding back to the content item it was generated
-- from, and a flag for the "relevant=false but not high-confidence" sample
-- the AI pass keeps alongside the relevant=true findings for human review.
alter table findings add column if not exists content_item_id uuid references content_items(id) on delete set null;
alter table findings add column if not exists borderline boolean not null default false;

create index if not exists content_items_audit_unprocessed_idx on content_items (audit_id) where not processed;

-- Storage bucket for uploaded release brief files. Private — only the
-- service role (used server-side) can read/write; there's no end-user need
-- to fetch the raw file back out, only its extracted text (brief_content_text).
insert into storage.buckets (id, name, public)
values ('release-briefs', 'release-briefs', false)
on conflict (id) do nothing;
