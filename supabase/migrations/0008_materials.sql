-- ─────────────────────────────────────────────────────────────────────────
-- 0008_materials.sql — household document vault, staff profile approvals,
-- and email engagement tracking.
--
-- Student materials (headshot, resume, audio) reuse columns that already
-- exist on `students`; only the storage buckets are new.
-- ─────────────────────────────────────────────────────────────────────────

create table family_documents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  student_id uuid references students (id) on delete set null,
  name text not null,
  category text not null default 'other'
    check (category in ('waiver','medical','photo_release','financial','school','other')),
  file_url text not null,
  storage_path text not null,
  content_type text not null,
  size_bytes int not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by_name text not null default '',
  -- Staff-filed documents are readable by the family but only removable by
  -- an admin — a countersigned waiver isn't the family's to delete.
  uploaded_by_staff boolean not null default false
);

create index family_documents_family_idx on family_documents (family_id, uploaded_at desc);

-- ── email engagement ─────────────────────────────────────────────────────

create table email_opens (
  id uuid primary key default gen_random_uuid(),
  send_id uuid not null references email_sends (id) on delete cascade,
  recipient_id uuid not null references profiles (id) on delete cascade,
  opened_at timestamptz not null default now(),
  -- One row per recipient per send; repeat opens update the timestamp.
  unique (send_id, recipient_id)
);

create table email_clicks (
  id uuid primary key default gen_random_uuid(),
  send_id uuid not null references email_sends (id) on delete cascade,
  recipient_id uuid not null references profiles (id) on delete cascade,
  url text not null,
  clicked_at timestamptz not null default now()
);

create index email_clicks_send_idx on email_clicks (send_id, clicked_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────

alter table family_documents enable row level security;
alter table email_opens enable row level security;
alter table email_clicks enable row level security;

-- The family and staff can read; the family can add; staff-filed documents
-- need an admin to remove.
create policy family_documents_read on family_documents
  for select using (family_id = auth_family_id() or is_staffish());

create policy family_documents_insert on family_documents
  for insert with check (family_id = auth_family_id() or is_staffish());

create policy family_documents_delete on family_documents
  for delete using (
    is_admin()
    or (family_id = auth_family_id() and not uploaded_by_staff)
  );

-- Engagement data names individual families, so it is staff-only to read.
-- Writes come from the tracking endpoints via the service role, which
-- bypasses RLS — there is deliberately no client-writable policy, so a
-- family cannot inflate or forge open counts.
create policy email_opens_read on email_opens for select using (is_staffish());
create policy email_clicks_read on email_clicks for select using (is_staffish());

-- ─────────────────────────────────────────────────────────────────────────
-- Storage buckets. All private; the app serves files through signed URLs.
--   insert into storage.buckets (id, name, public) values
--     ('headshots','headshots',false),
--     ('resumes','resumes',false),
--     ('audition-audio','audition-audio',false),
--     ('family-documents','family-documents',false),
--     ('staff-photos','staff-photos',false);
--
-- Object paths are prefixed with the owning student/family id, so a storage
-- policy of the form
--   (storage.foldername(name))[1] = auth_family_id()::text
-- scopes access without duplicating the rules above.
-- ─────────────────────────────────────────────────────────────────────────
