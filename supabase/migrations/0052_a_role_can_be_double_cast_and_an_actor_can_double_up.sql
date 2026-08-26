-- 0052 — two people can play one part, and one person can play two
--
-- CJ, 26 Aug 2026: "allow roles to be double cast and then when they are
-- assign performances - I want to do this for Sweeney Todd - also allow actors
-- to play multiple parts but I have to right click a name and hit add a 2nd
-- part."
--
-- Three separate things, and only one of them is a schema change.
--
-- 1. A ROLE HELD BY TWO PEOPLE was never a database rule. show_roles.capacity
--    has always been a nullable integer; the board pinned every named role to
--    1 on creation and the UI evicted the sitting holder. So double casting is
--    a capacity the Director now sets, not a column anybody has to add.
--
-- 2. AN ACTOR IN TWO PARTS was likewise only a UI rule — casting_assignments
--    has no unique key on (production, student), and portal_submit_casting
--    already writes one row per board entry. Two entries have always produced
--    two assignments; nothing here would let you make two.
--
-- 3. WHICH PERFORMANCES each of the two plays is genuinely new, and is the
--    only table this migration adds. It hangs off the ASSIGNMENT rather than
--    off (student, role) because that is the row a family confirms, the row
--    the playbill name lives on, and the row that disappears if casting is
--    redone — a split that outlived its own casting would be a lie.
--
-- NO ROWS MEANS EVERY PERFORMANCE. That is the important default and it is
-- deliberate: a singly-cast part carries no rows at all, and asking whether a
-- child is on tonight must not depend on somebody having remembered to tick
-- seven boxes. Only a shared part gets a split, and the UI only offers one
-- once a second name is on the role.

create table if not exists family_hub.casting_assignment_performances (
  assignment_id uuid not null
    references family_hub.casting_assignments(id) on delete cascade,
  event_id uuid not null
    references family_hub.calendar_events(id) on delete cascade,
  primary key (assignment_id, event_id)
);

comment on table family_hub.casting_assignment_performances is
  'Which performances one casting assignment plays. NO ROWS = all of them; only a double-cast part is ever split.';

create index if not exists casting_assignment_performances_event_idx
  on family_hub.casting_assignment_performances (event_id);

alter table family_hub.casting_assignment_performances enable row level security;

-- Mirrors casting_assignments exactly: staff see and write everything, a
-- parent sees their own child's and only once it is published. Written as a
-- join back to the parent row rather than restating the rule, so the two
-- cannot drift apart later.
drop policy if exists cap_read on family_hub.casting_assignment_performances;
create policy cap_read on family_hub.casting_assignment_performances
  for select using (
    family_hub.is_staffish()
    or exists (
      select 1
      from family_hub.casting_assignments a
      join family_hub.students s on s.id = a.student_id
      where a.id = casting_assignment_performances.assignment_id
        and a.published_at is not null
        and s.family_id = family_hub.auth_family_id()
    )
  );

drop policy if exists cap_write_staff on family_hub.casting_assignment_performances;
create policy cap_write_staff on family_hub.casting_assignment_performances
  for all using (family_hub.is_staffish());

revoke all on family_hub.casting_assignment_performances from anon;
grant select on family_hub.casting_assignment_performances to authenticated;
grant all on family_hub.casting_assignment_performances to service_role;

-- ---------------------------------------------------------------------------
-- portal_submit_casting, rewritten for a board where a student may appear
-- more than once.
--
-- Two changes, both forced by multi-part casting:
--
-- ONE NOTIFICATION PER CHILD, NOT PER PART. The old loop posted a
-- 'casting_released' notice inside the per-entry loop, so a child cast as
-- both Pirelli and an Ensemble Beggar would have sent their parents two
-- messages, each naming one part and each looking like it had overwritten the
-- other. Parts are now gathered per student and announced once: "Ada will be:
-- Pirelli and Beggar Woman."
--
-- ENTRIES ARE DEDUPED. The board is last-write-wins jsonb edited by several
-- people; a duplicated (role, student) pair would otherwise mint two
-- assignments, two confirmation rows and two rows in the playbill.
--
-- The 'every student holds a role' gate is unchanged and still counts a
-- student once however many parts they hold.
-- ---------------------------------------------------------------------------

