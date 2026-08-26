-- 0054 — "Sat Oct 24, Sat Oct 24" is not an answer
--
-- Found by testing 0053 inside a transaction that rolled itself back, rather
-- than by a family reading it: a child moved onto both of Saturday's shows was
-- told they now play "Fri Oct 23, Sat Oct 24, Sat Oct 24". A two-show day is
-- the exact day a parent most needs to know WHICH, and that message answered
-- the question by repeating it.
--
-- Matinee/evening rather than a clock time, deliberately. starts_at on this
-- calendar holds the CALL, not the curtain — the curtain lives in the event
-- title, in prose — so printing the time would put the wrong hour in a
-- parent's pocket with total confidence. "Sat Oct 24 matinee" is the most this
-- data can honestly say, and it is enough to get somebody to the right show.
--
-- Only the notification wording changes. Nothing about what is stored moves.

create or replace function family_hub.portal_set_performance_split(
  p_assignment uuid,
  p_events uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to 'family_hub', 'extensions'
as $function$
declare
  v_a casting_assignments%rowtype;
  v_student students%rowtype;
  v_title text;
  v_before uuid[];
  v_after uuid[];
  v_when text;
  v_parents int := 0;
begin
  if not coalesce(is_staffish(), false) then
    raise exception 'Casting can only be changed by staff';
  end if;

  select * into v_a from casting_assignments where id = p_assignment for update;
  if not found then
    raise exception 'No such casting assignment';
  end if;

  select array_agg(event_id order by event_id) into v_before
  from casting_assignment_performances
  where assignment_id = p_assignment;

  delete from casting_assignment_performances where assignment_id = p_assignment;

  insert into casting_assignment_performances (assignment_id, event_id)
  select p_assignment, ce.id
  from unnest(coalesce(p_events, '{}'::uuid[])) x
  join calendar_events ce
    on ce.id = x
   and ce.production_id = v_a.production_id
   and ce.type = 'performance'
  on conflict do nothing;

  select array_agg(event_id order by event_id) into v_after
  from casting_assignment_performances
  where assignment_id = p_assignment;

  if v_a.published_at is not null
     and coalesce(v_before, '{}'::uuid[]) is distinct from coalesce(v_after, '{}'::uuid[])
  then
    select * into v_student from students where id = v_a.student_id;
    select title into v_title from productions where id = v_a.production_id;

    select string_agg(
             to_char(ce.starts_at at time zone 'America/New_York', 'FMDy FMMon FMDD')
               || case
                    when extract(hour from ce.starts_at at time zone 'America/New_York') < 16
                    then ' matinee' else ' evening'
                  end,
             ', ' order by ce.starts_at
           )
      into v_when
    from casting_assignment_performances cap
    join calendar_events ce on ce.id = cap.event_id
    where cap.assignment_id = p_assignment;

    insert into notifications (user_id, type, title, body, url)
    select pr.id,
           'casting_released',
           'Performance dates changed for ' || coalesce(v_title, 'the show'),
           coalesce(nullif(v_student.preferred_name, ''), v_student.first_name)
             || ' now plays ' || v_a.character_name || ' at '
             || coalesce(v_when, 'every performance')
             || '. Tap for the full list.',
           '/casting'
    from profiles pr
    where pr.role = 'parent' and pr.family_id = v_student.family_id;
    get diagnostics v_parents = row_count;
  end if;

  return jsonb_build_object(
    'events', coalesce(array_length(v_after, 1), 0),
    'notified', v_parents
  );
end
$function$;

revoke all on function family_hub.portal_set_performance_split(uuid, uuid[]) from anon;
grant execute on function family_hub.portal_set_performance_split(uuid, uuid[]) to authenticated;
