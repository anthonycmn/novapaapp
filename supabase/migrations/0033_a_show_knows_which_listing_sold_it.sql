-- ---------------------------------------------------------------------------
-- 0033 — A show knows which listing sold it.
-- ---------------------------------------------------------------------------
-- Tony, 17 Aug 2026: create a class or a show in the staff portal, have it go
-- live in registration, "and then I want it to be linked to the parent portal.
-- Once someone registers, they can log in to the parent portal to see
-- everything."
--
-- The last clause is the one that had no mechanism. Registration knew what a
-- family bought and this app knew what it ran, and the only thing joining them
-- was the NAME.
--
-- ---------------------------------------------------------------------------
-- WHAT THE NAME MATCH ACTUALLY DID
-- ---------------------------------------------------------------------------
-- reconcile.ts took the listing's display name, lowercased it, folded unicode
-- dashes, stripped punctuation, and looked for a production title that came out
-- the same. That is why "Frozen JR." finds "Frozen Jr" — and it is genuinely
-- the right fallback for eight years of history where nothing else exists.
--
-- But it fails in three ways that all look identical from the outside, and all
-- end with a child on no roster:
--
--   * a listing whose name says something the production title does not
--     ("Ages 5–9 Day Camp · Sep 21, 2026" vs "Heroes & Villains");
--   * a show renamed on one side and not the other;
--   * two productions with the same title in different seasons.
--
-- Each becomes an `unknown_offering` issue, which is at least visible. But
-- visible is not the same as handled: 0129 exists because three children were
-- booked onto 21 September and appeared on no register at all.
--
-- ---------------------------------------------------------------------------
-- WHY AN ID FIXES IT AND A BETTER NAME WOULD NOT
-- ---------------------------------------------------------------------------
-- The staff portal now writes the registration listing and the app row in one
-- action, so at the moment of creation it holds both ids. Recording the pair is
-- free, and nothing typed afterwards can pull them apart. There is no cleverer
-- string comparison that achieves that, because the failure is not that the
-- names are compared badly — it is that they are allowed to diverge.
--
-- The name match STAYS, for every row that predates this column. reconcile.ts
-- prefers the id and falls back to the name; tests/registration.test.ts holds
-- both paths, including one that proves a stale name cannot outrank an id.
--
-- Nullable, no default, no backfill. A null means "matched by name, as before",
-- which is true of all 24 productions and all 4 classes today.
-- ---------------------------------------------------------------------------

alter table family_hub.productions
  add column if not exists registration_activity_id bigint;

alter table family_hub.classes
  add column if not exists registration_activity_id bigint;

comment on column family_hub.productions.registration_activity_id is
  'The public.activities listing this production is sold as. Written by the staff portal when it publishes an offering. NULL means the enrolment bridge matches this row by name, which is what every row did before 17 Aug 2026.';
comment on column family_hub.classes.registration_activity_id is
  'The public.activities listing this class is sold as. See the note on productions.registration_activity_id.';

-- One listing sells one thing. Two productions claiming the same activity id
-- would make the id match ambiguous, which is the precise failure this column
-- exists to remove — so the database refuses it rather than letting reconcile
-- pick whichever row came back first.
--
-- Partial, because NULL is the ordinary state and many rows share it.
create unique index if not exists productions_registration_activity_uq
  on family_hub.productions (registration_activity_id)
  where registration_activity_id is not null;

create unique index if not exists classes_registration_activity_uq
  on family_hub.classes (registration_activity_id)
  where registration_activity_id is not null;

-- A listing is a production or a class, never both: an enrolment that resolved
-- to two different things would be worse than one that resolved to none.
-- Enforced as a check the bridge runs rather than a constraint, because the two
-- tables cannot see each other in a unique index.
create or replace function family_hub.assert_activity_claimed_once()
returns trigger
language plpgsql
as $$
declare
  v_clash text;
begin
  if new.registration_activity_id is null then
    return new;
  end if;
  if tg_table_name = 'productions' then
    select 'class ' || c.name into v_clash
      from family_hub.classes c
     where c.registration_activity_id = new.registration_activity_id
     limit 1;
  else
    select 'production ' || p.title into v_clash
      from family_hub.productions p
     where p.registration_activity_id = new.registration_activity_id
     limit 1;
  end if;
  if v_clash is not null then
    raise exception
      'Registration listing % is already claimed by %', new.registration_activity_id, v_clash
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists productions_activity_claimed_once on family_hub.productions;
create trigger productions_activity_claimed_once
  before insert or update of registration_activity_id on family_hub.productions
  for each row execute function family_hub.assert_activity_claimed_once();

drop trigger if exists classes_activity_claimed_once on family_hub.classes;
create trigger classes_activity_claimed_once
  before insert or update of registration_activity_id on family_hub.classes
  for each row execute function family_hub.assert_activity_claimed_once();

