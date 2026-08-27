-- ═════════════════════════════════════════════════════════════════════
-- family_hub replay on novapa (tlkuqwsqicxcjdmumkje)
-- Generated 2026-08-15 from supabase/migrations/0001..0010 plus the
-- 0011..0018 bodies recovered from novapa-deh's migration history.
-- 0013 (portal signup-guard edit) is intentionally OMITTED: superseded by
-- the portal's own migration 0081; signup on novapa is unrestricted.
--
-- Everything lives in the dedicated family_hub schema. public belongs to
-- the website, staff_portal to the portal; this file touches neither.
-- No triggers on auth.users (portal hard rule 2). Additive only.
-- ═════════════════════════════════════════════════════════════════════

create schema if not exists family_hub;

grant usage on schema family_hub to anon, authenticated, service_role;

alter default privileges in schema family_hub
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema family_hub
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema family_hub
  grant execute on functions to anon, authenticated, service_role;

set search_path to family_hub, extensions;


-- ════════ from 0001_foundation.sql ════════

-- ─────────────────────────────────────────────────────────────────────────
-- 0001_foundation.sql — roles, profiles, families, students, RLS baseline
-- NOVA PA Family Hub. Applied with `supabase db push` once the project
-- exists (NEEDS-FROM-TONY.md #1). The mock adapter mirrors these rules.
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- App roles. Stored on profiles; RLS policies key off helper functions.
create type app_role as enum ('parent', 'student', 'staff', 'admin', 'super_admin');

-- ── profiles: one row per auth user ──────────────────────────────────────
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text not null,
  role app_role not null default 'parent',
  family_id uuid, -- fk added after families exists
  staff_id uuid,
  created_at timestamptz not null default now()
);

-- ── families ─────────────────────────────────────────────────────────────
create table families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address_line1 text not null default '',
  address_line2 text,
  city text not null default '',
  state text not null default 'VA',
  zip text not null default '',
  preferred_contact_method text not null default 'email'
    check (preferred_contact_method in ('email', 'sms', 'phone')),
  communication_language text not null default 'en',
  staff_notes text, -- staff-visible only (enforced via column-level view below)
  emergency_contacts jsonb not null default '[]',
  authorized_pickups jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles
  add constraint profiles_family_fk foreign key (family_id) references families (id) on delete set null;

create table guardians (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  user_id uuid references profiles (id) on delete set null,
  full_name text not null,
  email text not null,
  phone text not null default '',
  relationship text not null default '',
  is_primary boolean not null default false
);

-- ── students ─────────────────────────────────────────────────────────────
-- Students under 13 have no auth account (has_login = false); COPPA-style
-- handling is documented in PRIVACY.md.
create table students (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  preferred_name text,
  pronouns text,
  date_of_birth date not null,
  grade text not null default '',
  school text,
  tshirt_size text,
  allergies text,      -- staff + own family only
  medical_flags text,  -- staff + own family only
  headshot_url text,
  headshot_print_url text,
  resume_pdf_url text,
  resume_credits jsonb not null default '[]',
  vocal_range text,
  dance_experience text,
  audition_song_url text,
  audition_audio_url text,
  consent_photo_use boolean not null default false,
  consent_face_matching boolean not null default false,
  consent_directory_visible boolean not null default false,
  has_login boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── hopes: private per-season casting hopes (parent + student authored) ──
create table hopes_entries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  season_id uuid not null,
  author text not null check (author in ('parent', 'student')),
  text text not null,
  visible_to_student boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS helpers
-- ─────────────────────────────────────────────────────────────────────────

create or replace function auth_role() returns app_role
language sql stable security definer set search_path = family_hub, extensions as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function auth_family_id() returns uuid
language sql stable security definer set search_path = family_hub, extensions as $$
  select family_id from profiles where id = auth.uid()
$$;

create or replace function is_staffish() returns boolean
language sql stable security definer set search_path = family_hub, extensions as $$
  select auth_role() in ('staff', 'admin', 'super_admin')
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = family_hub, extensions as $$
  select auth_role() in ('admin', 'super_admin')
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- RLS policies — deny by default, then allow narrowly.
-- Core rule: a family sees ONLY its own rows; staff see students in their
-- programs (program assignment lands in 0002); admins see everything.
-- ─────────────────────────────────────────────────────────────────────────

alter table profiles enable row level security;
alter table families enable row level security;
alter table guardians enable row level security;
alter table students enable row level security;
alter table hopes_entries enable row level security;

-- profiles: users read themselves; staffish read all; users update themselves
create policy profiles_select_self on profiles
  for select using (id = auth.uid() or is_staffish());
create policy profiles_update_self on profiles
  for update using (id = auth.uid());

-- families: own family or staffish
create policy families_select on families
  for select using (id = auth_family_id() or is_staffish());
create policy families_update on families
  for update using (
    (id = auth_family_id() and auth_role() = 'parent') or is_admin()
  );

-- guardians: own family or staffish
create policy guardians_select on guardians
  for select using (family_id = auth_family_id() or is_staffish());
create policy guardians_write on guardians
  for all using (
    (family_id = auth_family_id() and auth_role() = 'parent') or is_admin()
  );

-- students: own family or staffish. NEVER other families.
create policy students_select on students
  for select using (family_id = auth_family_id() or is_staffish());
create policy students_update on students
  for update using (
    (family_id = auth_family_id() and auth_role() = 'parent') or is_admin()
  );
create policy students_insert on students
  for insert with check (
    (family_id = auth_family_id() and auth_role() = 'parent') or is_admin()
  );

-- hopes: own family (parents always; students only when shared/self-authored)
-- + staffish read. No staff writes: hopes belong to families.
create policy hopes_select_family on hopes_entries
  for select using (
    is_staffish()
    or exists (
      select 1 from students s
      where s.id = hopes_entries.student_id
        and s.family_id = auth_family_id()
        and (
          auth_role() = 'parent'
          or (auth_role() = 'student' and (hopes_entries.author = 'student' or hopes_entries.visible_to_student))
        )
    )
  );
create policy hopes_write_family on hopes_entries
  for insert with check (
    exists (
      select 1 from students s
      where s.id = hopes_entries.student_id
        and s.family_id = auth_family_id()
    )
    and auth_role() in ('parent', 'student')
  );

-- staff_notes is staff-only: parents read families through this view,
-- which the app's Supabase adapter uses for non-staff sessions.
create view families_parent_view as
  select id, name, address_line1, address_line2, city, state, zip,
         preferred_contact_method, communication_language,
         emergency_contacts, authorized_pickups, created_at, updated_at
  from families;

comment on view families_parent_view is
  'Family record without staff_notes; used for parent sessions.';


-- ════════ from 0002_catalog.sql ════════

-- ─────────────────────────────────────────────────────────────────────────
-- 0002_catalog.sql — seasons, programs, classes, productions, enrollments,
-- casting, show history, staff profiles, staff program assignments.
-- ─────────────────────────────────────────────────────────────────────────

create table seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false
);

