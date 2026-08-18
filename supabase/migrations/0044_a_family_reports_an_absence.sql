-- ---------------------------------------------------------------------------
-- 0044 — A family reports an absence.
-- ---------------------------------------------------------------------------
-- Tony, 18 Aug 2026: "Allow for parents to submit absences in their dashboard
-- for their shows, and then the director and the show director each receive
-- that information."
--
-- Until now the only route was a message thread or an email, which means the
-- fact that a named child will miss a named rehearsal lived in somebody's
-- inbox. The published policy already asks for it in writing ("in the event
-- that your child is unable to attend due to illness, please notify us
-- immediately"), so the portal should be the place that request lands.
--
-- WHAT THIS IS NOT
-- ----------------
-- Not an approval workflow. A parent telling us their child is ill is not a
-- request we grant; there is no approved/denied here, and adding one would
-- invite a director to leave it pending and a family to think the absence was
-- refused. Attendance itself is still recorded by staff, in the portal's own
-- register — this table is what the family TOLD us, kept beside it.
--
-- `notified` records the mailboxes the notification actually reached, so the
-- staff list can say "the show's director has no org address and was not
-- emailed" instead of implying everybody knows.
-- ---------------------------------------------------------------------------

create table if not exists family_hub.absence_reports (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null references family_hub.families (id) on delete cascade,
  student_id     uuid not null references family_hub.students (id) on delete cascade,
  -- Nullable on purpose: a production can be retired out from under a report,
  -- and an absence that loses its show is still a thing a family told us.
  -- offering_title keeps it readable either way.
  production_id  uuid references family_hub.productions (id) on delete set null,
  offering_title text not null,
  starts_on      date not null,
  ends_on        date not null,
  reason         text not null default '',
  reported_by_name text,
  notified       text[] not null default '{}',
  created_at     timestamptz not null default now(),
  constraint absence_reports_dates check (ends_on >= starts_on)
);

create index if not exists absence_reports_family_idx
  on family_hub.absence_reports (family_id, starts_on desc);
create index if not exists absence_reports_production_idx
  on family_hub.absence_reports (production_id, starts_on);

alter table family_hub.absence_reports enable row level security;

-- Same three-line shape as pickup_requests (0036): a family sees its own,
-- staff see all, and only a parent of that household may file one. The app
-- talks to this through the service role and enforces the same rules in
-- TypeScript; these policies are the defense in depth for anything that
-- reaches PostgREST with a user token — which the staff portal does.
drop policy if exists absence_read on family_hub.absence_reports;
create policy absence_read on family_hub.absence_reports
  for select
  using (family_id = family_hub.auth_family_id() or family_hub.is_staffish());

drop policy if exists absence_insert on family_hub.absence_reports;
create policy absence_insert on family_hub.absence_reports
  for insert
  with check (
    family_id = family_hub.auth_family_id()
    and family_hub.auth_role() = 'parent'::family_hub.app_role
  );

-- No update and no delete policy. A report is a record of what a family said;
-- correcting it is filing another one, not rewriting the first.
