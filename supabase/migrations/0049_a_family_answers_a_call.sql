-- ---------------------------------------------------------------------------
-- 0049 — A family answers a call: attending, or a conflict with a reason.
-- ---------------------------------------------------------------------------
-- From a parent, 25 Aug 2026, and CJ on the 26th: "it would be great if
-- parents could mark Attending or Conflict/Not Attending (with a reason) for
-- each rehearsal day directly from the dashboard. Having easy access to a
-- record of submitted attendance or conflicts would help parents confirm that
-- everything was communicated on time."
--
-- ONE ANSWER PER CHILD PER CALL, which is what the unique constraint says.
-- Changing your mind edits the answer rather than filing a second one, because
-- two answers to one question is not a record, it is an argument.
--
-- A CONFLICT ALSO FILES AN ABSENCE, in the same transaction, and this is the
-- load-bearing decision. Absence reports are what the morning digest emails to
-- directors and what the staff Conflicts page reads. Had this written only to
-- its own table, a parent would have answered honestly, on time, into a second
-- inbox nobody watches — which is precisely the failure the request is about.
-- Switching back to attending withdraws that absence again, so a change of
-- mind leaves no ghost for somebody to act on next week.
--
-- A CONFLICT MUST SAY WHY, refused here as well as in the page. "Not
-- attending" with no reason is the message staff cannot act on and the one
-- that turns into the phone call this feature exists to save.
--
-- SAME CALLER RULE as claim_volunteer_slot (0048): a signed-in family is
-- always itself, so p_family_id is ignored for them; the service role may name
-- the family, because the parent portal is service-key server-side and has
-- already checked the parent belongs to it. And the student is re-checked
-- against that family here — a family may only answer for its own children,
-- whatever the caller says.
--
-- Verified on live data inside a rolled-back transaction: a conflict files
-- exactly one absence, attending withdraws it, and a reasonless conflict is
-- refused. Anon EXECUTE revoked and probed — 42501.
--
-- Safe to re-run.
-- ---------------------------------------------------------------------------
set search_path = family_hub, extensions;

create table if not exists event_responses (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references family_hub.calendar_events(id) on delete cascade,
  student_id   uuid not null references family_hub.students(id) on delete cascade,
  family_id    uuid not null references family_hub.families(id) on delete cascade,
  status       text not null check (status in ('attending','conflict')),
  reason       text,
  responded_by uuid references family_hub.profiles(id) on delete set null,
  responded_by_name text,
  -- The absence this conflict filed, so switching back can take it away and
  -- staff never act on a withdrawn conflict.
  absence_report_id uuid references family_hub.absence_reports(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (event_id, student_id)
);

create index if not exists event_responses_family_idx on event_responses (family_id);
create index if not exists event_responses_event_idx  on event_responses (event_id);

alter table event_responses enable row level security;

drop policy if exists event_responses_family on event_responses;
create policy event_responses_family on event_responses
  for select to authenticated
  using (family_id = family_hub.auth_family_id() or family_hub.is_staffish());

drop policy if exists event_responses_staff_write on event_responses;
create policy event_responses_staff_write on event_responses
  for all to authenticated
  using (family_hub.is_staffish()) with check (family_hub.is_staffish());

grant select on event_responses to authenticated;

create or replace function family_hub.respond_to_call(
  p_event_id uuid,
  p_student_id uuid,
  p_status text,
  p_reason text default null,
  p_family_id uuid default null,
  p_by_name text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'family_hub', 'extensions'
as $fn$
declare
  own   uuid := family_hub.auth_family_id();
  claim text := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  fam   uuid;
  ev    calendar_events;
  stu   students;
  prior event_responses;
  absence_id uuid;
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  fam := case
           when own is not null then own
           when claim = 'service_role' then p_family_id
         end;
  if fam is null then
    raise exception 'Only a signed-in family can answer a call.' using errcode = '42501';
  end if;
  if p_status not in ('attending', 'conflict') then
    return jsonb_build_object('ok', false, 'message', 'Answer attending or conflict.');
  end if;

  select * into stu from students where id = p_student_id;
  if not found or stu.family_id <> fam then
    raise exception 'That is not your student.' using errcode = '42501';
  end if;

  select * into ev from calendar_events where id = p_event_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'That call is no longer on the calendar.');
  end if;

  if p_status = 'conflict' and reason is null then
    return jsonb_build_object('ok', false, 'message', 'Tell us why, even briefly.');
  end if;

  select * into prior from event_responses
   where event_id = p_event_id and student_id = p_student_id;

  if prior.absence_report_id is not null then
    delete from absence_reports where id = prior.absence_report_id;
  end if;

  if p_status = 'conflict' then
    insert into absence_reports
      (family_id, student_id, production_id, offering_title,
       starts_on, ends_on, starts_at_time, ends_at_time, reason, reported_by_name)
    values
      (fam, p_student_id, ev.production_id, ev.title,
       (ev.starts_at at time zone 'America/New_York')::date,
       (ev.starts_at at time zone 'America/New_York')::date,
       (ev.starts_at at time zone 'America/New_York')::time,
       (ev.ends_at   at time zone 'America/New_York')::time,
       reason, p_by_name)
    returning id into absence_id;
  end if;

  insert into event_responses
    (event_id, student_id, family_id, status, reason, responded_by, responded_by_name,
     absence_report_id)
  values
    (p_event_id, p_student_id, fam, p_status, reason, auth.uid(), p_by_name, absence_id)
  on conflict (event_id, student_id) do update
    set status = excluded.status,
        reason = excluded.reason,
        responded_by = excluded.responded_by,
        responded_by_name = excluded.responded_by_name,
        absence_report_id = excluded.absence_report_id,
        updated_at = now();

  return jsonb_build_object('ok', true, 'status', p_status, 'filed_absence', absence_id is not null);
end $fn$;

revoke all on function family_hub.respond_to_call(uuid, uuid, text, text, uuid, text) from public, anon;
grant execute on function family_hub.respond_to_call(uuid, uuid, text, text, uuid, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';