create table programs (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons (id),
  name text not null,
  description text
);

create table staff_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles (id) on delete set null,
  full_name text not null,
  title text not null default '',
  bio text not null default '',
  photo_url text,
  specialties text[] not null default '{}',
  credits text,
  pending_changes jsonb, -- staff-submitted edits awaiting admin approval
  is_published boolean not null default false
);

create table classes (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs (id),
  name text not null,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  location text not null default ''
);

create table class_staff (
  class_id uuid not null references classes (id) on delete cascade,
  staff_id uuid not null references staff_profiles (id) on delete cascade,
  primary key (class_id, staff_id)
);

create table productions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs (id),
  season_id uuid not null references seasons (id),
  title text not null,
  venue text not null default '',
  director_staff_id uuid references staff_profiles (id),
  opens_on date,
  closes_on date,
  button_template_url text,
  tickets_url text
);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  class_id uuid references classes (id),
  production_id uuid references productions (id),
  status text not null default 'enrolled'
    check (status in ('enrolled', 'waitlisted', 'withdrawn')),
  balance_cents int not null default 0,
  source text not null default 'manual'
    check (source in ('registration_portal', 'manual')),
  created_at timestamptz not null default now(),
  check (num_nonnulls(class_id, production_id) = 1)
);

create table casting_assignments (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions (id) on delete cascade,
  student_id uuid not null references students (id) on delete cascade,
  character_name text not null,
  cast_group text,
  is_understudy boolean not null default false,
  rehearsal_track text,
  published_at timestamptz -- null until casting released
);

create table show_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  production_title text not null,
  role text not null,
  season_name text not null default '',
  director text,
  venue text,
  organization text,
  from_casting boolean not null default false,
  year text not null default ''
);

-- Staff program assignment: which programs a staff member works, used to
-- scope staff visibility ("Staff see only students in programs they are
-- assigned to").
create table staff_program_assignments (
  staff_id uuid not null references staff_profiles (id) on delete cascade,
  program_id uuid not null references programs (id) on delete cascade,
  primary key (staff_id, program_id)
);

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table seasons enable row level security;
alter table programs enable row level security;
alter table staff_profiles enable row level security;
alter table classes enable row level security;
alter table class_staff enable row level security;
alter table productions enable row level security;
alter table enrollments enable row level security;
alter table casting_assignments enable row level security;
alter table show_history enable row level security;
alter table staff_program_assignments enable row level security;

-- Catalog data is readable by any signed-in user.
create policy seasons_read on seasons for select using (auth.uid() is not null);
create policy programs_read on programs for select using (auth.uid() is not null);
create policy classes_read on classes for select using (auth.uid() is not null);
create policy class_staff_read on class_staff for select using (auth.uid() is not null);
create policy productions_read on productions for select using (auth.uid() is not null);

-- Staff profiles: published ones are readable by all; drafts by admin +
-- the owner. Owners update their own row (pending_changes only, approved
-- by admin via service role).
create policy staff_profiles_read on staff_profiles
  for select using (is_published or is_admin() or user_id = auth.uid());
create policy staff_profiles_update_own on staff_profiles
  for update using (user_id = auth.uid() or is_admin());

-- Enrollments: own family, or staff assigned to the program, or admin.
create or replace function staff_has_program(target_program uuid) returns boolean
language sql stable security definer set search_path = family_hub, extensions as $$
  select exists (
    select 1
    from staff_program_assignments spa
    join staff_profiles sp on sp.id = spa.staff_id
    where sp.user_id = auth.uid() and spa.program_id = target_program
  )
$$;

create policy enrollments_read on enrollments
  for select using (
    is_admin()
    or exists (
      select 1 from students s
      where s.id = enrollments.student_id and s.family_id = auth_family_id()
    )
    or (
      auth_role() = 'staff' and (
        exists (
          select 1 from classes c
          where c.id = enrollments.class_id and staff_has_program(c.program_id)
        )
        or exists (
          select 1 from productions p
          where p.id = enrollments.production_id and staff_has_program(p.program_id)
        )
      )
    )
  );
create policy enrollments_write_admin on enrollments
  for all using (is_admin());

-- Casting: families see only PUBLISHED rows for their own students; staff
-- and admin see all.
create policy casting_read on casting_assignments
  for select using (
    is_staffish()
    or (
      published_at is not null
      and exists (
        select 1 from students s
        where s.id = casting_assignments.student_id
          and s.family_id = auth_family_id()
      )
    )
  );
create policy casting_write_staff on casting_assignments
  for all using (is_staffish());

-- Show history: own family + staffish read; own family + admin write.
create policy show_history_read on show_history
  for select using (
    is_staffish()
    or exists (
      select 1 from students s
      where s.id = show_history.student_id and s.family_id = auth_family_id()
    )
  );
create policy show_history_write on show_history
  for insert with check (
    is_admin()
    or exists (
      select 1 from students s
      where s.id = show_history.student_id and s.family_id = auth_family_id()
    )
  );

create policy spa_read on staff_program_assignments
  for select using (is_staffish());
create policy spa_write on staff_program_assignments
  for all using (is_admin());

-- Auto-append show history when casting is published.
create or replace function on_casting_published() returns trigger
language plpgsql security definer set search_path = family_hub, extensions as $$
begin
  if new.published_at is not null and (old.published_at is null or tg_op = 'INSERT') then
    insert into show_history (student_id, production_title, role, season_name, from_casting, year)
    select new.student_id, p.title, new.character_name, s.name, true,
           coalesce(to_char(p.opens_on, 'YYYY'), '')
    from productions p
    join seasons s on s.id = p.season_id
    where p.id = new.production_id;
  end if;
  return new;
end;
$$;

create trigger casting_published_trigger
  after insert or update of published_at on casting_assignments
  for each row execute function on_casting_published();


-- ════════ from 0003_schedule_forms.sql ════════

-- ─────────────────────────────────────────────────────────────────────────
-- 0003_schedule_forms.sql — calendar events, iCal tokens, health forms,
-- early drop-off / late pick-up requests.
-- ─────────────────────────────────────────────────────────────────────────

create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'other'
    check (type in ('class','rehearsal','tech','performance','workshop','fitting','photo_call','other')),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  call_time timestamptz,
  location text not null default '',
  map_url text,
  what_to_bring text,
  contact_name text,
  contact_email text,
  class_id uuid references classes (id) on delete cascade,
  production_id uuid references productions (id) on delete cascade,
  changed_at timestamptz,
  change_note text,
  check (num_nonnulls(class_id, production_id) >= 1)
);

