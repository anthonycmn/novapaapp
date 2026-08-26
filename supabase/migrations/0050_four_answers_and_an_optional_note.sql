-- ---------------------------------------------------------------------------
-- 0050 — Four answers, not two, and a note that is optional.
-- ---------------------------------------------------------------------------
-- CJ sent the screenshot the spec came from — the app his son's soccer team
-- uses. "Set Attendance": Attending, Not Attending, Injury, Partial, picked
-- one at a time, a "Clear" that takes the answer back, and "Add note" folded
-- away underneath.
--
-- 0049 guessed at two answers and a compulsory reason, and both halves were
-- wrong. The four statuses ARE the reason: "Injury" and "Partial" tell a
-- director more than a sentence would, and demanding prose from somebody
-- tapping a phone at seven in the morning is how a box fills up with "n/a".
--
-- ANYTHING BUT ATTENDING FILES AN ABSENCE, unchanged from 0049 and for the
-- same reason — the absence is what the morning digest emails and what the
-- Conflicts page reads. The status becomes the reason a director sees, with
-- the note appended when there is one: "Injury — twisted her ankle at school".
--
-- CLEAR is a real answer too: it deletes the response AND the absence it
-- filed, so a parent who taps by mistake does not leave a director planning
-- around a child who is coming after all.
--
-- Safe to re-run.
-- ---------------------------------------------------------------------------
set search_path = family_hub, extensions;

alter table event_responses drop constraint if exists event_responses_status_check;
alter table event_responses add constraint event_responses_status_check
  check (status in ('attending','not_attending','injury','partial'));

update event_responses set status = 'not_attending' where status = 'conflict';

comment on column event_responses.status is
  'attending | not_attending | injury | partial — the four the family picks '
  'from (0050). Anything but attending files an absence for that call.';
comment on column event_responses.reason is
  'The optional note. The STATUS carries the meaning; this is the detail.';

-- respond_to_call, rewritten for the four answers and for 'clear'.
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
  note  text := nullif(btrim(coalesce(p_reason, '')), '');
  label text;
begin
  fam := case
           when own is not null then own
           when claim = 'service_role' then p_family_id
         end;
  if fam is null then
    raise exception 'Only a signed-in family can answer a call.' using errcode = '42501';
  end if;

  select * into stu from students where id = p_student_id;
  if not found or stu.family_id <> fam then
    raise exception 'That is not your student.' using errcode = '42501';
  end if;

  -- 'clear' takes the answer back: no response, and no absence left behind.
  if p_status = 'clear' then
    select * into prior from event_responses
     where event_id = p_event_id and student_id = p_student_id;
    if prior.absence_report_id is not null then
      delete from absence_reports where id = prior.absence_report_id;
    end if;
    delete from event_responses
     where event_id = p_event_id and student_id = p_student_id;
    return jsonb_build_object('ok', true, 'status', 'clear');
  end if;

  if p_status not in ('attending','not_attending','injury','partial') then
    return jsonb_build_object('ok', false, 'message', 'That is not one of the answers.');
  end if;

  select * into ev from calendar_events where id = p_event_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'That call is no longer on the calendar.');
  end if;

  select * into prior from event_responses
   where event_id = p_event_id and student_id = p_student_id;
  if prior.absence_report_id is not null then
    delete from absence_reports where id = prior.absence_report_id;
  end if;

  if p_status <> 'attending' then
    label := case p_status
               when 'not_attending' then 'Not attending'
               when 'injury' then 'Injury'
               when 'partial' then 'Partial — here for some of it'
             end;
    insert into absence_reports
      (family_id, student_id, production_id, offering_title,
       starts_on, ends_on, starts_at_time, ends_at_time, reason, reported_by_name)
    values
      (fam, p_student_id, ev.production_id, ev.title,
       (ev.starts_at at time zone 'America/New_York')::date,
       (ev.starts_at at time zone 'America/New_York')::date,
       (ev.starts_at at time zone 'America/New_York')::time,
       (ev.ends_at   at time zone 'America/New_York')::time,
       label || coalesce(' — ' || note, ''), p_by_name)
    returning id into absence_id;
  end if;

  insert into event_responses
    (event_id, student_id, family_id, status, reason, responded_by, responded_by_name,
     absence_report_id)
  values
    (p_event_id, p_student_id, fam, p_status, note, auth.uid(), p_by_name, absence_id)
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