create or replace function family_hub.portal_submit_casting(p_production uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'family_hub', 'extensions'
as $function$
declare
  v_board casting_boards%rowtype;
  v_title text;
  v_missing text[];
  v_now timestamptz := now();
  e record;
  r record;
  v_role show_roles%rowtype;
  v_student students%rowtype;
  v_assignment_id uuid;
  v_count int := 0;
  v_families int := 0;
  v_parents int;
begin
  if not coalesce(is_staffish(), false) then
    raise exception 'Casting can only be submitted by staff';
  end if;

  select * into v_board from casting_boards
  where production_id = p_production for update;
  if not found then
    raise exception 'No casting board for this production yet';
  end if;
  if v_board.status = 'submitted' then
    raise exception 'Casting has already been submitted';
  end if;

  select title into v_title from productions where id = p_production;

  select array_agg(coalesce(nullif(s.preferred_name, ''), s.first_name) || ' ' || s.last_name)
    into v_missing
  from enrollments en
  join students s on s.id = en.student_id
  where en.production_id = p_production
    and en.status = 'enrolled'
    and not exists (
      select 1 from jsonb_array_elements(v_board.entries) je
      where (je ->> 'studentId')::uuid = s.id
    );
  if v_missing is not null and array_length(v_missing, 1) > 0 then
    raise exception 'Every student must have a role before submitting. Still unassigned: %',
      array_to_string(v_missing, ', ');
  end if;

  for e in
    select distinct on (role_id, student_id) *
    from (
      select (je ->> 'roleId')::uuid   as role_id,
             (je ->> 'studentId')::uuid as student_id,
             je -> 'performanceIds'     as performance_ids
      from jsonb_array_elements(v_board.entries) je
    ) x
    order by role_id, student_id
  loop
    select * into v_role from show_roles where id = e.role_id;
    if not found then continue; end if;
    select * into v_student from students where id = e.student_id;
    if not found then continue; end if;

    insert into casting_assignments
      (production_id, student_id, character_name, cast_group, is_understudy, published_at)
    values
      (p_production, e.student_id, v_role.name,
       case when v_role.tier = 'ensemble' then v_role.name else null end,
       false, v_now)
    returning id into v_assignment_id;

    insert into casting_confirmations
      (assignment_id, student_id, family_id, last_reminded_at, reminder_count)
    values (v_assignment_id, e.student_id, v_student.family_id, v_now, 0);

    -- The split, when there is one. Filtered back against this production's
    -- own performances so a stale id left in the jsonb by an edited calendar
    -- is dropped rather than stored — and an entry that names none stays
    -- empty, which reads as "every performance".
    if jsonb_typeof(e.performance_ids) = 'array' then
      insert into casting_assignment_performances (assignment_id, event_id)
      select v_assignment_id, ce.id
      from jsonb_array_elements_text(e.performance_ids) p
      join calendar_events ce
        on ce.id = (p)::uuid
       and ce.production_id = p_production
       and ce.type = 'performance'
      on conflict do nothing;
    end if;

    v_count := v_count + 1;
  end loop;

  -- One notice per child, naming every part they hold.
  for r in
    select st.id as student_id,
           st.family_id,
           coalesce(nullif(st.preferred_name, ''), st.first_name) as known_as,
           string_agg(distinct sr.name, ' and ') as parts
    from jsonb_array_elements(v_board.entries) je
    join students st   on st.id = (je ->> 'studentId')::uuid
    join show_roles sr on sr.id = (je ->> 'roleId')::uuid
    group by st.id, st.family_id, st.first_name, st.preferred_name
  loop
    insert into notifications (user_id, type, title, body, url)
    select pr.id, 'casting_released',
           'Casting for ' || coalesce(v_title, 'the show') || ' 🎉',
           r.known_as || ' will be: ' || r.parts
             || '. Tap to confirm the name for the playbill.',
           '/casting'
    from profiles pr
    where pr.role = 'parent' and pr.family_id = r.family_id;
    get diagnostics v_parents = row_count;
    if v_parents > 0 then v_families := v_families + 1; end if;
  end loop;

  update casting_boards
  set status = 'submitted', submitted_at = v_now, updated_at = v_now
  where production_id = p_production;

  return jsonb_build_object('assignments', v_count, 'families', v_families);
end
$function$;

revoke all on function family_hub.portal_submit_casting(uuid) from anon;
grant execute on function family_hub.portal_submit_casting(uuid) to authenticated;
