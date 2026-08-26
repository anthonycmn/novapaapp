-- ---------------------------------------------------------------------------
-- 0048 — Volunteers sign up for a slot on a show.
-- ---------------------------------------------------------------------------
-- CJ, 26 Aug 2026: "CREATE A VOLUNTEER PAGE where directors, admin, and super
-- admin can create volunteer sign ups with times and schedules - similar to
-- signupgenius - and then on the parent portal those show up and parents can
-- sign up for slots that are available." Asked whether a sign-up could stand
-- on its own: "attached to a production only."
--
-- IN family_hub, NOT staff_portal, for the same reason casting is. The staff
-- portal writes the family app's own tables with the signed-in user's token
-- and the parent portal reads them. One set of rows and no sync layer — the
-- sheet a director builds IS the sheet a parent sees.
--
-- THREE TABLES, which is what SignUpGenius is underneath: an EVENT (strike
-- night, load-in, a concessions shift), its SLOTS (a time, a job, how many
-- people are wanted), and who took them.
--
-- CAPACITY IS A RACE, so taking a slot is an RPC and not an insert policy. Two
-- parents tapping the last strike-night place at the same moment both pass a
-- policy that can only see their own row; the count has to be taken with the
-- slot locked, which a policy cannot do. claim_volunteer_slot() locks, counts,
-- and refuses politely — "somebody just took the last place on that one" —
-- rather than raising at a parent.
--
-- WHO SIGNED UP IS VISIBLE to other families on a published sheet, and that is
-- deliberate: a sign-up sheet whose names nobody can see cannot tell a parent
-- whether the shift still needs them, and "who else is on strike night" is
-- half the reason anybody volunteers. Names only — the phone number and the
-- note stay with the family that wrote them and with staff.
--
-- PUBLISHED IS A REAL LINE. Nothing reaches a family until somebody says so; a
-- half-built sheet appearing in the parent portal is worse than a late one.
--
-- Per 0023: coalesce() guards, and anon EXECUTE revoked and re-probed — a bare
-- anon-key call returns 42501, verified.
--
-- Safe to re-run.
-- ---------------------------------------------------------------------------
set search_path = family_hub, extensions;

