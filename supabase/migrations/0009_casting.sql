-- ─────────────────────────────────────────────────────────────────────────
-- SCHEMA OWNERSHIP. Everything below belongs to `family_hub`, the family
-- hub's own schema — never `public`, which is the website's and sits behind
-- live checkout (its `families` table is a different table with 772 rows in
-- it). Unqualified CREATEs land in the first schema on the search_path, so
-- this header is what keeps them out of Jason's way on any replay route:
-- `supabase db push`, the SQL editor, or a rebuild into a fresh project.
-- The app and every script are pinned to the same schema.
--
-- `extensions` and NOT `public` as the second entry, matching what is already
-- deployed: it means nothing here can resolve an unqualified name into the
-- website's schema even by accident, while pgcrypto stays reachable.
-- ─────────────────────────────────────────────────────────────────────────
create schema if not exists family_hub;
set search_path = family_hub, extensions;

-- ─────────────────────────────────────────────────────────────────────────
-- 0009_casting.sql — audition & casting v2: show roles, audition profiles,
-- teacher rubric evaluations, casting boards (with understudies),
-- confirmations, scene/song mapping, and rehearsal-notice bookkeeping.
-- Mirrors the mock provider's rules exactly (tests/auditions.test.ts).
-- ─────────────────────────────────────────────────────────────────────────

create table show_roles (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions (id) on delete cascade,
  name text not null,
  tier text not null check (tier in ('ensemble','featured','supporting','lead')),
  description text not null default '',
  -- null capacity = ensemble group (unlimited); named roles are 1.
  capacity int,
  sort_order int not null default 0,
  unique (production_id, name)
);

create table audition_profiles (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  production_id uuid not null references productions (id) on delete cascade,
  preference_tier text not null check (preference_tier in ('ensemble','featured','supporting','lead')),
  previous_roles text not null default '',
  hopes text not null default '',
  -- Org policy: submission requires acknowledging no guarantee of a part.
  acknowledged_no_guarantee boolean not null default false check (acknowledged_no_guarantee),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, production_id)
);

create table audition_evaluations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  production_id uuid not null references productions (id) on delete cascade,
  discipline text not null check (discipline in ('acting','vocal','dance')),
  evaluator_user_id uuid references profiles (id) on delete set null,
  evaluator_name text not null default '',
  scores jsonb not null default '{}',
  notes text not null default '',
  -- NEVER released to families; creative-team internal.
  callback_notes text not null default '',
  -- Optional practice suggestions; released WITH feedback.
  growth_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, production_id, discipline)
);

-- The working casting board. Draft entries (and understudy entries) are
-- jsonb — they only become casting_assignments rows on submit/publish.
create table casting_boards (
  production_id uuid primary key references productions (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','submitted')),
  entries jsonb not null default '[]',
  understudy_entries jsonb not null default '[]',
  submitted_at timestamptz,
  understudies_published_at timestamptz,
  updated_at timestamptz not null default now()
);

create table casting_confirmations (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references casting_assignments (id) on delete cascade,
  student_id uuid not null references students (id) on delete cascade,
  family_id uuid not null references families (id) on delete cascade,
  -- null until the family responds; "whatever the parent types is final".
  name_correct boolean,
  playbill_name text,
  responded_at timestamptz,
  feedback_requested_at timestamptz,
  -- 12h reminder bookkeeping (org policy).
  last_reminded_at timestamptz,
  reminder_count int not null default 0,
  unique (assignment_id)
);

-- Scene/song → roles mapping ("curriculum"). Drives the parent-facing
-- "exactly what your child is in" view and the role-driven calendar.
create table show_scenes (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('scene','song')),
  role_ids uuid[] not null default '{}',
  sort_order int not null default 0
);

-- Scene-tagged rehearsals: which scenes a calendar event covers. When
-- tagged, the event reaches only students whose role is called.
alter table calendar_events add column scene_ids uuid[];

-- Rehearsal/lesson notices already sent (24h reminders, thank-yous), so
-- the hourly job never double-sends.
create table event_notices (
  event_key text not null,
  family_id uuid not null references families (id) on delete cascade,
  kind text not null check (kind in ('reminder','thanks')),
  sent_at timestamptz not null default now(),
  primary key (event_key, family_id, kind)
);

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table show_roles enable row level security;
alter table audition_profiles enable row level security;
alter table audition_evaluations enable row level security;
alter table casting_boards enable row level security;
alter table casting_confirmations enable row level security;
alter table show_scenes enable row level security;
alter table event_notices enable row level security;

-- Roles & scenes: any signed-in user reads; staff write.
create policy show_roles_read on show_roles for select using (auth.uid() is not null);
create policy show_roles_write on show_roles for all using (is_staffish());
create policy show_scenes_read on show_scenes for select using (auth.uid() is not null);
create policy show_scenes_write on show_scenes for all using (is_staffish());

-- Audition profiles: own family writes/reads; staffish reads.
create policy audition_profiles_read on audition_profiles
  for select using (
    is_staffish()
    or exists (
      select 1 from students s
      where s.id = audition_profiles.student_id and s.family_id = auth_family_id()
    )
  );
create policy audition_profiles_write on audition_profiles
  for all using (
    exists (
      select 1 from students s
      where s.id = audition_profiles.student_id and s.family_id = auth_family_id()
    )
    and auth_role() = 'parent'
  );

-- Evaluations: staff only, directly. Families receive feedback ONLY through
-- family_evaluation_view below (no callback_notes, gated on the family
-- having requested feedback). The app must never select callback_notes for
-- a family session.
create policy evaluations_staff on audition_evaluations
  for all using (is_staffish());

create view family_evaluation_view
with (security_invoker = true) as
  select
    e.id, e.student_id, e.production_id, e.discipline,
    e.evaluator_name, e.scores, e.notes, e.growth_notes, e.created_at
  from audition_evaluations e
  where exists (
    select 1
    from casting_confirmations c
    join casting_assignments a on a.id = c.assignment_id
    where c.student_id = e.student_id
      and a.production_id = e.production_id
      and c.feedback_requested_at is not null
  );

comment on view family_evaluation_view is
  'Feedback release path for families: no callback_notes, only after the family requested feedback.';

-- The view runs as invoker, so families need a narrow base-table policy for
-- their own released rows; callback_notes stays out because staff screens
-- are the only place it is ever selected, and family sessions use the view.
create policy evaluations_family_released on audition_evaluations
  for select using (
    exists (
      select 1
      from casting_confirmations c
      join casting_assignments a on a.id = c.assignment_id
      join students s on s.id = c.student_id
      where c.student_id = audition_evaluations.student_id
        and a.production_id = audition_evaluations.production_id
        and s.family_id = auth_family_id()
        and c.feedback_requested_at is not null
    )
  );

-- Casting boards: staff only. Families never see a board or cast list.
create policy boards_staff on casting_boards for all using (is_staffish());

-- Confirmations: own family reads + responds; staffish reads all.
create policy confirmations_read on casting_confirmations
  for select using (family_id = auth_family_id() or is_staffish());
create policy confirmations_respond on casting_confirmations
  for update using (family_id = auth_family_id() and auth_role() = 'parent');
create policy confirmations_write_staff on casting_confirmations
  for insert with check (is_staffish());

-- Notice bookkeeping is job-internal: staff read for debugging, service
-- role writes.
create policy event_notices_read on event_notices for select using (is_staffish());
create policy event_notices_write on event_notices for all using (is_staffish());
