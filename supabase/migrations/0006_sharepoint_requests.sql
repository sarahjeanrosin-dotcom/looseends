-- Lets the New Audit / Results screens queue a plain-language SharePoint
-- search request ("search Marketing for wallet content") without the
-- deployed app itself touching SharePoint (it can't — see README). A
-- scheduled Claude agent with the Microsoft 365 connector polls for
-- status='pending' rows, does the live search, pushes results the same way
-- a live chat session does, and marks the row fulfilled (or failed) with a
-- short summary.

create table if not exists sharepoint_requests (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references audits(id) on delete cascade,
  prompt text not null,
  status text not null default 'pending' check (status in ('pending', 'fulfilled', 'failed')),
  summary text,
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

create index if not exists sharepoint_requests_audit_id_idx on sharepoint_requests (audit_id);
create index if not exists sharepoint_requests_pending_idx on sharepoint_requests (status) where status = 'pending';

alter table sharepoint_requests enable row level security;