create index calendar_events_starts_at_idx on calendar_events (starts_at);

-- Tokenized per-family iCal feed URL (#5). Regenerating the token
-- invalidates old subscriptions.
create table family_calendar_tokens (
  family_id uuid primary key references families (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

-- ── health forms (#9) ────────────────────────────────────────────────────
create table health_forms (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  season_id uuid not null references seasons (id),
  answers jsonb not null default '{}',
  signed_by_name text,
  signed_at timestamptz,
  signed_from_ip inet,
  expires_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, season_id)
);

create index health_forms_expiry_idx on health_forms (expires_on)
  where signed_at is not null;

-- ── early drop-off / late pick-up (#10) ──────────────────────────────────
create table pickup_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  family_id uuid not null references families (id) on delete cascade,
  kind text not null check (kind in ('early_dropoff','late_pickup','both')),
  start_date date not null,
  end_date date not null,
  recurring_days int[] not null default '{}',
  drop_off_time time,
  pick_up_time time,
  reason text not null default '',
  supervising_adult text,
  authorized_pickup_person text,
  fee_cents int not null default 0,
  status text not null default 'pending'
    check (status in ('pending','approved','denied')),
  decision_note text,
  decided_by_name text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index pickup_requests_status_idx on pickup_requests (status, start_date);

-- ── notifications & feed (Phase 2 tables, defined here alongside their
--    Phase 3 consumers so migrations stay in dependency order) ────────────
create table feed_posts (
  id uuid primary key default gen_random_uuid(),
  author_staff_id uuid references staff_profiles (id),
  author_name text not null,
  title text,
  body text not null,
  image_urls text[] not null default '{}',
  video_embed_url text,
  link_url text,
  category text not null default 'general',
  audience jsonb not null default '{}',
  is_pinned boolean not null default false,
  published_at timestamptz not null default now(),
  reaction_counts jsonb not null default '{"heart":0,"clap":0,"star":0}'
);

create table post_questions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references feed_posts (id) on delete cascade,
  asker_user_id uuid not null references profiles (id) on delete cascade,
  asker_name text not null,
  question text not null,
  answer text,
  answered_by_name text,
  answered_at timestamptz,
  is_public_faq boolean not null default false,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_unread_idx on notifications (user_id, read_at);

create table notification_prefs (
  user_id uuid primary key references profiles (id) on delete cascade,
  enabled jsonb not null default '{}',
  quiet_hours_start time,
  quiet_hours_end time
);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

create table email_sends (
  id uuid primary key default gen_random_uuid(),
  template_id text,
  subject text not null,
  body text not null,
  category text not null,
  audience jsonb not null default '{}',
  scheduled_for timestamptz,
  sent_at timestamptz,
  stats jsonb not null default '{"delivered":0,"opened":0,"total":0}',
  created_by_name text not null default ''
);

-- Family-level email category opt-outs. Critical category ignores these.
create table email_preferences (
  family_id uuid not null references families (id) on delete cascade,
  category text not null,
  opted_out boolean not null default false,
  primary key (family_id, category),
  check (category <> 'critical') -- critical can never be opted out of
);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────

alter table calendar_events enable row level security;
alter table family_calendar_tokens enable row level security;
alter table health_forms enable row level security;
alter table pickup_requests enable row level security;
alter table feed_posts enable row level security;
alter table post_questions enable row level security;
alter table notifications enable row level security;
alter table notification_prefs enable row level security;
alter table push_subscriptions enable row level security;
alter table email_sends enable row level security;
alter table email_preferences enable row level security;

-- Calendar events are readable by any signed-in user; the app filters to
-- the family's enrollments. Only staff write.
create policy calendar_read on calendar_events
  for select using (auth.uid() is not null);
create policy calendar_write on calendar_events
  for all using (is_staffish());

-- iCal tokens: own family + admin. The public .ics route reads via the
-- service role, not this policy.
create policy cal_tokens_read on family_calendar_tokens
  for select using (family_id = auth_family_id() or is_admin());
create policy cal_tokens_write on family_calendar_tokens
  for all using (family_id = auth_family_id() or is_admin());

-- Health forms: own family read/write; staffish read (safety roster).
-- Staff never write a family's attestation.
create policy health_read on health_forms
  for select using (
    is_staffish()
    or exists (
      select 1 from students s
      where s.id = health_forms.student_id and s.family_id = auth_family_id()
    )
  );
create policy health_write on health_forms
  for all using (
    exists (
      select 1 from students s
      where s.id = health_forms.student_id and s.family_id = auth_family_id()
    )
    and auth_role() = 'parent'
  );

-- Pickup requests: own family read/create; staffish read + decide.
create policy pickup_read on pickup_requests
  for select using (family_id = auth_family_id() or is_staffish());
create policy pickup_insert on pickup_requests
  for insert with check (family_id = auth_family_id() and auth_role() = 'parent');
create policy pickup_decide on pickup_requests
  for update using (is_staffish());

-- Feed: everyone signed in reads (app filters by audience); staff write.
create policy feed_read on feed_posts for select using (auth.uid() is not null);
create policy feed_write on feed_posts for all using (is_staffish());

-- Questions: asker + staffish, or published FAQs.
create policy questions_read on post_questions
  for select using (
    is_staffish() or asker_user_id = auth.uid() or is_public_faq
  );
create policy questions_insert on post_questions
  for insert with check (asker_user_id = auth.uid());
create policy questions_answer on post_questions
  for update using (is_staffish());

-- Notifications & prefs & push subscriptions: strictly own rows.
create policy notifications_own on notifications
  for select using (user_id = auth.uid());
create policy notifications_update_own on notifications
  for update using (user_id = auth.uid());
create policy prefs_own on notification_prefs
  for all using (user_id = auth.uid());
create policy push_own on push_subscriptions
  for all using (user_id = auth.uid());

-- Email: staff only.
create policy email_sends_staff on email_sends for all using (is_staffish());
create policy email_prefs_read on email_preferences
  for select using (family_id = auth_family_id() or is_staffish());
create policy email_prefs_write on email_preferences
  for all using (family_id = auth_family_id() or is_admin());

-- Health-form expiry reminders at 30/14/3 days are driven by a scheduled
-- job reading health_forms_expiry_idx (see scripts/ and NEEDS-FROM-TONY #2).
create or replace function health_forms_expiring(days_ahead int)
returns table (student_id uuid, family_id uuid, expires_on date)
language sql stable security definer set search_path = family_hub, extensions as $$
  select hf.student_id, s.family_id, hf.expires_on
  from health_forms hf
  join students s on s.id = hf.student_id
  where hf.signed_at is not null
    and hf.expires_on = current_date + days_ahead
$$;


-- ════════ from 0004_registration.sql ════════

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


-- ════════ from 0005_store.sql ════════

-- ─────────────────────────────────────────────────────────────────────────
-- 0005_store.sql — spirit buttons store (#11).
-- ─────────────────────────────────────────────────────────────────────────

-- Per-production frame art, so each show can look like itself.
create table button_templates (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions (id) on delete cascade,
  name text not null,
  frame_image_url text,
  logo_url text,
  accent_color text not null default '#8e1f2f',
  season_name text not null default '',
  is_active boolean not null default true
);

-- Cart lives server-side so it survives a device switch mid-order.
create table cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  template_id uuid not null references button_templates (id) on delete cascade,
  photo_url text not null,
  photo_width int not null,
  photo_height int not null,
  student_name text not null,
  role text not null default '',
  size_inches text not null check (size_inches in ('2.25','3','3.5')),
  style text not null check (style in ('classic','star','ribbon')),
  quantity int not null check (quantity between 1 and 99),
  unit_price_cents int not null,
  created_at timestamptz not null default now()
);

create table button_orders (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  production_id uuid references productions (id),
  reference text not null unique,
  subtotal_cents int not null,
  status text not null default 'new'
    check (status in ('new','in_production','ready','delivered')),
  payment_ref text not null default '',
  paid_at timestamptz,
  placed_by_name text not null default '',
  admin_note text,
  created_at timestamptz not null default now(),
  status_updated_at timestamptz not null default now()
);

create index button_orders_status_idx on button_orders (status, created_at);

-- Items are snapshotted onto the order: a later template edit must not
-- change what a family already bought.
create table button_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references button_orders (id) on delete cascade,
  template_id uuid references button_templates (id),
  photo_url text not null,
  photo_width int not null,
  photo_height int not null,
  student_name text not null,
  role text not null default '',
  size_inches text not null,
  style text not null,
  quantity int not null,
  unit_price_cents int not null
);

-- Human-readable order references: NPA-1042, NPA-1043, …
create sequence button_order_reference_seq start 1042;

create or replace function next_order_reference() returns text
language sql volatile as $$
  select 'NPA-' || nextval('button_order_reference_seq')::text
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table button_templates enable row level security;
alter table cart_items enable row level security;
alter table button_orders enable row level security;
alter table button_order_items enable row level security;

-- Any signed-in user may see active templates; only admins edit them.
create policy templates_read on button_templates
  for select using (auth.uid() is not null and (is_active or is_admin()));
create policy templates_write on button_templates
  for all using (is_admin());

-- A cart belongs to exactly one user.
create policy cart_own on cart_items
  for all using (user_id = auth.uid());

-- Orders: own family reads; staff read all (fulfillment); staff update
-- status. Families never change status or price.
create policy orders_read on button_orders
  for select using (family_id = auth_family_id() or is_staffish());
create policy orders_insert on button_orders
  for insert with check (family_id = auth_family_id());
create policy orders_update_staff on button_orders
  for update using (is_staffish());

create policy order_items_read on button_order_items
  for select using (
    is_staffish()
    or exists (
      select 1 from button_orders o
      where o.id = button_order_items.order_id and o.family_id = auth_family_id()
    )
  );
create policy order_items_insert on button_order_items
  for insert with check (
    exists (
      select 1 from button_orders o
      where o.id = button_order_items.order_id and o.family_id = auth_family_id()
    )
  );

-- Photos uploaded for buttons live in a private Storage bucket; the policy
-- mirrors the order rules. Create the bucket with:
--   insert into storage.buckets (id, name, public)
--   values ('button-photos', 'button-photos', false);


-- ════════ from 0006_photos.sql ════════

-- ─────────────────────────────────────────────────────────────────────────
-- 0006_photos.sql — SmugMug galleries, face embeddings (pgvector), matches,
-- and the consent audit trail (#6).
--
-- This migration handles biometric data about children. Read PRIVACY.md
-- before changing anything here.
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists vector with schema extensions;

-- Galleries and photos are metadata + links only. Images stay on SmugMug so
-- purchases keep flowing through their cart; we never re-host originals.
create table photo_galleries (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  title text not null,
  production_id uuid references productions (id) on delete set null,
  photo_count int not null default 0,
  url text not null,
  created_at timestamptz not null default now(),
  ingested_at timestamptz
);

create table gallery_photos (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references photo_galleries (id) on delete cascade,
  external_id text not null unique,
  thumbnail_url text not null,
  url text not null,
  taken_at timestamptz,
  width int not null default 0,
  height int not null default 0
);

-- Parent-uploaded reference photos. Deleted on revocation.
create table reference_photos (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  image_url text not null,
  uploaded_at timestamptz not null default now()
);

-- ── embeddings ───────────────────────────────────────────────────────────
-- 512-d ArcFace vectors. Exactly one of student_id (from a reference photo)
-- or photo_id (from a gallery photo) is set.
--
-- ON ENCRYPTION: these are stored as plaintext vectors, because similarity
-- search must operate on them — encrypting the column would make pgvector
-- useless. The protections are (a) Supabase's at-rest disk encryption,
-- (b) RLS that denies ALL client access so only the service role can read
-- them, and (c) the vectors are not invertible back to a viewable face.
-- PRIVACY.md states this honestly rather than claiming column-level crypto.
create table face_embeddings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students (id) on delete cascade,
  photo_id uuid references gallery_photos (id) on delete cascade,
  embedding vector(512) not null,
  detection_confidence real not null,
  created_at timestamptz not null default now(),
  constraint embedding_source_exactly_one
    check (num_nonnulls(student_id, photo_id) = 1)
);

-- Approximate nearest-neighbor index for cosine distance.
create index face_embeddings_cosine_idx
  on face_embeddings using hnsw (embedding vector_cosine_ops);

create index face_embeddings_student_idx on face_embeddings (student_id)
  where student_id is not null;

create table photo_matches (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  photo_id uuid not null references gallery_photos (id) on delete cascade,
  similarity real not null,
  state text not null default 'matched'
    check (state in ('matched','rejected','confirmed')),
  created_at timestamptz not null default now(),
  corrected_at timestamptz,
  unique (student_id, photo_id)
);

-- Audit trail. Revocation rows record HOW MUCH was deleted, so a parent can
-- be shown proof rather than a promise.
create table face_consent_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  action text not null check (action in ('granted','revoked')),
  actor_name text not null,
  created_at timestamptz not null default now(),
  embeddings_deleted int,
  matches_deleted int,
  reference_photos_deleted int
);

-- ─────────────────────────────────────────────────────────────────────────
-- Revocation. Deletes everything derived from a child's face and records
-- the counts. Runs as SECURITY DEFINER because face_embeddings denies all
-- client access; the guard below re-checks the caller's rights.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function revoke_face_consent(target_student uuid)
returns table (embeddings_deleted int, matches_deleted int, reference_photos_deleted int)
language plpgsql security definer set search_path = family_hub, extensions as $$
declare
  emb_count int;
  match_count int;
  ref_count int;
  target_family uuid;
begin
  select family_id into target_family from students where id = target_student;
  if target_family is null then
    raise exception 'Student not found';
  end if;

  -- A parent of this child, or an admin acting on their request.
  if not (is_admin() or (auth_role() = 'parent' and auth_family_id() = target_family)) then
    raise exception 'Not permitted to revoke consent for this student';
  end if;

  delete from face_embeddings where student_id = target_student;
  get diagnostics emb_count = row_count;

  delete from photo_matches where student_id = target_student;
  get diagnostics match_count = row_count;

  delete from reference_photos where student_id = target_student;
  get diagnostics ref_count = row_count;

  update students
    set consent_face_matching = false, updated_at = now()
    where id = target_student;

  insert into face_consent_events
    (student_id, action, actor_name, embeddings_deleted, matches_deleted, reference_photos_deleted)
  values (
    target_student, 'revoked',
    coalesce((select display_name from profiles where id = auth.uid()), 'system'),
    emb_count, match_count, ref_count
  );

  return query select emb_count, match_count, ref_count;
end;
$$;

-- Safety net: if a student's consent flag is ever turned off by any other
-- path, the derived biometric data goes with it.
create or replace function purge_face_data_on_consent_off() returns trigger
language plpgsql security definer set search_path = family_hub, extensions as $$
begin
  if old.consent_face_matching and not new.consent_face_matching then
    delete from face_embeddings where student_id = new.id;
    delete from photo_matches where student_id = new.id;
    delete from reference_photos where student_id = new.id;
  end if;
  return new;
end;
$$;

create trigger purge_face_data_trigger
  after update of consent_face_matching on students
  for each row execute function purge_face_data_on_consent_off();

-- ─────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────

alter table photo_galleries enable row level security;
alter table gallery_photos enable row level security;
alter table reference_photos enable row level security;
alter table face_embeddings enable row level security;
alter table photo_matches enable row level security;
alter table face_consent_events enable row level security;

-- Galleries and photos: any signed-in user may browse.
create policy galleries_read on photo_galleries
  for select using (auth.uid() is not null);
create policy galleries_write on photo_galleries for all using (is_staffish());
create policy gallery_photos_read on gallery_photos
  for select using (auth.uid() is not null);
create policy gallery_photos_write on gallery_photos for all using (is_staffish());

-- Reference photos: the family's own uploads. Staff have NO access —
-- these are photos of a child supplied for one narrow purpose.
create policy reference_photos_own on reference_photos
  for all using (
    exists (
      select 1 from students s
      where s.id = reference_photos.student_id and s.family_id = auth_family_id()
    )
    or is_admin()
  );

-- Embeddings: no client role may read or write them, ever. Only the
-- service role (background job) and the SECURITY DEFINER functions above
-- touch this table. Deliberately no permissive policy — RLS with zero
-- policies denies everything.
revoke all on face_embeddings from anon, authenticated;

-- Matches: the family, or an admin helping with a report. NOT staff at
-- large, and never another family.
create policy matches_read on photo_matches
  for select using (
    is_admin()
    or exists (
      select 1 from students s
      where s.id = photo_matches.student_id and s.family_id = auth_family_id()
    )
  );
create policy matches_correct on photo_matches
  for update using (
    is_admin()
    or exists (
      select 1 from students s
      where s.id = photo_matches.student_id and s.family_id = auth_family_id()
    )
  );

create policy consent_events_read on face_consent_events
  for select using (
    is_admin()
    or exists (
      select 1 from students s
      where s.id = face_consent_events.student_id and s.family_id = auth_family_id()
    )
  );


-- ════════ from 0007_reviews.sql ════════

-- ─────────────────────────────────────────────────────────────────────────
-- 0007_reviews.sql — private class & production reviews (#15).
--
-- The privacy model is the feature. Three rules the policies below enforce:
--   1. A review is never visible to another family, and never public.
--   2. Admins see everything, including who wrote an anonymous review.
--   3. Staff see reviews about their own work, but must NOT be able to
--      attribute an anonymous one.
--
-- Rule 3 cannot be done with row-level security alone, because RLS filters
-- rows, not columns. Staff therefore read through `staff_review_view`,
-- which simply does not select the reviewer columns.
-- ─────────────────────────────────────────────────────────────────────────

create table review_windows (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('mid_session','end_of_session','post_show')),
  subject_type text not null check (subject_type in ('class','production')),
  subject_id uuid not null,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  check (closes_at > opens_at)
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  window_id uuid not null references review_windows (id) on delete cascade,
  subject_type text not null check (subject_type in ('class','production')),
  subject_id uuid not null,
  -- Always recorded. Admins may read it; staff never do.
  reviewer_user_id uuid not null references profiles (id) on delete cascade,
  reviewer_name text not null,
  family_id uuid not null references families (id) on delete cascade,
  staff_ids uuid[] not null default '{}',
  instruction_quality int not null check (instruction_quality between 1 and 5),
  communication int not null check (communication between 1 and 5),
  child_growth int not null check (child_growth between 1 and 5),
  organization int not null check (organization between 1 and 5),
  comment text not null default '',
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  flagged_at timestamptz,
  flag_reason text,
  resolved_at timestamptz,
  resolution_note text,
  -- One review per family per window.
  unique (window_id, family_id)
);

create index reviews_subject_idx on reviews (subject_type, subject_id, created_at desc);
create index reviews_staff_idx on reviews using gin (staff_ids);
create index reviews_flagged_idx on reviews (flagged_at)
  where flagged_at is not null and resolved_at is null;

-- ── the staff-safe projection ────────────────────────────────────────────
-- No reviewer_user_id, no reviewer_name, no family_id. Anonymous reviews
-- collapse to 'A family'. Staff read ONLY this view.
create view staff_review_view
with (security_invoker = true) as
  select
    r.id,
    r.subject_type,
    r.subject_id,
    r.staff_ids,
    case when r.is_anonymous then 'A family' else r.reviewer_name end as attribution,
    r.instruction_quality,
    r.communication,
    r.child_growth,
    r.organization,
    r.comment,
    r.created_at
  from reviews r;

comment on view staff_review_view is
  'Reviews with reviewer identity removed. The only path staff use to read reviews.';

-- ─────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────

alter table review_windows enable row level security;
alter table reviews enable row level security;

-- Any signed-in user may see which windows are open; the app filters to the
-- ones they're enrolled in.
create policy review_windows_read on review_windows
  for select using (auth.uid() is not null);
create policy review_windows_write on review_windows
  for all using (is_admin());

-- A family reads its OWN reviews. Admins read everything. Note there is no
-- staff policy here at all — staff have no direct select on `reviews`, only
-- on the view above.
create policy reviews_read_own on reviews
  for select using (family_id = auth_family_id() or is_admin());

-- Only a parent may write, only for their own family, only inside an open
-- window, and only for something they're enrolled in.
create policy reviews_insert on reviews
  for insert with check (
    auth_role() = 'parent'
    and family_id = auth_family_id()
    and reviewer_user_id = auth.uid()
    and exists (
      select 1 from review_windows w
      where w.id = reviews.window_id
        and now() between w.opens_at and w.closes_at
    )
    and exists (
      select 1
      from enrollments e
      join students s on s.id = e.student_id
      where s.family_id = auth_family_id()
        and e.status = 'enrolled'
        and (
          (reviews.subject_type = 'class' and e.class_id = reviews.subject_id)
          or (reviews.subject_type = 'production' and e.production_id = reviews.subject_id)
        )
    )
  );

-- Only admins flag/resolve. Families cannot edit a submitted review —
-- an editable review would undermine the audit value of the trend data.
create policy reviews_update_admin on reviews
  for update using (is_admin());

-- Staff reach reviews only through the identity-stripped view. security_invoker
-- makes the view respect the caller's RLS, so grant staff a narrow policy that
-- exposes rows about their own work without the reviewer columns.
create policy reviews_read_staff_scoped on reviews
  for select using (
    is_staffish()
    and exists (
      select 1 from staff_profiles sp
      where sp.user_id = auth.uid() and sp.id = any (reviews.staff_ids)
    )
  );

-- NOTE for whoever wires the Supabase adapter: because the policy above
-- grants staff row access, the application MUST query staff_review_view (not
-- `reviews`) for any staff-facing screen. The mock data layer enforces this
-- by returning a type with no reviewer field; do the same server-side by
-- never selecting reviewer_* for a staff session.


-- ════════ from 0008_materials.sql ════════

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


-- ════════ from 0009_casting.sql ════════

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


-- ════════ from 0010_lessons_messages_products.sql ════════

-- ─────────────────────────────────────────────────────────────────────────
-- 0010_lessons_messages_products.sql — weekly private lessons, family ↔
-- office messaging, and the store catalog (star pages, lesson products).
-- Mirrors the mock provider's rules (tests/lessons.test.ts, messages).
-- ─────────────────────────────────────────────────────────────────────────

-- ── private lessons: weekly recurring slots with the same teacher ────────

create table lesson_slots (
  id uuid primary key default gen_random_uuid(),
  teacher_staff_id uuid not null references staff_profiles (id) on delete cascade,
  discipline text not null check (discipline in ('voice','acting','dance')),
  weekday int not null check (weekday between 0 and 6),
  start_time time not null,
  duration_min int not null check (duration_min between 15 and 120),
  location text not null default '',
  price_per_lesson_cents int not null check (price_per_lesson_cents >= 0)
);

create table lesson_bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references lesson_slots (id) on delete cascade,
  student_id uuid not null references students (id) on delete cascade,
  family_id uuid not null references families (id) on delete cascade,
  start_date date not null,
  status text not null default 'active' check (status in ('active','cancelled')),
  goals text,
  payment_method text not null default 'studio_invoice'
    check (payment_method in ('studio_invoice','stripe')),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

-- Capacity 1: at most one ACTIVE booking per slot, enforced by the
-- database itself, not just the app.
create unique index lesson_slot_one_active_idx
  on lesson_bookings (slot_id) where status = 'active';

-- ── family ↔ office messaging ────────────────────────────────────────────

create table message_threads (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  -- Which desk this goes to; health_safety is confidential to that role.
  recipient_role text not null check (recipient_role in ('admin','health_safety')),
  subject text not null default '',
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references message_threads (id) on delete cascade,
  sender_user_id uuid not null references profiles (id) on delete cascade,
  sender_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index messages_thread_idx on messages (thread_id, created_at);

-- ── store catalog (star pages, lesson products, other items) ─────────────

create table products (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('star_page','private_lesson','designer','other')),
  name text not null,
  description text not null default '',
  base_price_cents int not null check (base_price_cents >= 0),
  production_id uuid references productions (id) on delete set null,
  -- Options/customization schema (sizes, tiers, per-option pricing).
  config jsonb not null default '{}',
  is_active boolean not null default true
);

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table lesson_slots enable row level security;
alter table lesson_bookings enable row level security;
alter table message_threads enable row level security;
alter table messages enable row level security;
alter table products enable row level security;

-- Slots: any signed-in user sees the schedule; admins manage it.
-- (Whether a slot is taken leaks nothing about WHO holds it — bookings
-- below are what stay private.)
create policy lesson_slots_read on lesson_slots
  for select using (auth.uid() is not null);
create policy lesson_slots_write on lesson_slots
  for all using (is_admin());

-- Bookings: own family + staffish. Other families can see that a slot is
-- taken (via a count the app derives) but never whose child holds it.
create policy lesson_bookings_read on lesson_bookings
  for select using (family_id = auth_family_id() or is_staffish());
create policy lesson_bookings_insert on lesson_bookings
  for insert with check (
    family_id = auth_family_id() and auth_role() = 'parent'
    and exists (
      select 1 from students s
      where s.id = lesson_bookings.student_id and s.family_id = auth_family_id()
    )
  );
-- Cancel: the family (own) or staff. Families may only flip status.
create policy lesson_bookings_update on lesson_bookings
  for update using (family_id = auth_family_id() or is_staffish());

-- Occupancy check for the booking page: exposes ONLY whether a slot is
-- taken, so families never query other families' booking rows.
create view lesson_slot_occupancy
with (security_invoker = false) as
  select ls.id as slot_id,
         exists (
           select 1 from lesson_bookings b
           where b.slot_id = ls.id and b.status = 'active'
         ) as taken
  from lesson_slots ls;

comment on view lesson_slot_occupancy is
  'Slot taken/open only — the privacy-safe way to render the booking grid.';

-- Threads & messages: the family, or staffish. Health & safety threads are
-- restricted app-side to the H&S director; admins retain access by policy.
create policy threads_read on message_threads
  for select using (family_id = auth_family_id() or is_staffish());
create policy threads_insert on message_threads
  for insert with check (family_id = auth_family_id() and auth_role() = 'parent');
create policy threads_update on message_threads
  for update using (family_id = auth_family_id() or is_staffish());

create policy messages_read on messages
  for select using (
    exists (
      select 1 from message_threads t
      where t.id = messages.thread_id
        and (t.family_id = auth_family_id() or is_staffish())
    )
  );
create policy messages_insert on messages
  for insert with check (
    sender_user_id = auth.uid()
    and exists (
      select 1 from message_threads t
      where t.id = messages.thread_id
        and (t.family_id = auth_family_id() or is_staffish())
    )
  );

-- Products: signed-in read (active only unless admin); admin write.
create policy products_read on products
  for select using (auth.uid() is not null and (is_active or is_admin()));
create policy products_write on products
  for all using (is_admin());


-- ════════ from novapa-deh history: family_hub_0011_view_security ════════

-- families_parent_view must respect the caller's RLS (it was definer by
-- default, which would have let any signed-in user read every family).
-- lesson_slot_occupancy stays definer BY DESIGN: it exposes only
-- slot_id + taken, so families can render the booking grid without any
-- access to other families' booking rows. Documented accepted risk.

alter view families_parent_view set (security_invoker = true);

revoke all on lesson_slot_occupancy from anon;
grant select on lesson_slot_occupancy to authenticated;

-- ════════ from novapa-deh history: family_hub_0012_invites_table ════════

-- Historical note: on novapa signup is unrestricted (the portal's 0081
-- decided doors are not triggers), so this table is no longer a gate.
-- The adapter still records invite rows as an audit trail of accounts
-- the family hub creates.

create table family_hub_invites (
  email text primary key,
  invited_at timestamptz not null default now(),
  note text
);

alter table family_hub_invites enable row level security;

-- (0013 signup-guard second door: OMITTED — superseded by portal 0081.)

-- ════════ from novapa-deh history: family_hub_0014_audition_profile_authorship ════════

alter table audition_profiles
  add column acknowledged_at timestamptz not null default now(),
  add column submitted_by_user_id uuid references profiles (id) on delete set null,
  add column submitted_by_role text not null default 'parent'
    check (submitted_by_role in ('parent','student'));

-- ════════ from novapa-deh history: family_hub_0015_messages_metadata ════════

alter table staff_profiles
  add column is_health_safety_director boolean not null default false;

alter table message_threads
  add column student_id uuid references students (id) on delete set null,
  add column last_message_at timestamptz not null default now(),
  add column urgent boolean not null default false;

alter table messages
  add column author_side text not null default 'family'
    check (author_side in ('family','staff')),
  add column read_at timestamptz;

-- ════════ from novapa-deh history: family_hub_0016_flexible_store_lines ════════

alter table cart_items
  alter column template_id drop not null,
  alter column photo_url drop not null,
  alter column photo_width drop not null,
  alter column photo_height drop not null,
  alter column student_name drop not null,
  alter column size_inches drop not null,
  alter column style drop not null,
  add column product_type text not null default 'spirit_button',
  add column product_id uuid references products (id) on delete set null,
  add column option_value text,
  add column display_name text not null default '',
  add column customization jsonb;

alter table button_order_items
  alter column photo_url drop not null,
  alter column photo_width drop not null,
  alter column photo_height drop not null,
  alter column student_name drop not null,
  alter column size_inches drop not null,
  alter column style drop not null,
  add column product_type text not null default 'spirit_button',
  add column product_id uuid references products (id) on delete set null,
  add column option_value text,
  add column display_name text not null default '',
  add column customization jsonb;

-- ════════ from novapa-deh history: family_hub_0017_storage_buckets ════════

-- Private storage buckets, prefixed fh- because the bucket namespace is
-- shared project-wide and the portal already owns `resumes` on novapa.
-- fh-reference-photos added for completeness (the app's 7th bucket type).
insert into storage.buckets (id, name, public)
values
  ('fh-headshots', 'fh-headshots', false),
  ('fh-resumes', 'fh-resumes', false),
  ('fh-audition-audio', 'fh-audition-audio', false),
  ('fh-family-documents', 'fh-family-documents', false),
  ('fh-staff-photos', 'fh-staff-photos', false),
  ('fh-button-photos', 'fh-button-photos', false),
  ('fh-reference-photos', 'fh-reference-photos', false)
on conflict (id) do nothing;

-- ════════ from novapa-deh history: family_hub_0018_staff_change_rejection ════════

alter table staff_profiles add column change_rejection text;


-- ════════ epilogue: grants sweep + deliberate revokes ════════
-- Default privileges above already cover these; the sweep is belt & braces.
grant all on all tables in schema family_hub to anon, authenticated, service_role;
grant all on all sequences in schema family_hub to anon, authenticated, service_role;
grant execute on all functions in schema family_hub to anon, authenticated, service_role;

-- Re-assert the two deliberate lockdowns (the sweep above re-granted them):
-- face embeddings are service-role only; the occupancy view is signed-in only.
revoke all on family_hub.face_embeddings from anon, authenticated;
revoke all on family_hub.lesson_slot_occupancy from anon;
grant select on family_hub.lesson_slot_occupancy to authenticated;
