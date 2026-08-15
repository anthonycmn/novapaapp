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
