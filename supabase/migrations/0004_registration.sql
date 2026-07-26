-- ─────────────────────────────────────────────────────────────────────────
-- 0004_registration.sql — account linking and sync bookkeeping (#8).
-- Sync source of record is the org's own registration portal; the adapter
-- and field mapping live in src/lib/api/registration/custom.ts.
-- ─────────────────────────────────────────────────────────────────────────

-- One app family ↔ one account per external system.
create table registration_account_links (
  family_id uuid not null references families (id) on delete cascade,
  source text not null check (source in ('sawyer','regpack','manual','mock')),
  external_id text not null,
  external_email text not null,
  linked_at timestamptz not null default now(),
  -- True when matched by email rather than confirmed by an admin.
  auto_matched boolean not null default false,
  primary key (family_id, source),
  unique (source, external_id)
);

-- Every sync attempt, successful or not. The admin health view reads this;
-- a failure must never vanish into a log file.
create table registration_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  trigger text not null check (trigger in ('manual','webhook','scheduled')),
  status text not null check (status in ('success','partial','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  counts jsonb not null default '{}',
  issues jsonb not null default '[]',
  error text
);

create index sync_runs_recent_idx on registration_sync_runs (started_at desc);

-- Ties an app enrollment back to its row upstream, so re-syncs update rather
-- than duplicate, and so an admin can trace where a row came from.
alter table enrollments
  add column external_id text,
  add column external_source text;

create unique index enrollments_external_idx
  on enrollments (external_source, external_id)
  where external_id is not null;

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table registration_account_links enable row level security;
alter table registration_sync_runs enable row level security;

-- A family may see its own link (the dashboard shows "connected to
-- registration"); staff see all; only admins may create or change links.
create policy account_links_read on registration_account_links
  for select using (family_id = auth_family_id() or is_staffish());
create policy account_links_write on registration_account_links
  for all using (is_admin());

-- Sync history is staff-only — it contains other families' names in issues.
create policy sync_runs_read on registration_sync_runs
  for select using (is_staffish());
create policy sync_runs_write on registration_sync_runs
  for all using (is_staffish());
