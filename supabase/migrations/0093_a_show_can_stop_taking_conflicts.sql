-- 0093 — A show can stop taking conflicts.
--
-- CJ, 21 Sep 2026: "Disable the ability to report conflicts in the parent
-- portal for Sweeney Todd and put a banner in there that says, we are no
-- longer accepting conflicts at this time."
--
-- A conflict reaches us two ways: the absence form (/family/absences) and
-- the per-child attendance chip on a call (0049/0050), which files an
-- absence report in the same transaction. Both need the same switch, so it
-- lives on the production rather than in either page: conflicts_closed_at.
-- Null means open, as every show has been until now. A timestamp is the
-- moment it closed, so the office can later see when — and it doubles as
-- the flag.
--
-- respond_to_call is the one door the parent portal cannot close from the
-- outside (the UI hides the answers, but the RPC is what writes), so it
-- refuses a Not attending / Injury / Partial on a closed show. "Attending"
-- still saves: confirming you WILL be there is not a conflict. "Clear"
-- still works: taking a conflict back reduces the director's list, which
-- is the opposite of what CJ is stopping.
--
-- Sweeney Todd - Teen Conservatory closes today. Reopening is
--   update family_hub.productions set conflicts_closed_at = null where …
-- and needs no deploy.
--
-- Safe to re-run.
set search_path = family_hub, public;

alter table family_hub.productions
  add column if not exists conflicts_closed_at timestamptz;

comment on column family_hub.productions.conflicts_closed_at is
  'When the show stopped accepting conflicts from families (0093). Null = open. '
  'Hides the absence form and the non-attending answers in the parent portal, and '
  'respond_to_call refuses them. Attending and Clear still save.';

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
  closed timestamptz;
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

  -- 0093: a show that has stopped taking conflicts takes only "attending".
  if p_status <> 'attending' and ev.production_id is not null then
    select conflicts_closed_at into closed from productions where id = ev.production_id;
    if closed is not null then
      return jsonb_build_object(
        'ok', false,
        'message', 'We are no longer accepting conflicts for this show at this time.'
      );
    end if;
  end if;

  select * into prior from event_responses
   where event_id = p_event_id and student_id = p_student_id;
  if prior.absence_report_id is not null then
    delete from absence_reports where id = prior.absence_report_id;
  end if;

  /*
   * Anything but attending files an absence, because all three mean a
   * director is planning around somebody. The STATUS becomes the reason a
   * director reads — "Injury" is more use than a sentence — and the note is
   * appended when there is one.
   */
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

-- Sweeney Todd stops taking conflicts today. Matched by title rather than
-- id so the file reads the same as the instruction; the where clause is
-- narrow enough that it cannot touch a second show.
update family_hub.productions
   set conflicts_closed_at = coalesce(conflicts_closed_at, now())
 where title = 'Sweeney Todd - Teen Conservatory';

notify pgrst, 'reload schema';
