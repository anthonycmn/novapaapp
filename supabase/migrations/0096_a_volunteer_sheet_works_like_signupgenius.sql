-- ---------------------------------------------------------------------------
-- 0096 — A volunteer sheet works like SignUpGenius.
-- ---------------------------------------------------------------------------
-- CJ, 8 Oct 2026: "any member of the admin team can create a need for
-- volunteers and then that gets reflected in the parent portal ... parents can
-- sign up and take different slots ... reschedule or delete their volunteer
-- with 24 hours out ... share their name for a volunteer badge ... front of
-- house or volunteer to bring food, volunteer for potluck ... chosen from a
-- drop down menu ... the date and times are included and the number of
-- volunteers needed ... everyone sees how many slots are left and how many
-- slots are still needed."
--
-- Builds on 0048 (events, slots, signups, claim_volunteer_slot). On the day
-- this was written all three tables were empty, so nothing here migrates data.
--
-- WHAT CHANGES
--
--  * A SHEET NO LONGER NEEDS A SHOW. production_id is nullable: a sheet on a
--    show goes to that show's families, a sheet with no show (the fall potluck)
--    goes to every family. 0048 said "attached to a production only"; a
--    potluck is not on a production.
--
--  * A SLOT HAS A KIND, picked from a fixed list — front of house, bring food,
--    potluck dish and the rest. A check constraint, not a lookup table: the
--    list is short, both portals carry the labels, and a new kind is a
--    one-line migration, which is the right amount of ceremony for it.
--
--  * A FOOD SLOT ASKS WHAT YOU ARE BRINGING, and everybody sees the answer —
--    the whole point of a potluck sheet is that not everyone brings brownies.
--
--  * A BADGE NAME. A volunteer says whether their name may go on a printed
--    volunteer badge, and what it should say. Opt-in: nothing is printed for a
--    volunteer who did not tick it.
--
--  * THE 24-HOUR LINE. A family can give a place back, or move to another
--    slot, until 24 hours before the slot starts. After that it is a phone call
--    to the office, because a front-of-house gap found the night before the
--    show is the office's problem and the office needs to know. The line is in
--    the database (release_ / move_volunteer_signup), not in the page, and the
--    family DELETE policy from 0048 is dropped so the RPC is the only way out.
--    Staff are not bound by it.
--
--  * The view is rebuilt security_invoker, so a family reading it through a
--    token sees only what RLS already lets it see (0048's view ran as owner and
--    would have shown an unpublished sheet's slots).
--
-- Per 0023: anon EXECUTE revoked on every function.
-- Safe to re-run.
-- ---------------------------------------------------------------------------
set search_path = family_hub, extensions;

-- ---- sheets ----------------------------------------------------------------
alter table volunteer_events alter column production_id drop not null;

-- ---- slots -----------------------------------------------------------------
alter table volunteer_slots add column if not exists kind text not null default 'other';
alter table volunteer_slots drop constraint if exists volunteer_slots_kind_check;
alter table volunteer_slots add constraint volunteer_slots_kind_check check (kind in (
  'front_of_house',  -- ushers, tickets, greeting
  'concessions',
  'backstage',       -- crew, quick changes, green room
  'setup',           -- load-in, set build
  'strike',
  'bring_food',      -- snacks / meals for the cast
  'potluck',         -- a dish for a shared meal
  'supplies',        -- bring an item that is not food
  'chaperone',
  'other'
));

-- ---- signups ---------------------------------------------------------------
alter table volunteer_signups add column if not exists bringing   text;
alter table volunteer_signups add column if not exists badge_ok   boolean not null default false;
alter table volunteer_signups add column if not exists badge_name text;
alter table volunteer_signups add column if not exists updated_at timestamptz not null default now();

-- 0048 let a family delete its own row. That bypasses the 24-hour line, so it
-- goes; release_volunteer_signup() is now the only way a family gives one back.
drop policy if exists volunteer_signups_family_cancel on volunteer_signups;

-- ---- the rule --------------------------------------------------------------
-- When a slot starts, for the purposes of the 24-hour line. A slot with no
-- time of its own counts from the start of its sheet's day in Leesburg; a slot
-- with neither has no line.
create or replace function family_hub.volunteer_slot_starts(p_slot_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path to 'family_hub', 'extensions'
as $fn$
  select coalesce(s.starts_at, (e.on_date::timestamp at time zone 'America/New_York'))
    from volunteer_slots s
    join volunteer_events e on e.id = s.event_id
   where s.id = p_slot_id
$fn$;
revoke all on function family_hub.volunteer_slot_starts(uuid) from public, anon;
grant execute on function family_hub.volunteer_slot_starts(uuid) to authenticated, service_role;

-- Who is calling: a signed-in family is always itself; the service role (the
-- parent portal's server, which has already checked the parent) may name one.
create or replace function family_hub.volunteer_caller_family(p_family_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'family_hub', 'extensions'
as $fn$
  select case
           when family_hub.auth_family_id() is not null then family_hub.auth_family_id()
           when coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') = 'service_role'
             then p_family_id
         end
$fn$;
revoke all on function family_hub.volunteer_caller_family(uuid) from public, anon;
grant execute on function family_hub.volunteer_caller_family(uuid) to authenticated, service_role;

-- ---- taking a slot ---------------------------------------------------------
-- 0048's signature had no room for what you are bringing or the badge, so the
-- old one is dropped and replaced. Nothing calls it but the parent portal,
-- which ships with this migration.
drop function if exists family_hub.claim_volunteer_slot(uuid, text, text, text, uuid);

create or replace function family_hub.claim_volunteer_slot(
  p_slot_id        uuid,
  p_volunteer_name text,
  p_phone          text    default null,
  p_note           text    default null,
  p_family_id      uuid    default null,
  p_bringing       text    default null,
  p_badge_ok       boolean default false,
  p_badge_name     text    default null
) returns jsonb
language plpgsql
security definer
set search_path to 'family_hub', 'extensions'
as $fn$
declare
  fam    uuid := family_hub.volunteer_caller_family(p_family_id);
  s      volunteer_slots;
  ev     volunteer_events;
  taken  int;
  name   text := btrim(coalesce(p_volunteer_name, ''));
  starts timestamptz;
begin
  if fam is null then
    raise exception 'Only a signed-in family can take a volunteer slot.' using errcode = '42501';
  end if;
  if name = '' then
    return jsonb_build_object('ok', false, 'message', 'Say who is coming.');
  end if;

  select * into s from volunteer_slots where id = p_slot_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'That slot no longer exists.');
  end if;
  select * into ev from volunteer_events where id = s.event_id;
  if ev.published_at is null then
    return jsonb_build_object('ok', false, 'message', 'That sign-up is not open yet.');
  end if;
  starts := family_hub.volunteer_slot_starts(p_slot_id);
  if starts is not null and starts <= now() then
    return jsonb_build_object('ok', false, 'message', 'That one has already happened.');
  end if;
  if s.kind in ('bring_food', 'potluck', 'supplies') and btrim(coalesce(p_bringing, '')) = '' then
    return jsonb_build_object('ok', false, 'message', 'Say what you are bringing.');
  end if;
  if exists (select 1 from volunteer_signups where slot_id = p_slot_id and family_id = fam) then
    return jsonb_build_object('ok', false, 'message', 'Your family is already on this slot.');
  end if;

  select count(*) into taken from volunteer_signups where slot_id = p_slot_id;
  if taken >= s.capacity then
    return jsonb_build_object('ok', false, 'message', 'Somebody just took the last place on that one.');
  end if;

  insert into volunteer_signups
    (slot_id, family_id, profile_id, volunteer_name, contact_phone, note, bringing, badge_ok, badge_name)
  values
    (p_slot_id, fam, auth.uid(), name,
     nullif(btrim(coalesce(p_phone, '')), ''),
     nullif(btrim(coalesce(p_note, '')), ''),
     nullif(btrim(coalesce(p_bringing, '')), ''),
     coalesce(p_badge_ok, false),
     case when coalesce(p_badge_ok, false)
          then coalesce(nullif(btrim(coalesce(p_badge_name, '')), ''), name) end);

  return jsonb_build_object('ok', true, 'slot_id', p_slot_id, 'places_left', s.capacity - (taken + 1));
end $fn$;

revoke all on function family_hub.claim_volunteer_slot(uuid, text, text, text, uuid, text, boolean, text) from public, anon;
grant execute on function family_hub.claim_volunteer_slot(uuid, text, text, text, uuid, text, boolean, text)
  to authenticated, service_role;

-- ---- giving it back --------------------------------------------------------
create or replace function family_hub.release_volunteer_signup(
  p_signup_id uuid,
  p_family_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'family_hub', 'extensions'
as $fn$
declare
  fam    uuid := family_hub.volunteer_caller_family(p_family_id);
  g      volunteer_signups;
  starts timestamptz;
begin
  if fam is null then
    raise exception 'Only a signed-in family can give back a volunteer slot.' using errcode = '42501';
  end if;
  select * into g from volunteer_signups where id = p_signup_id and family_id = fam for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'That sign-up is not yours, or is already gone.');
  end if;
  starts := family_hub.volunteer_slot_starts(g.slot_id);
  if starts is not null and starts - interval '24 hours' <= now() then
    return jsonb_build_object('ok', false, 'locked', true,
      'message', 'It is less than 24 hours away, so it can no longer be changed here. Please contact the office.');
  end if;
  delete from volunteer_signups where id = p_signup_id;
  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function family_hub.release_volunteer_signup(uuid, uuid) from public, anon;
grant execute on function family_hub.release_volunteer_signup(uuid, uuid) to authenticated, service_role;

-- ---- moving to another slot ------------------------------------------------
-- A reschedule is one transaction: the new place is taken under its lock
-- before the old one is let go, so a parent never ends up with neither.
-- Both ends must be outside the 24-hour line: the old one because somebody is
-- counting on it, the new one because a place taken the night before is not
-- a reschedule the office knows about.
create or replace function family_hub.move_volunteer_signup(
  p_signup_id  uuid,
  p_to_slot_id uuid,
  p_family_id  uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'family_hub', 'extensions'
as $fn$
declare
  fam    uuid := family_hub.volunteer_caller_family(p_family_id);
  g      volunteer_signups;
  s      volunteer_slots;
  ev     volunteer_events;
  taken  int;
  starts timestamptz;
begin
  if fam is null then
    raise exception 'Only a signed-in family can move a volunteer slot.' using errcode = '42501';
  end if;
  select * into g from volunteer_signups where id = p_signup_id and family_id = fam for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'That sign-up is not yours, or is already gone.');
  end if;
  if g.slot_id = p_to_slot_id then
    return jsonb_build_object('ok', false, 'message', 'You are already on that one.');
  end if;
  starts := family_hub.volunteer_slot_starts(g.slot_id);
  if starts is not null and starts - interval '24 hours' <= now() then
    return jsonb_build_object('ok', false, 'locked', true,
      'message', 'It is less than 24 hours away, so it can no longer be changed here. Please contact the office.');
  end if;

  select * into s from volunteer_slots where id = p_to_slot_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'That slot no longer exists.');
  end if;
  select * into ev from volunteer_events where id = s.event_id;
  if ev.published_at is null then
    return jsonb_build_object('ok', false, 'message', 'That sign-up is not open.');
  end if;
  starts := family_hub.volunteer_slot_starts(p_to_slot_id);
  if starts is not null and starts - interval '24 hours' <= now() then
    return jsonb_build_object('ok', false,
      'message', 'That one is less than 24 hours away. Please contact the office to switch into it.');
  end if;
  if s.kind in ('bring_food', 'potluck', 'supplies') and g.bringing is null then
    return jsonb_build_object('ok', false,
      'message', 'That slot asks what you are bringing. Give this one back and sign up for it instead.');
  end if;
  if exists (select 1 from volunteer_signups where slot_id = p_to_slot_id and family_id = fam) then
    return jsonb_build_object('ok', false, 'message', 'Your family is already on that slot.');
  end if;
  select count(*) into taken from volunteer_signups where slot_id = p_to_slot_id;
  if taken >= s.capacity then
    return jsonb_build_object('ok', false, 'message', 'That slot is full.');
  end if;

  update volunteer_signups set slot_id = p_to_slot_id, updated_at = now() where id = p_signup_id;
  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function family_hub.move_volunteer_signup(uuid, uuid, uuid) from public, anon;
grant execute on function family_hub.move_volunteer_signup(uuid, uuid, uuid) to authenticated, service_role;

-- ---- what both portals read ------------------------------------------------
-- Dropped and recreated rather than replaced: columns are added in the middle,
-- and CREATE OR REPLACE would not carry security_invoker anyway.
drop view if exists family_hub.v_volunteer_slots;
create view family_hub.v_volunteer_slots with (security_invoker = true) as
  select
    s.id            as slot_id,
    s.event_id,
    e.production_id,
    e.title         as event_title,
    e.details       as event_details,
    e.on_date,
    e.location,
    e.published_at,
    s.title         as slot_title,
    s.kind,
    s.starts_at,
    s.ends_at,
    s.notes,
    s.capacity,
    s.sort_order,
    c.taken,
    greatest(s.capacity - c.taken, 0)::int as places_left,
    family_hub.volunteer_slot_starts(s.id)  as counts_from
  from family_hub.volunteer_slots s
  join family_hub.volunteer_events e on e.id = s.event_id
  cross join lateral (
    select count(*)::int as taken from family_hub.volunteer_signups vs where vs.slot_id = s.id
  ) c;

grant select on family_hub.v_volunteer_slots to authenticated, service_role;

do $assert$
begin
  if not exists (select 1 from pg_class
                  where oid = 'family_hub.v_volunteer_slots'::regclass
                    and 'security_invoker=true' = any(reloptions)) then
    raise exception 'v_volunteer_slots lost security_invoker';
  end if;
end $assert$;

notify pgrst, 'reload schema';