create table if not exists volunteer_events (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references family_hub.productions(id) on delete cascade,
  title         text not null,
  details       text,
  location      text,
  on_date       date,
  published_at  timestamptz,
  created_by    uuid references family_hub.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists volunteer_slots (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references family_hub.volunteer_events(id) on delete cascade,
  title       text not null,
  starts_at   timestamptz,
  ends_at     timestamptz,
  notes       text,
  -- Never null: "as many as turn up" is not a sign-up sheet, it is a hope.
  capacity    int not null default 1 check (capacity between 1 and 200),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists volunteer_signups (
  id             uuid primary key default gen_random_uuid(),
  slot_id        uuid not null references family_hub.volunteer_slots(id) on delete cascade,
  family_id      uuid not null references family_hub.families(id) on delete cascade,
  profile_id     uuid references family_hub.profiles(id) on delete set null,
  -- Who is actually coming, which is not always the parent who booked it.
  volunteer_name text not null,
  contact_phone  text,
  note           text,
  created_at     timestamptz not null default now(),
  -- One family, one place per slot. Two parents from the same household on
  -- the same shift is a double booking, not two volunteers.
  unique (slot_id, family_id)
);

create index if not exists volunteer_events_production_idx on volunteer_events (production_id);
create index if not exists volunteer_slots_event_idx        on volunteer_slots (event_id);
create index if not exists volunteer_signups_slot_idx       on volunteer_signups (slot_id);
create index if not exists volunteer_signups_family_idx     on volunteer_signups (family_id);

alter table volunteer_events  enable row level security;
alter table volunteer_slots   enable row level security;
alter table volunteer_signups enable row level security;

drop policy if exists volunteer_events_staff on volunteer_events;
create policy volunteer_events_staff on volunteer_events
  for all to authenticated
  using (family_hub.is_staffish()) with check (family_hub.is_staffish());
drop policy if exists volunteer_events_family_read on volunteer_events;
create policy volunteer_events_family_read on volunteer_events
  for select to authenticated using (published_at is not null);

drop policy if exists volunteer_slots_staff on volunteer_slots;
create policy volunteer_slots_staff on volunteer_slots
  for all to authenticated
  using (family_hub.is_staffish()) with check (family_hub.is_staffish());
drop policy if exists volunteer_slots_family_read on volunteer_slots;
create policy volunteer_slots_family_read on volunteer_slots
  for select to authenticated
  using (exists (select 1 from family_hub.volunteer_events e
                  where e.id = event_id and e.published_at is not null));

drop policy if exists volunteer_signups_staff on volunteer_signups;
create policy volunteer_signups_staff on volunteer_signups
  for all to authenticated
  using (family_hub.is_staffish()) with check (family_hub.is_staffish());
drop policy if exists volunteer_signups_family_read on volunteer_signups;
create policy volunteer_signups_family_read on volunteer_signups
  for select to authenticated
  using (
    family_id = family_hub.auth_family_id()
    or exists (select 1 from family_hub.volunteer_slots s
               join family_hub.volunteer_events e on e.id = s.event_id
               where s.id = slot_id and e.published_at is not null)
  );
-- A family may give its own place back. Taking one is the RPC's job.
drop policy if exists volunteer_signups_family_cancel on volunteer_signups;
create policy volunteer_signups_family_cancel on volunteer_signups
  for delete to authenticated using (family_id = family_hub.auth_family_id());

grant select, insert, update, delete on volunteer_events  to authenticated;
grant select, insert, update, delete on volunteer_slots   to authenticated;
grant select, insert, update, delete on volunteer_signups to authenticated;

create or replace function family_hub.claim_volunteer_slot(
  p_slot_id uuid,
  p_volunteer_name text,
  p_phone text default null,
  p_note  text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'family_hub', 'extensions'
as $fn$
declare
  fam    uuid := family_hub.auth_family_id();
  s      volunteer_slots;
  ev     volunteer_events;
  taken  int;
  name   text := btrim(coalesce(p_volunteer_name, ''));
begin
  if fam is null then
    raise exception 'Only a signed-in family can take a volunteer slot.'
      using errcode = '42501';
  end if;
  if name = '' then
    return jsonb_build_object('ok', false, 'message', 'Say who is coming.');
  end if;

  -- The lock is the whole point of this function.
  select * into s from volunteer_slots where id = p_slot_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'That slot no longer exists.');
  end if;

  select * into ev from volunteer_events where id = s.event_id;
  if ev.published_at is null then
    return jsonb_build_object('ok', false, 'message', 'That sign-up is not open yet.');
  end if;

  if exists (select 1 from volunteer_signups where slot_id = p_slot_id and family_id = fam) then
    return jsonb_build_object('ok', false, 'message', 'Your family is already on this slot.');
  end if;

  select count(*) into taken from volunteer_signups where slot_id = p_slot_id;
  if taken >= s.capacity then
    return jsonb_build_object('ok', false, 'message', 'Somebody just took the last place on that one.');
  end if;

  insert into volunteer_signups (slot_id, family_id, profile_id, volunteer_name, contact_phone, note)
  values (p_slot_id, fam, auth.uid(), name, nullif(btrim(coalesce(p_phone, '')), ''),
          nullif(btrim(coalesce(p_note, '')), ''));

  return jsonb_build_object(
    'ok', true,
    'slot_id', p_slot_id,
    'places_left', s.capacity - (taken + 1));
end $fn$;

revoke all on function family_hub.claim_volunteer_slot(uuid, text, text, text) from public, anon;
grant execute on function family_hub.claim_volunteer_slot(uuid, text, text, text) to authenticated;

-- What both portals read, so neither does arithmetic the other might do
-- differently.
create or replace view family_hub.v_volunteer_slots as
  select
    s.id            as slot_id,
    s.event_id,
    e.production_id,
    e.title         as event_title,
    e.on_date,
    e.location,
    e.published_at,
    s.title         as slot_title,
    s.starts_at,
    s.ends_at,
    s.notes,
    s.capacity,
    s.sort_order,
    (select count(*) from family_hub.volunteer_signups vs where vs.slot_id = s.id)::int as taken,
    greatest(s.capacity - (select count(*) from family_hub.volunteer_signups vs where vs.slot_id = s.id), 0)::int as places_left
  from family_hub.volunteer_slots s
  join family_hub.volunteer_events e on e.id = s.event_id;

grant select on family_hub.v_volunteer_slots to authenticated;

notify pgrst, 'reload schema';
