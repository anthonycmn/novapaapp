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
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function auth_family_id() returns uuid
language sql stable security definer set search_path = public as $$
  select family_id from profiles where id = auth.uid()
$$;

create or replace function is_staffish() returns boolean
language sql stable security definer set search_path = public as $$
  select auth_role() in ('staff', 'admin', 'super_admin')
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
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
