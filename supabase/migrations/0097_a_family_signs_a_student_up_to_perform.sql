-- ---------------------------------------------------------------------------
-- 0097 - A family signs a student up to perform.
-- ---------------------------------------------------------------------------
-- CJ, 8 Oct 2026: build "Performance Events". CJ creates an event in the
-- staff portal ("NOVAPA One-Year Anniversary Showcase", "Winter Cabaret"),
-- publishes it, and families sign their students up to perform from the
-- NOVA PA Parent Portal.
--
-- One set of rows, two doors, no sync layer (the casting-bridge pattern):
--
--   * The staff portal reads these tables with the staff member's own token
--     and writes ONLY through the pe_staff_* functions below. Every one of
--     them asks staff_portal.portal_role_of_caller() whether the caller is a
--     Chief or an Admin; nobody else can create, review or reorder.
--   * The Parent Portal server acts with the service role (auth.uid() is
--     nobody there), so the family-side functions take the family id the
--     server resolved from the session, exactly like claim_volunteer_slot.
--     Called with a parent's own token they ignore that argument and use the
--     caller's family. Either way the database, not the browser, decides
--     whether the deadline has passed, the student is over the act cap, the
--     act runs long, or a required field is empty.
--
-- What a family can read (RLS, defense in depth under the service role):
-- its own acts and the acts it has been invited onto. Staff notes are their
-- own table with a staff-only policy, so no column of them can ever reach a
-- family. No policy here subqueries its own table: the "acts I can see"
-- answer comes from a SECURITY DEFINER helper, and role checks are wrapped as
-- (select ...) so they are evaluated once per statement (0306/0307).
--
-- The machine never starts outreach. Publishing makes the event visible and
-- tells nobody. pe_staff_notify_families() writes one bell notice per
-- eligible parent, once, when CJ presses "Publish & notify families". The
-- same family_hub.notifications rows /admin/push writes; the existing push
-- drain rings the phones and honors opt-outs and quiet hours.
--
-- Safe to re-run.
-- ---------------------------------------------------------------------------
set search_path = family_hub, public;

/* ---------- who is allowed to run events ---------------------------------- */

-- Chief + Admin in the staff portal. SECURITY DEFINER so a policy can call it
-- without the caller needing to read staff_portal.portal_users.
create or replace function family_hub.pe_is_events_staff()
returns boolean
language sql stable security definer
set search_path to 'family_hub', 'staff_portal', 'public'
as $fn$
  select coalesce(staff_portal.portal_role_of_caller()::text in ('chief', 'admin'), false)
      or coalesce(family_hub.auth_role()::text in ('admin', 'super_admin'), false);
$fn$;

/* The family this call acts for: the service role (the Parent Portal server)
   names it; a parent's own token is held to its own family. */
create or replace function family_hub.pe_caller_family(p_family_id uuid)
returns uuid
language sql stable security definer
set search_path to 'family_hub', 'public'
as $fn$
  select case
           when coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
             or current_user in ('postgres', 'service_role')
           then p_family_id
           else family_hub.auth_family_id()
         end;
$fn$;

/* ---------- the event --------------------------------------------------- */