-- ---------------------------------------------------------------------------
-- ADOPTING A LISTING
-- ---------------------------------------------------------------------------
-- The column above is only half the answer. The other half is that somebody
-- has to write it, at the moment both rows exist — and until now nothing in
-- this app created a production because registration started selling one.
--
-- lib/hub.ts in the staff portal shows what filled that gap: HUB_TITLES, a
-- hand-written map from portal show titles to family-app titles, kept in step
-- by remembering to. It is not wrong, it is just a list somebody has to update,
-- and the failure mode of a list somebody has to update is a child missing from
-- a roster in the week of the show.
--
-- So: one function, called by the portal the moment it publishes an offering.
-- Idempotent by the activity id, because publishing twice is an ordinary thing
-- to do and must not produce two productions.
--
-- It ADOPTS before it creates. If a production or class already exists with
-- that title and has no listing of its own, it takes that row rather than
-- making a second one — the same rule 0117 settled on in the staff portal, and
-- for the same reason: the twenty-four productions already here were created by
-- hand and are the ones families are looking at.

create or replace function family_hub.adopt_registration_offering(
  p_activity_id  bigint,
  p_kind         text,               -- 'production' | 'class'
  p_title        text,
  p_starts_on    date default null,
  p_ends_on      date default null,
  p_day_of_week  int  default null,  -- 0=Sun, the app's own convention
  p_start_time   time default null,
  p_end_time     time default null,
  p_location     text default null
)
returns uuid
language plpgsql
security definer
set search_path = family_hub, staff_portal, public
as $$
declare
  v_id        uuid;
  v_season    uuid;
  v_program   uuid;
begin
  -- Published from the staff portal by a Chief, or by a family-app admin.
  -- Nobody else, because this creates the thing a family's enrolment attaches
  -- to and names it.
  if not (coalesce(staff_portal.is_chief(), false) or coalesce(family_hub.is_admin(), false)) then
    raise exception 'Only a Super Admin may adopt a registration listing'
      using errcode = '42501';
  end if;
  if p_kind not in ('production', 'class') then
    raise exception 'kind must be production or class, not %', p_kind using errcode = '22023';
  end if;

  -- Already linked: return it. This is what makes republishing free.
  if p_kind = 'production' then
    select id into v_id from family_hub.productions where registration_activity_id = p_activity_id;
  else
    select id into v_id from family_hub.classes where registration_activity_id = p_activity_id;
  end if;
  if v_id is not null then
    return v_id;
  end if;

  select id into v_season from family_hub.seasons where is_current order by starts_on desc limit 1;
  select id into v_program from family_hub.programs
   where name = case when p_kind = 'class' then 'Year-Round Classes' else 'Broadway Bound' end
   limit 1;

  if p_kind = 'production' then
    -- Adopt an existing production of the same name that has no listing yet.
    select id into v_id
      from family_hub.productions
     where registration_activity_id is null
       and lower(regexp_replace(title, '[^a-zA-Z0-9]+', ' ', 'g'))
         = lower(regexp_replace(p_title, '[^a-zA-Z0-9]+', ' ', 'g'))
     limit 1;

    if v_id is null then
      insert into family_hub.productions (program_id, season_id, title, venue, opens_on, closes_on,
                                          registration_activity_id)
      values (v_program, v_season, p_title, coalesce(p_location, ''), p_starts_on, p_ends_on,
              p_activity_id)
      returning id into v_id;
    else
      update family_hub.productions
         set registration_activity_id = p_activity_id,
             -- Dates only where this row has none. A production somebody
             -- filled in by hand is not overwritten by a listing.
             opens_on = coalesce(opens_on, p_starts_on),
             closes_on = coalesce(closes_on, p_ends_on)
       where id = v_id;
    end if;
  else
    select id into v_id
      from family_hub.classes
     where registration_activity_id is null
       and lower(regexp_replace(name, '[^a-zA-Z0-9]+', ' ', 'g'))
         = lower(regexp_replace(p_title, '[^a-zA-Z0-9]+', ' ', 'g'))
     limit 1;

    if v_id is null then
      -- day_of_week/start/end are NOT NULL on this table. A class with no
      -- timetable yet gets a placeholder Monday rather than failing the
      -- publish — the listing is the thing that has to go live, and the
      -- timetable is editable here afterwards.
      insert into family_hub.classes (program_id, name, day_of_week, start_time, end_time,
                                      location, registration_activity_id)
      values (v_program, p_title, coalesce(p_day_of_week, 1),
              coalesce(p_start_time, '16:00'), coalesce(p_end_time, '17:00'),
              coalesce(p_location, ''), p_activity_id)
      returning id into v_id;
    else
      update family_hub.classes
         set registration_activity_id = p_activity_id,
             location = case when coalesce(location,'') = '' then coalesce(p_location,'') else location end
       where id = v_id;
    end if;
  end if;

  return v_id;
end;
$$;

comment on function family_hub.adopt_registration_offering(bigint, text, text, date, date, int, time, time, text) is
  'Called by the staff portal when it publishes an offering: finds or creates the app row for a registration listing and records the link. Idempotent by activity id. Adopts a same-named row that has no listing rather than creating a duplicate.';

revoke all on function family_hub.adopt_registration_offering(bigint, text, text, date, date, int, time, time, text) from public, anon;
grant execute on function family_hub.adopt_registration_offering(bigint, text, text, date, date, int, time, time, text) to authenticated, service_role;

notify pgrst, 'reload schema';
