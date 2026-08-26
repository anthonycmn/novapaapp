-- 0053 — the split can be changed after the cast list has gone out
--
-- CJ, 26 Aug 2026: "build the edit path for after publishing."
--
-- 0052 put the split on the draft board's jsonb, which meant it could only be
-- decided BEFORE publishing: submit flips the board to 'submitted', the draft
-- editor disappears, and a Saturday matinee swap in week three had nowhere to
-- go. Casts change. A shared part is exactly the kind of thing that changes.
--
-- So the edit path writes to casting_assignment_performances DIRECTLY, keyed
-- by the published assignment, rather than reopening the board. The board is a
-- record of what was decided and published; it should not start moving again
-- underneath a cast list that families have already been shown.
--
-- ONE FUNCTION, NOT TWO WRITES. Replacing a split from the client would be a
-- DELETE and then a POST, and a network hiccup between them leaves a child on
-- NO performances — which reads, everywhere downstream, as "plays the whole
-- run". That is the worst possible failure for this table, so the swap happens
-- inside one transaction.
--
-- AND IT TELLS THE FAMILY. This is the part that makes it an edit path rather
-- than a back door: publishing is the moment a family was told something, so
-- changing it afterwards has to tell them again. The notice fires only when
-- the assignment is published AND the set actually changed — re-ticking a box
-- back to where it was is not news.

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

  -- Joined rather than inserted blind: an id that is not a performance of THIS
  -- production is dropped, so a stale calendar or a mistyped payload cannot
  -- put a child on somebody else's show.
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
             to_char(ce.starts_at at time zone 'America/New_York', 'FMDy FMMon FMDD'),
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

comment on function family_hub.portal_set_performance_split(uuid, uuid[]) is
  'Replace one published assignment''s performance split in a single transaction, and tell the family if it moved. Empty array = every performance.';

revoke all on function family_hub.portal_set_performance_split(uuid, uuid[]) from anon;
grant execute on function family_hub.portal_set_performance_split(uuid, uuid[]) to authenticated;