create table if not exists family_hub.performance_events (
  id                      uuid primary key default gen_random_uuid(),
  title                   text not null check (length(btrim(title)) between 1 and 160),
  subtitle                text,
  description             text,          -- "## " headings, "- " bullets, blank-line paragraphs
  poster_path             text,          -- fh-performance/posters/<event>/<file>
  starts_at               timestamptz,
  call_at                 timestamptz,
  ends_at                 timestamptz,
  venue_name              text,
  venue_address           text,
  signup_opens_at         timestamptz,
  signup_closes_at        timestamptz,
  audience                text not null default 'all' check (audience in ('all', 'chosen')),
  min_age                 int check (min_age is null or min_age between 0 and 99),
  max_age                 int check (max_age is null or max_age between 0 and 99),
  min_grade               int check (min_grade is null or min_grade between -1 and 12),  -- -1 Pre-K, 0 K
  max_grade               int check (max_grade is null or max_grade between -1 and 12),
  act_types               text[] not null default array['song','dance','acting','instrumental','variety','other'],
  act_formats             text[] not null default array['solo','duet','trio','small_group','large_group'],
  max_acts                int check (max_acts is null or max_acts > 0),
  max_acts_per_student    int check (max_acts_per_student is null or max_acts_per_student > 0),
  max_minutes_per_act     numeric(5,2) check (max_minutes_per_act is null or max_minutes_per_act > 0),
  max_performers_per_act  int check (max_performers_per_act is null or max_performers_per_act > 0),
  req_video               text not null default 'optional' check (req_video in ('off','optional','required')),
  req_headshot            text not null default 'optional' check (req_headshot in ('off','optional','required')),
  req_track               text not null default 'optional' check (req_track in ('off','optional','required')),
  req_sheet_music         text not null default 'optional' check (req_sheet_music in ('off','optional','required')),
  req_bio                 text not null default 'optional' check (req_bio in ('off','optional','required')),
  bio_max_chars           int not null default 400 check (bio_max_chars between 50 and 2000),
  selection_mode          text not null default 'review' check (selection_mode in ('everyone','review')),
  allow_guests            boolean not null default false,
  fee_cents               int not null default 0 check (fee_cents >= 0),
  terms_body              text,          -- what a family accepts; same "## " / "- " shape as a contract template
  alert_recipients        text[] not null default array['cj@novapa.org'],
  status                  text not null default 'draft'
                            check (status in ('draft','published','closed','lineup_set','done','archived')),
  published_at            timestamptz,
  notified_at             timestamptz,
  notified_by             uuid,
  notified_count          int,
  lineup_published_at     timestamptz,
  created_by              uuid default auth.uid(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (signup_closes_at is null or signup_opens_at is null or signup_closes_at > signup_opens_at)
);

create table if not exists family_hub.performance_event_eligibility (
  event_id       uuid not null references family_hub.performance_events(id) on delete cascade,
  production_id  uuid references family_hub.productions(id) on delete cascade,
  class_id       uuid references family_hub.classes(id) on delete cascade,
  check ((production_id is null) <> (class_id is null))
);
create unique index if not exists performance_event_eligibility_uq
  on family_hub.performance_event_eligibility (event_id, coalesce(production_id, class_id));

create table if not exists family_hub.performance_event_rehearsals (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references family_hub.performance_events(id) on delete cascade,
  on_date    date not null,
  starts_at  time,
  ends_at    time,
  place      text,
  required   boolean not null default true,
  notes      text,
  sort       int not null default 0
);
create index if not exists performance_event_rehearsals_event on family_hub.performance_event_rehearsals (event_id);

/* ---------- the act ------------------------------------------------------ */

create table if not exists family_hub.performance_acts (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references family_hub.performance_events(id) on delete cascade,
  family_id          uuid not null references family_hub.families(id) on delete cascade,  -- who submitted
  submitted_by       uuid,                                                                -- profile id
  status             text not null default 'draft'
                       check (status in ('draft','submitted','needs_changes','accepted','waitlisted','declined','withdrawn')),
  step               int not null default 0,      -- furthest wizard step saved
  act_type           text check (act_type is null or act_type in ('song','dance','acting','instrumental','variety','other')),
  act_format         text check (act_format is null or act_format in ('solo','duet','trio','small_group','large_group')),
  title              text,
  source             text,
  character_name     text,
  runtime_seconds    int check (runtime_seconds is null or runtime_seconds between 1 and 7200),
  description        text,
  content_ok         boolean not null default false,
  video_url          text check (video_url is null or video_url ~* '^https?://'),
  track_mode         text check (track_mode is null or track_mode in ('upload','accompanist','a_cappella','own')),
  track_path         text,
  track_filename     text,
  sheet_music_path   text,
  sheet_music_filename text,
  key_tempo_notes    text,
  tech               jsonb not null default '{}'::jsonb,
  family_note        text,          -- staff to family: what to change
  terms_accepted_at  timestamptz,
  terms_md5          text,          -- the terms text the family actually accepted
  submitted_at       timestamptz,
  status_changed_at  timestamptz,
  withdrawn_at       timestamptz,
  fee_cents          int not null default 0,
  fee_paid_at        timestamptz,
  fee_order_id       uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists performance_acts_event on family_hub.performance_acts (event_id, status);
create index if not exists performance_acts_family on family_hub.performance_acts (family_id);

-- Private to staff. Its own table so no family-readable row ever carries it.
create table if not exists family_hub.performance_act_staff_notes (
  act_id      uuid primary key references family_hub.performance_acts(id) on delete cascade,
  notes       text,
  updated_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now()
);

create table if not exists family_hub.performance_act_performers (
  id                  uuid primary key default gen_random_uuid(),
  act_id              uuid not null references family_hub.performance_acts(id) on delete cascade,
  kind                text not null check (kind in ('own','invited','guest')),
  student_id          uuid references family_hub.students(id) on delete cascade,
  family_id           uuid references family_hub.families(id) on delete cascade,  -- the performer's family, once known
  -- invited: the email the submitting parent typed. Never echoed back with
  -- any hint of whether it matched a family.
  invite_email        text check (invite_email is null or invite_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  invite_status       text not null default 'confirmed' check (invite_status in ('confirmed','pending','declined')),
  invited_by          uuid,
  confirmed_at        timestamptz,
  -- guest performer from outside NOVAPA
  guest_name          text,
  guest_age           int check (guest_age is null or guest_age between 0 and 99),
  guest_guardian_name text,
  guest_guardian_contact text,
  -- for this event only; never written back to the student record
  legal_name          text,
  preferred_name      text,
  age_text            text,
  grade_text          text,
  guardian_name       text,
  guardian_email      text,
  guardian_phone      text,
  headshot_path       text,
  bio                 text,
  pronunciation       text,
  program_name        text,
  sort                int not null default 0,
  created_at          timestamptz not null default now(),
  check (kind <> 'own'     or student_id is not null),
  check (kind <> 'invited' or invite_email is not null),
  check (kind <> 'guest'   or guest_name is not null)
);
create index if not exists performance_act_performers_act on family_hub.performance_act_performers (act_id);
create index if not exists performance_act_performers_student on family_hub.performance_act_performers (student_id);
create index if not exists performance_act_performers_invite on family_hub.performance_act_performers (lower(invite_email));
create unique index if not exists performance_act_performers_one_student
  on family_hub.performance_act_performers (act_id, student_id) where student_id is not null;

create table if not exists family_hub.performance_act_rehearsal_availability (
  act_id        uuid not null references family_hub.performance_acts(id) on delete cascade,
  rehearsal_id  uuid not null references family_hub.performance_event_rehearsals(id) on delete cascade,
  available     boolean not null,
  conflict_note text,
  primary key (act_id, rehearsal_id)
);

create table if not exists family_hub.performance_lineup (
  id        uuid primary key default gen_random_uuid(),
  event_id  uuid not null references family_hub.performance_events(id) on delete cascade,
  position  int not null,
  kind      text not null check (kind in ('act','intermission','emcee','transition')),
  act_id    uuid references family_hub.performance_acts(id) on delete cascade,
  label     text,
  minutes   numeric(5,2),
  check (kind <> 'act' or act_id is not null)
);
create index if not exists performance_lineup_event on family_hub.performance_lineup (event_id, position);

/* ---------- housekeeping -------------------------------------------------- */

create or replace function family_hub.pe_touch()
returns trigger language plpgsql set search_path = family_hub, public as $fn$
begin new.updated_at := now(); return new; end $fn$;

drop trigger if exists performance_events_touch on family_hub.performance_events;
create trigger performance_events_touch before update on family_hub.performance_events
  for each row execute function family_hub.pe_touch();
drop trigger if exists performance_acts_touch on family_hub.performance_acts;
create trigger performance_acts_touch before update on family_hub.performance_acts
  for each row execute function family_hub.pe_touch();

/* ---------- eligibility --------------------------------------------------- */

-- "5th", "5TH", "8th grade", "K", "Pre-K" -> -1..12; anything else unknown.
create or replace function family_hub.pe_grade_number(p_grade text)
returns int language sql immutable set search_path = family_hub, public as $fn$
  select case
    when p_grade is null or btrim(p_grade) = '' then null
    when lower(btrim(p_grade)) ~ '^pre' then -1
    when lower(btrim(p_grade)) ~ '^(k|kindergarten)$' then 0
    when btrim(p_grade) ~ '^\d{1,2}' then nullif(least(substring(btrim(p_grade) from '^\d{1,2}')::int, 99), 99)
    else null end;
$fn$;

/* Is this student allowed into this event? An unknown age or grade passes:
   the portal cannot verify it, and CJ reviews every act anyway. */
create or replace function family_hub.pe_student_eligible(p_event uuid, p_student uuid)
returns boolean
language sql stable security definer
set search_path to 'family_hub', 'public'
as $fn$
  with e as (select * from family_hub.performance_events where id = p_event),
       s as (select * from family_hub.students where id = p_student),
       age as (
         select extract(year from age(coalesce((select starts_at from e)::date, current_date), s.date_of_birth))::int as years
           from s where s.date_of_birth is not null
       )
  select exists (select 1 from e) and exists (select 1 from s)
     and (
       (select audience from e) = 'all'
       or exists (
         select 1 from family_hub.performance_event_eligibility el
           join family_hub.enrollments en
             on en.status = 'enrolled'
            and en.student_id = p_student
            and (en.production_id = el.production_id or en.class_id = el.class_id)
          where el.event_id = p_event)
     )
     and ((select min_age from e) is null or (select years from age) is null or (select years from age) >= (select min_age from e))
     and ((select max_age from e) is null or (select years from age) is null or (select years from age) <= (select max_age from e))
     and ((select min_grade from e) is null or family_hub.pe_grade_number((select grade from s)) is null
          or family_hub.pe_grade_number((select grade from s)) >= (select min_grade from e))
     and ((select max_grade from e) is null or family_hub.pe_grade_number((select grade from s)) is null
          or family_hub.pe_grade_number((select grade from s)) <= (select max_grade from e));
$fn$;

/* "All active families" means a family with a student enrolled in anything
   right now; the register is the only authority on who is active. */
create or replace function family_hub.pe_eligible_students(p_event uuid)
returns table (student_id uuid, family_id uuid)
language sql stable security definer
set search_path to 'family_hub', 'public'
as $fn$
  select distinct s.id, s.family_id
    from family_hub.students s
   where exists (select 1 from family_hub.enrollments en where en.student_id = s.id and en.status = 'enrolled')
     and family_hub.pe_student_eligible(p_event, s.id);
$fn$;

/* Every act id a family may see: the ones it submitted and the ones a
   student of theirs is on (or that invited one of their addresses). */
create or replace function family_hub.pe_visible_act_ids(p_family uuid)
returns setof uuid
language sql stable security definer
set search_path to 'family_hub', 'public'
as $fn$
  select a.id from family_hub.performance_acts a where a.family_id = p_family
  union
  select p.act_id from family_hub.performance_act_performers p where p.family_id = p_family
  union
  select p.act_id
    from family_hub.performance_act_performers p
   where p.kind = 'invited' and p.invite_status = 'pending'
     and lower(p.invite_email) in (
       select lower(g.email) from family_hub.guardians g where g.family_id = p_family and g.email is not null
       union
       select lower(pr.email) from family_hub.profiles pr where pr.family_id = p_family and pr.email is not null);
$fn$;

/* ---------- RLS ----------------------------------------------------------- */

alter table family_hub.performance_events                    enable row level security;
alter table family_hub.performance_event_eligibility         enable row level security;
alter table family_hub.performance_event_rehearsals          enable row level security;
alter table family_hub.performance_acts                      enable row level security;
alter table family_hub.performance_act_staff_notes           enable row level security;
alter table family_hub.performance_act_performers            enable row level security;
alter table family_hub.performance_act_rehearsal_availability enable row level security;
alter table family_hub.performance_lineup                    enable row level security;

drop policy if exists pe_events_staff on family_hub.performance_events;
create policy pe_events_staff on family_hub.performance_events
  for select to authenticated using ((select family_hub.pe_is_events_staff()));
drop policy if exists pe_events_family on family_hub.performance_events;
create policy pe_events_family on family_hub.performance_events
  for select to authenticated using (status not in ('draft','archived') and published_at is not null);

drop policy if exists pe_elig_read on family_hub.performance_event_eligibility;
create policy pe_elig_read on family_hub.performance_event_eligibility
  for select to authenticated using (true);
drop policy if exists pe_rehearsals_read on family_hub.performance_event_rehearsals;
create policy pe_rehearsals_read on family_hub.performance_event_rehearsals
  for select to authenticated using (true);

drop policy if exists pe_acts_staff on family_hub.performance_acts;
create policy pe_acts_staff on family_hub.performance_acts
  for select to authenticated using ((select family_hub.pe_is_events_staff()));
drop policy if exists pe_acts_family on family_hub.performance_acts;
create policy pe_acts_family on family_hub.performance_acts
  for select to authenticated
  using (id in (select family_hub.pe_visible_act_ids((select family_hub.auth_family_id()))));

drop policy if exists pe_notes_staff on family_hub.performance_act_staff_notes;
create policy pe_notes_staff on family_hub.performance_act_staff_notes
  for select to authenticated using ((select family_hub.pe_is_events_staff()));

drop policy if exists pe_performers_staff on family_hub.performance_act_performers;
create policy pe_performers_staff on family_hub.performance_act_performers
  for select to authenticated using ((select family_hub.pe_is_events_staff()));
drop policy if exists pe_performers_family on family_hub.performance_act_performers;
create policy pe_performers_family on family_hub.performance_act_performers
  for select to authenticated
  using (act_id in (select family_hub.pe_visible_act_ids((select family_hub.auth_family_id()))));

drop policy if exists pe_avail_staff on family_hub.performance_act_rehearsal_availability;
create policy pe_avail_staff on family_hub.performance_act_rehearsal_availability
  for select to authenticated using ((select family_hub.pe_is_events_staff()));
drop policy if exists pe_avail_family on family_hub.performance_act_rehearsal_availability;
create policy pe_avail_family on family_hub.performance_act_rehearsal_availability
  for select to authenticated
  using (act_id in (select family_hub.pe_visible_act_ids((select family_hub.auth_family_id()))));

drop policy if exists pe_lineup_staff on family_hub.performance_lineup;
create policy pe_lineup_staff on family_hub.performance_lineup
  for select to authenticated using ((select family_hub.pe_is_events_staff()));

-- Reads only. Every write is a function below (or the service role).
grant select on family_hub.performance_events, family_hub.performance_event_eligibility,
  family_hub.performance_event_rehearsals, family_hub.performance_acts,
  family_hub.performance_act_staff_notes, family_hub.performance_act_performers,
  family_hub.performance_act_rehearsal_availability, family_hub.performance_lineup
  to authenticated;
grant all on family_hub.performance_events, family_hub.performance_event_eligibility,
  family_hub.performance_event_rehearsals, family_hub.performance_acts,
  family_hub.performance_act_staff_notes, family_hub.performance_act_performers,
  family_hub.performance_act_rehearsal_availability, family_hub.performance_lineup
  to service_role;

/* ---------- the rules a submission must pass ------------------------------ */

/* Returns the first problem as a sentence for the parent, or null when the
   act may go in. The one place these rules live in the database; the Parent
   Portal checks the same list first (src/lib/performance/rules.ts) only so a
   parent hears about it before pressing Submit. */
create or replace function family_hub.pe_act_problem(p_act uuid)
returns text
language plpgsql stable security definer
set search_path to 'family_hub', 'public'
as $fn$
declare
  a family_hub.performance_acts;
  e family_hub.performance_events;
  n_perf int; n_need int; r record; capped record;
begin
  select * into a from family_hub.performance_acts where id = p_act;
  if not found then return 'That act no longer exists.'; end if;
  select * into e from family_hub.performance_events where id = a.event_id;

  if a.act_type is null or not (a.act_type = any (e.act_types)) then
    return 'Choose one of the act types this event allows.';
  end if;
  if a.act_format is null or not (a.act_format = any (e.act_formats)) then
    return 'Choose one of the act formats this event allows.';
  end if;
  if btrim(coalesce(a.title, '')) = '' then return 'Give the act a title.'; end if;
  if a.runtime_seconds is null then return 'Say how long the act runs.'; end if;
  if e.max_minutes_per_act is not null and a.runtime_seconds > e.max_minutes_per_act * 60 then
    return format('Acts can run %s minutes at most.', trim(to_char(e.max_minutes_per_act, 'FM990.##')));
  end if;
  if not a.content_ok then return 'Confirm the material is family-appropriate.'; end if;

  select count(*) into n_perf from family_hub.performance_act_performers
   where act_id = p_act and invite_status <> 'declined';
  if n_perf = 0 then return 'Add at least one performer.'; end if;
  if e.max_performers_per_act is not null and n_perf > e.max_performers_per_act then
    return format('This event allows %s performers per act.', e.max_performers_per_act);
  end if;
  if not (
       (a.act_format = 'solo' and n_perf = 1) or (a.act_format = 'duet' and n_perf = 2)
    or (a.act_format = 'trio' and n_perf = 3) or (a.act_format = 'small_group' and n_perf between 4 and 8)
    or (a.act_format = 'large_group' and n_perf >= 9)) then
    return 'The number of performers does not match the act format.';
  end if;
  if exists (select 1 from family_hub.performance_act_performers
              where act_id = p_act and kind = 'guest') and not e.allow_guests then
    return 'This event does not take guest performers.';
  end if;

  for r in select p.student_id from family_hub.performance_act_performers p
            where p.act_id = p_act and p.student_id is not null and p.invite_status = 'confirmed' loop
    if not family_hub.pe_student_eligible(e.id, r.student_id) then
      return 'One of the performers is not eligible for this event.';
    end if;
  end loop;

  if e.max_acts_per_student is not null then
    select p.student_id, count(distinct a2.id) as n into capped
      from family_hub.performance_act_performers p
      join family_hub.performance_act_performers p2 on p2.student_id = p.student_id and p2.invite_status <> 'declined'
      join family_hub.performance_acts a2 on a2.id = p2.act_id and a2.event_id = e.id
                                         and a2.status in ('submitted','needs_changes','accepted','waitlisted')
                                         and a2.id <> p_act
     where p.act_id = p_act and p.student_id is not null and p.invite_status <> 'declined'
     group by p.student_id
    having count(distinct a2.id) >= e.max_acts_per_student
     limit 1;
    if found then
      return format('A student can be in %s act%s in this event, and one of these performers already is.',
                    e.max_acts_per_student, case when e.max_acts_per_student = 1 then '' else 's' end);
    end if;
  end if;

  if e.req_video = 'required' and a.video_url is null then return 'Add a performance video link.'; end if;
  if e.req_track = 'required' and (a.track_mode is null or (a.track_mode = 'upload' and a.track_path is null)) then
    return 'Upload a backing track, or say how the music is handled.';
  end if;
  if e.req_sheet_music = 'required' and a.sheet_music_path is null then return 'Upload the sheet music.'; end if;
  -- Per performer: the submitting family answers for its own students and
  -- guests; an invited family's student is that family's to complete.
  if e.req_headshot = 'required' and exists (
       select 1 from family_hub.performance_act_performers
        where act_id = p_act and kind in ('own','guest') and headshot_path is null) then
    return 'Add a headshot for every performer.';
  end if;
  if e.req_bio = 'required' and exists (
       select 1 from family_hub.performance_act_performers
        where act_id = p_act and kind in ('own','guest') and btrim(coalesce(bio, '')) = '') then
    return 'Write a program bio for every performer.';
  end if;
  if exists (select 1 from family_hub.performance_act_performers
              where act_id = p_act and length(coalesce(bio, '')) > e.bio_max_chars) then
    return format('Program bios are %s characters at most.', e.bio_max_chars);
  end if;

  select count(*) into n_need from family_hub.performance_event_rehearsals rh
   where rh.event_id = e.id and rh.required
     and not exists (select 1 from family_hub.performance_act_rehearsal_availability av
                      where av.act_id = p_act and av.rehearsal_id = rh.id
                        and (av.available or btrim(coalesce(av.conflict_note, '')) <> ''));
  if n_need > 0 then
    return 'Answer every required rehearsal, and explain any conflict.';
  end if;

  if e.terms_body is not null and (a.terms_accepted_at is null or a.terms_md5 is distinct from md5(e.terms_body)) then
    return 'Read and accept the terms.';
  end if;
  return null;
end $fn$;

/* ---------- family side (service role, or a parent's own token) ----------- */

create or replace function family_hub.pe_signup_open(p_event uuid)
returns boolean language sql stable security definer set search_path to 'family_hub', 'public' as $fn$
  select coalesce((
    select e.status = 'published'
       and (e.signup_opens_at is null or e.signup_opens_at <= now())
       and (e.signup_closes_at is null or e.signup_closes_at > now())
      from family_hub.performance_events e where e.id = p_event), false);
$fn$;

create or replace function family_hub.pe_submit_act(p_act uuid, p_family_id uuid default null, p_actor uuid default null)
returns jsonb
language plpgsql volatile security definer
set search_path to 'family_hub', 'public'
as $fn$
declare
  fam uuid := family_hub.pe_caller_family(p_family_id);
  a family_hub.performance_acts; e family_hub.performance_events;
  problem text; taken int; next_status text;
begin
  if fam is null then
    raise exception 'Only a signed-in family can submit an act.' using errcode = '42501';
  end if;
  select * into a from family_hub.performance_acts where id = p_act for update;
  if not found or a.family_id <> fam then
    return jsonb_build_object('ok', false, 'message', 'That act is not yours to submit.');
  end if;
  -- One event row lock, so two last-place submissions cannot both get in.
  select * into e from family_hub.performance_events where id = a.event_id for update;
  if a.status in ('accepted','waitlisted','declined','withdrawn') then
    return jsonb_build_object('ok', false, 'message', 'This act has already been decided.');
  end if;
  if not family_hub.pe_signup_open(e.id) and a.status <> 'needs_changes' then
    return jsonb_build_object('ok', false, 'message', 'Sign-ups for this event are closed.');
  end if;
  problem := family_hub.pe_act_problem(p_act);
  if problem is not null then
    return jsonb_build_object('ok', false, 'message', problem);
  end if;

  next_status := 'submitted';
  if e.selection_mode = 'everyone' then
    select count(*) into taken from family_hub.performance_acts
     where event_id = e.id and status = 'accepted' and id <> p_act;
    next_status := case when e.max_acts is not null and taken >= e.max_acts then 'waitlisted' else 'accepted' end;
  elsif e.max_acts is not null and a.status = 'draft' then
    -- Review mode still stops taking acts once the lineup cap is reached by
    -- acts already waiting or accepted; the rest wait in line.
    select count(*) into taken from family_hub.performance_acts
     where event_id = e.id and status in ('submitted','needs_changes','accepted') and id <> p_act;
    if taken >= e.max_acts * 2 then next_status := 'waitlisted'; end if;
  end if;

  update family_hub.performance_acts
     set status = next_status,
         submitted_at = coalesce(submitted_at, now()),
         submitted_by = coalesce(p_actor, submitted_by, auth.uid()),
         status_changed_at = now(),
         family_note = case when a.status = 'needs_changes' then null else family_note end,
         fee_cents = e.fee_cents
   where id = p_act;
  return jsonb_build_object('ok', true, 'status', next_status, 'resubmitted', a.status = 'needs_changes');
end $fn$;

create or replace function family_hub.pe_withdraw_act(p_act uuid, p_family_id uuid default null)
returns jsonb
language plpgsql volatile security definer
set search_path to 'family_hub', 'public'
as $fn$
declare fam uuid := family_hub.pe_caller_family(p_family_id); a family_hub.performance_acts;
begin
  select * into a from family_hub.performance_acts where id = p_act for update;
  if not found or a.family_id is distinct from fam then
    return jsonb_build_object('ok', false, 'message', 'That act is not yours to withdraw.');
  end if;
  if a.status = 'withdrawn' then return jsonb_build_object('ok', true); end if;
  update family_hub.performance_acts
     set status = 'withdrawn', withdrawn_at = now(), status_changed_at = now()
   where id = p_act;
  delete from family_hub.performance_lineup where act_id = p_act;
  return jsonb_build_object('ok', true);
end $fn$;

/* An invited family answers. The student they pick must be theirs and
   eligible, and under the per-student cap. Nothing here tells the inviting
   family anything about which addresses exist. */
create or replace function family_hub.pe_answer_invite(
  p_performer uuid, p_accept boolean, p_student uuid default null, p_family_id uuid default null)
returns jsonb
language plpgsql volatile security definer
set search_path to 'family_hub', 'public'
as $fn$
declare
  fam uuid := family_hub.pe_caller_family(p_family_id);
  p family_hub.performance_act_performers; a family_hub.performance_acts; e family_hub.performance_events;
  n int; s family_hub.students; g family_hub.guardians;
begin
  if fam is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select * into p from family_hub.performance_act_performers where id = p_performer for update;
  if not found or p.kind <> 'invited' or p.invite_status <> 'pending'
     or not exists (select 1 from family_hub.pe_visible_act_ids(fam) v where v = p.act_id) then
    return jsonb_build_object('ok', false, 'message', 'That invitation is no longer open.');
  end if;
  select * into a from family_hub.performance_acts where id = p.act_id;
  select * into e from family_hub.performance_events where id = a.event_id;
  if not p_accept then
    update family_hub.performance_act_performers
       set invite_status = 'declined', family_id = fam, confirmed_at = now() where id = p_performer;
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;
  select * into s from family_hub.students where id = p_student and family_id = fam;
  if not found then return jsonb_build_object('ok', false, 'message', 'Choose one of your students.'); end if;
  if exists (select 1 from family_hub.performance_act_performers where act_id = a.id and student_id = s.id) then
    return jsonb_build_object('ok', false, 'message', 'That student is already in this act.');
  end if;
  if not family_hub.pe_student_eligible(e.id, s.id) then
    return jsonb_build_object('ok', false, 'message', 'That student is not eligible for this event.');
  end if;
  if e.max_acts_per_student is not null then
    select count(distinct a2.id) into n
      from family_hub.performance_act_performers p2
      join family_hub.performance_acts a2 on a2.id = p2.act_id
     where p2.student_id = s.id and p2.invite_status <> 'declined' and a2.event_id = e.id
       and a2.status in ('draft','submitted','needs_changes','accepted','waitlisted');
    if n >= e.max_acts_per_student then
      return jsonb_build_object('ok', false, 'message',
        format('A student can be in %s act%s in this event.', e.max_acts_per_student,
               case when e.max_acts_per_student = 1 then '' else 's' end));
    end if;
  end if;
  select * into g from family_hub.guardians where family_id = fam order by is_primary desc nulls last limit 1;
  update family_hub.performance_act_performers
     set invite_status = 'confirmed', confirmed_at = now(), student_id = s.id, family_id = fam,
         legal_name = btrim(s.first_name || ' ' || s.last_name),
         preferred_name = s.preferred_name,
         program_name = coalesce(program_name, btrim(coalesce(s.preferred_name, s.first_name) || ' ' || s.last_name)),
         grade_text = s.grade,
         guardian_name = g.full_name, guardian_email = g.email, guardian_phone = g.phone
   where id = p_performer;
  return jsonb_build_object('ok', true, 'status', 'confirmed');
end $fn$;

revoke all on function family_hub.pe_submit_act(uuid, uuid, uuid) from public, anon;
revoke all on function family_hub.pe_withdraw_act(uuid, uuid) from public, anon;
revoke all on function family_hub.pe_answer_invite(uuid, boolean, uuid, uuid) from public, anon;
grant execute on function family_hub.pe_submit_act(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function family_hub.pe_withdraw_act(uuid, uuid) to authenticated, service_role;
grant execute on function family_hub.pe_answer_invite(uuid, boolean, uuid, uuid) to authenticated, service_role;
grant execute on function family_hub.pe_act_problem(uuid) to service_role;
grant execute on function family_hub.pe_signup_open(uuid), family_hub.pe_student_eligible(uuid, uuid),
  family_hub.pe_is_events_staff() to authenticated, service_role;
grant execute on function family_hub.pe_eligible_students(uuid), family_hub.pe_visible_act_ids(uuid)
  to service_role;

/* ---------- staff side (a Chief or Admin's own token) --------------------- */

create or replace function family_hub.pe_require_events_staff()
returns void language plpgsql stable security definer set search_path to 'family_hub', 'public' as $fn$
begin
  if not family_hub.pe_is_events_staff() then
    raise exception 'Only a Chief or an Admin can manage performance events.' using errcode = '42501';
  end if;
end $fn$;

/* Create or update an event, its eligibility list and its rehearsals, in one
   call. p is the event as the Events page holds it. Returns the id. */
create or replace function family_hub.pe_staff_save_event(p jsonb)
returns uuid
language plpgsql volatile security definer
set search_path to 'family_hub', 'public'
as $fn$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  t text;
begin
  perform family_hub.pe_require_events_staff();
  if v_id is null then
    insert into family_hub.performance_events (title, created_by) values (coalesce(nullif(btrim(p ->> 'title'), ''), 'Untitled event'), auth.uid())
    returning id into v_id;
  elsif not exists (select 1 from family_hub.performance_events where id = v_id) then
    raise exception 'No such event.';
  end if;

  update family_hub.performance_events set
    title                  = coalesce(nullif(btrim(p ->> 'title'), ''), title),
    subtitle               = nullif(btrim(p ->> 'subtitle'), ''),
    description            = nullif(p ->> 'description', ''),
    poster_path            = nullif(p ->> 'poster_path', ''),
    starts_at              = nullif(p ->> 'starts_at', '')::timestamptz,
    call_at                = nullif(p ->> 'call_at', '')::timestamptz,
    ends_at                = nullif(p ->> 'ends_at', '')::timestamptz,
    venue_name             = nullif(btrim(p ->> 'venue_name'), ''),
    venue_address          = nullif(btrim(p ->> 'venue_address'), ''),
    signup_opens_at        = nullif(p ->> 'signup_opens_at', '')::timestamptz,
    signup_closes_at       = nullif(p ->> 'signup_closes_at', '')::timestamptz,
    audience               = coalesce(nullif(p ->> 'audience', ''), 'all'),
    min_age                = nullif(p ->> 'min_age', '')::int,
    max_age                = nullif(p ->> 'max_age', '')::int,
    min_grade              = nullif(p ->> 'min_grade', '')::int,
    max_grade              = nullif(p ->> 'max_grade', '')::int,
    act_types              = coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'act_types') x), act_types),
    act_formats            = coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'act_formats') x), act_formats),
    max_acts               = nullif(p ->> 'max_acts', '')::int,
    max_acts_per_student   = nullif(p ->> 'max_acts_per_student', '')::int,
    max_minutes_per_act    = nullif(p ->> 'max_minutes_per_act', '')::numeric,
    max_performers_per_act = nullif(p ->> 'max_performers_per_act', '')::int,
    req_video              = coalesce(nullif(p ->> 'req_video', ''), req_video),
    req_headshot           = coalesce(nullif(p ->> 'req_headshot', ''), req_headshot),
    req_track              = coalesce(nullif(p ->> 'req_track', ''), req_track),
    req_sheet_music        = coalesce(nullif(p ->> 'req_sheet_music', ''), req_sheet_music),
    req_bio                = coalesce(nullif(p ->> 'req_bio', ''), req_bio),
    bio_max_chars          = coalesce(nullif(p ->> 'bio_max_chars', '')::int, bio_max_chars),
    selection_mode         = coalesce(nullif(p ->> 'selection_mode', ''), selection_mode),
    allow_guests           = coalesce((p ->> 'allow_guests')::boolean, allow_guests),
    fee_cents              = coalesce(nullif(p ->> 'fee_cents', '')::int, 0),
    terms_body             = nullif(p ->> 'terms_body', ''),
    alert_recipients       = coalesce((select array_agg(lower(btrim(x))) from jsonb_array_elements_text(p -> 'alert_recipients') x
                                        where btrim(x) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'), array['cj@novapa.org'])
  where id = v_id;

  if p ? 'eligibility' then
    delete from family_hub.performance_event_eligibility where event_id = v_id;
    insert into family_hub.performance_event_eligibility (event_id, production_id, class_id)
    select v_id, nullif(x ->> 'production_id', '')::uuid, nullif(x ->> 'class_id', '')::uuid
      from jsonb_array_elements(p -> 'eligibility') x
    on conflict do nothing;
  end if;

  if p ? 'rehearsals' then
    -- Keep the ids of rehearsals that survive, so answers already given stay.
    delete from family_hub.performance_event_rehearsals r
     where r.event_id = v_id
       and r.id not in (select nullif(x ->> 'id', '')::uuid from jsonb_array_elements(p -> 'rehearsals') x
                         where nullif(x ->> 'id', '') is not null);
    insert into family_hub.performance_event_rehearsals (id, event_id, on_date, starts_at, ends_at, place, required, notes, sort)
    select coalesce(nullif(x ->> 'id', '')::uuid, gen_random_uuid()), v_id,
           (x ->> 'on_date')::date, nullif(x ->> 'starts_at', '')::time, nullif(x ->> 'ends_at', '')::time,
           nullif(btrim(x ->> 'place'), ''), coalesce((x ->> 'required')::boolean, true),
           nullif(btrim(x ->> 'notes'), ''), ord::int
      from jsonb_array_elements(p -> 'rehearsals') with ordinality as r(x, ord)
     where nullif(x ->> 'on_date', '') is not null
    on conflict (id) do update set
      on_date = excluded.on_date, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
      place = excluded.place, required = excluded.required, notes = excluded.notes, sort = excluded.sort;
  end if;
  return v_id;
end $fn$;

/* Status moves. Publishing makes the event visible in the Parent Portal and
   tells nobody; that is what pe_staff_notify_families is for. */
create or replace function family_hub.pe_staff_set_status(p_event uuid, p_status text)
returns void
language plpgsql volatile security definer
set search_path to 'family_hub', 'public'
as $fn$
begin
  perform family_hub.pe_require_events_staff();
  if p_status not in ('draft','published','closed','lineup_set','done','archived') then
    raise exception 'Unknown status %', p_status;
  end if;
  update family_hub.performance_events
     set status = p_status,
         published_at = case when p_status = 'published' then coalesce(published_at, now()) else published_at end,
         lineup_published_at = case when p_status = 'lineup_set' then now() else lineup_published_at end
   where id = p_event;
end $fn$;

/* "Publish & notify families": one bell notice per eligible parent, once.
   Honors each parent's announcement opt-out. Returns how many were told. */
create or replace function family_hub.pe_staff_notify_families(p_event uuid)
returns int
language plpgsql volatile security definer
set search_path to 'family_hub', 'public'
as $fn$
declare e family_hub.performance_events; n int;
begin
  perform family_hub.pe_require_events_staff();
  select * into e from family_hub.performance_events where id = p_event for update;
  if not found then raise exception 'No such event.'; end if;
  if e.notified_at is not null then
    raise exception 'Families were already told about this event on %.',
      to_char(e.notified_at at time zone 'America/New_York', 'Mon FMDD, YYYY "at" FMHH12:MI AM "ET"');
  end if;
  if e.status <> 'published' then
    update family_hub.performance_events
       set status = 'published', published_at = coalesce(published_at, now()) where id = p_event;
  end if;

  with parents as (
    select distinct pr.id as user_id
      from family_hub.pe_eligible_students(p_event) es
      join family_hub.profiles pr on pr.family_id = es.family_id and pr.role = 'parent'
      left join family_hub.notification_prefs np on np.user_id = pr.id
     where coalesce((np.enabled ->> 'announcement')::boolean, true)
  ), ins as (
    insert into family_hub.notifications (user_id, type, title, body, url)
    select user_id, 'announcement',
           left('Perform at ' || e.title, 80),
           left(coalesce(e.subtitle || '. ', '') || 'Sign-ups are open in the Parent Portal'
                || coalesce(' until ' || to_char(e.signup_closes_at at time zone 'America/New_York',
                                                  'Mon FMDD "at" FMHH12:MI AM "ET"'), '') || '.', 300),
           '/family/events/' || p_event
      from parents
    returning 1
  )
  select count(*) into n from ins;

  update family_hub.performance_events
     set notified_at = now(), notified_by = auth.uid(), notified_count = n where id = p_event;
  return n;
end $fn$;

/* Accept / Waitlist / Decline / Request changes, one act or many. The family
   sees the status and (for changes) the note; it gets one bell notice per
   act, because a person pressed the button. */
create or replace function family_hub.pe_staff_review(p_acts uuid[], p_status text, p_note text default null)
returns int
language plpgsql volatile security definer
set search_path to 'family_hub', 'public'
as $fn$
declare r record; e family_hub.performance_events; taken int; done int := 0; label text;
begin
  perform family_hub.pe_require_events_staff();
  if p_status not in ('accepted','waitlisted','declined','needs_changes','submitted') then
    raise exception 'Unknown review status %', p_status;
  end if;
  if p_status = 'needs_changes' and btrim(coalesce(p_note, '')) = '' then
    raise exception 'Say what the family should change.';
  end if;
  label := case p_status when 'accepted' then 'is in the show'
                         when 'waitlisted' then 'is on the waitlist'
                         when 'declined' then 'was not chosen this time'
                         when 'needs_changes' then 'needs a change from you'
                         else 'is back under review' end;
  for r in select a.* from family_hub.performance_acts a
            where a.id = any (p_acts) and a.status not in ('draft','withdrawn')
            order by a.submitted_at nulls last for update loop
    select * into e from family_hub.performance_events where id = r.event_id for update;
    if p_status = 'accepted' and e.max_acts is not null and r.status <> 'accepted' then
      select count(*) into taken from family_hub.performance_acts where event_id = e.id and status = 'accepted';
      if taken >= e.max_acts then
        raise exception 'The lineup is full: % acts already accepted.', e.max_acts;
      end if;
    end if;
    update family_hub.performance_acts
       set status = p_status, status_changed_at = now(),
           family_note = case when p_status = 'needs_changes' then btrim(p_note) else family_note end
     where id = r.id;
    if p_status <> 'accepted' then
      delete from family_hub.performance_lineup where act_id = r.id;
    end if;
    insert into family_hub.notifications (user_id, type, title, body, url)
    select pr.id, 'announcement', left(e.title, 80),
           left(format('"%s" %s.', coalesce(r.title, 'Your act'), label), 300),
           '/family/events/' || e.id
      from family_hub.profiles pr
      left join family_hub.notification_prefs np on np.user_id = pr.id
     where pr.family_id = r.family_id and pr.role = 'parent'
       and coalesce((np.enabled ->> 'announcement')::boolean, true);
    done := done + 1;
  end loop;
  return done;
end $fn$;

create or replace function family_hub.pe_staff_set_note(p_act uuid, p_notes text)
returns void
language plpgsql volatile security definer
set search_path to 'family_hub', 'public'
as $fn$
begin
  perform family_hub.pe_require_events_staff();
  insert into family_hub.performance_act_staff_notes (act_id, notes, updated_by, updated_at)
  values (p_act, nullif(btrim(p_notes), ''), auth.uid(), now())
  on conflict (act_id) do update set notes = excluded.notes, updated_by = excluded.updated_by, updated_at = now();
end $fn$;

/* Replace the running order. p_rows: [{kind, act_id?, label?, minutes?}, ...]
   in order. Only accepted acts of this event may be placed, each once. */
create or replace function family_hub.pe_staff_save_lineup(p_event uuid, p_rows jsonb)
returns int
language plpgsql volatile security definer
set search_path to 'family_hub', 'public'
as $fn$
declare n int;
begin
  perform family_hub.pe_require_events_staff();
  if exists (
    select 1 from jsonb_array_elements(p_rows) x
     where x ->> 'kind' = 'act'
       and not exists (select 1 from family_hub.performance_acts a
                        where a.id = (x ->> 'act_id')::uuid and a.event_id = p_event and a.status = 'accepted')) then
    raise exception 'Only accepted acts of this event can go in the running order.';
  end if;
  if (select count(*) <> count(distinct x ->> 'act_id') from jsonb_array_elements(p_rows) x where x ->> 'kind' = 'act') then
    raise exception 'An act can appear in the running order once.';
  end if;
  delete from family_hub.performance_lineup where event_id = p_event;
  insert into family_hub.performance_lineup (event_id, position, kind, act_id, label, minutes)
  select p_event, ord::int, x ->> 'kind', nullif(x ->> 'act_id', '')::uuid,
         nullif(btrim(x ->> 'label'), ''), nullif(x ->> 'minutes', '')::numeric
    from jsonb_array_elements(p_rows) with ordinality as r(x, ord);
  get diagnostics n = row_count;
  return n;
end $fn$;

revoke all on function family_hub.pe_staff_save_event(jsonb), family_hub.pe_staff_set_status(uuid, text),
  family_hub.pe_staff_notify_families(uuid), family_hub.pe_staff_review(uuid[], text, text),
  family_hub.pe_staff_set_note(uuid, text), family_hub.pe_staff_save_lineup(uuid, jsonb),
  family_hub.pe_require_events_staff()
  from public, anon;
grant execute on function family_hub.pe_staff_save_event(jsonb), family_hub.pe_staff_set_status(uuid, text),
  family_hub.pe_staff_notify_families(uuid), family_hub.pe_staff_review(uuid[], text, text),
  family_hub.pe_staff_set_note(uuid, text), family_hub.pe_staff_save_lineup(uuid, jsonb),
  family_hub.pe_require_events_staff()
  to authenticated;

/* ---------- files --------------------------------------------------------- */

-- Headshots, tracks, sheet music and posters. Private; both portals serve
-- signed URLs. The Parent Portal writes with the service role; staff upload
-- posters and read everything with their own token.
insert into storage.buckets (id, name, public, file_size_limit)
values ('fh-performance', 'fh-performance', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

drop policy if exists fh_performance_staff_read on storage.objects;
create policy fh_performance_staff_read on storage.objects
  for select to authenticated
  using (bucket_id = 'fh-performance' and (select family_hub.pe_is_events_staff()));
drop policy if exists fh_performance_staff_posters on storage.objects;
create policy fh_performance_staff_posters on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fh-performance' and (storage.foldername(name))[1] = 'posters'
              and (select family_hub.pe_is_events_staff()));
drop policy if exists fh_performance_staff_posters_update on storage.objects;
create policy fh_performance_staff_posters_update on storage.objects
  for update to authenticated
  using (bucket_id = 'fh-performance' and (storage.foldername(name))[1] = 'posters'
         and (select family_hub.pe_is_events_staff()));

-- Default terms for a new event. The Events page prefills from this row and
-- CJ edits per event; changing it needs no deploy.
create table if not exists family_hub.performance_terms_default (
  id         int primary key default 1 check (id = 1),
  body       text not null,
  updated_at timestamptz not null default now()
);
alter table family_hub.performance_terms_default enable row level security;
drop policy if exists pe_terms_default_read on family_hub.performance_terms_default;
create policy pe_terms_default_read on family_hub.performance_terms_default
  for select to authenticated using ((select family_hub.pe_is_events_staff()));
grant select on family_hub.performance_terms_default to authenticated;
grant all on family_hub.performance_terms_default to service_role;
insert into family_hub.performance_terms_default (id, body) values (1, $terms$
## Photo and video release
- Northern Virginia Performing Arts may photograph and record the performance and use those images and recordings to share and promote NOVAPA.
- If your family has opted out of photo use in the Parent Portal, we will honor that for this event too.

## Content
- The material, lyrics, choreography and costumes are appropriate for a family audience.
- NOVAPA may ask for changes, or decline an act, at its discretion.

## Rehearsals and the day
- Performers attend every required rehearsal and arrive by the call time.
- A performer who misses a required rehearsal may be removed from the running order.
$terms$)
on conflict (id) do nothing;
