-- 0080 — Being on the show is what lets you work it.
--
-- CJ, 10 Sep 2026: "when a staff member is assigned a production allow them to
-- utilize the audition features for that show."
--
-- The staff portal has believed this since 26 Aug: anybody assigned to a show
-- casts it, and a Director not on it does not. The database never learned. Its
-- audition and casting tables ask is_staffish() — do you have a family_hub
-- profile carrying a staff role — which is a row somebody makes by hand. That
-- is why the casting page carries a yellow box reading "your login is not
-- connected to the parent portal yet ... until CJ or Todd adds you there": a
-- new choreographer, assigned, contracted, standing in the room, could open the
-- audition grid, read it, and save nothing.
--
-- So the question becomes the one CJ asked: are you ON this show? Answered from
-- staff_portal.production_assignments through the portal login that owns the
-- staff row, and scoped to one production — which is NARROWER than the
-- season-wide access is_staffish() already grants. Every policy below only
-- gains an OR. Nobody loses anything.
--
-- The join needs a link the schema never had. The portal has been matching its
-- productions to this app's by a hand-kept dictionary of titles in TypeScript
-- (hub.ts, HUB_TITLES), and that dictionary is already wrong in two places: it
-- looks for a Little Mermaid KIDS show under a title that does not exist, and
-- has no entry at all for Mermaid Cast C. A rule that decides who may open a
-- child's rubric cannot live in a stale dictionary, so the link becomes a
-- column.
--
-- Safe to re-run.

/* ── the link ────────────────────────────────────────────────────────────── */

alter table family_hub.productions
  add column if not exists portal_production_id uuid
    references staff_portal.productions(id) on delete set null;

comment on column family_hub.productions.portal_production_id is
  'The staff portal production this show belongs to. One portal show can own '
  'several rows here - Frozen is three casts, Charlie is three casts and a '
  'tech crew. Set it and that show''s team can work its auditions (hub 0080).';

create index if not exists productions_portal_production_idx
  on family_hub.productions (portal_production_id);

/*
 * Titles, because that is the only thing the two sides share, and written out
 * so a human can read it against the season. Mermaid Cast C and the corrected
 * Mermaid KIDS title are here and were never in the dictionary.
 */
with pairs(portal_title, hub_title) as (
  values
    ('Frozen KIDS - Cast A (Ages 5-9)',              'Broadway Bound | Frozen, Kids'),
    ('Frozen JR. - Cast B (Ages 9-12)',              'Broadway Bound Junior | Frozen, Jr.'),
    ('Frozen JR. - Cast C (Ages 12-15)',             'Broadway Bound Teens | Frozen, Jr'),
    ('The Little Mermaid KIDS - Cast A (Ages 5-9)',  'Broadway Bound Kids | The Little Mermaid, Kids'),
    ('The Little Mermaid JR. - Cast B (Ages 9-12)',  'Broadway Bound Junior | The Little Mermaid, Jr.'),
    ('The Little Mermaid JR. - Cast C (Ages 12-15)', 'Broadway Bound Teens | The Little Mermaid, Jr.'),
    ('Sweeney Todd: School Edition',                 'Sweeney Todd - Teen Conservatory'),
    ('Hadestown: Teen Edition',                      'Hadestown - Teen Conservatory'),
    ('Mean Girls',                                   'Broadway Bound Teens | Mean Girls'),
    ('Mean Girls',                                   'Broadway Bound Teens | Mean Girls | Tech Crew'),
    ('Dear Evan Hansen',                             'Dear Evan Hansen — Triple Threat Teen Intensive'),
    ('Charlie and the Chocolate Factory Jr.',        'Charlie and the Chocolate Factory (5-9)'),
    ('Charlie and the Chocolate Factory Jr.',        'Charlie and the Chocolate Factory (9-12)'),
    ('Charlie and the Chocolate Factory Jr.',        'Charlie and the Chocolate Factory (12-15)'),
    ('Charlie and the Chocolate Factory Jr.',        'Charlie and the Chocolate Factory (tech)'),
    ('How to Train Your Dragon Jr.',                 'How to Train Your Dragon (5-9)'),
    ('How to Train Your Dragon Jr.',                 'How to Train Your Dragon (9-12)'),
    ('How to Train Your Dragon Jr.',                 'How to Train Your Dragon (12-15)'),
    ('How to Train Your Dragon Jr.',                 'How to Train Your Dragon (tech)'),
    ('Trolls Jr.',                                   'Trolls, Jr. (5-9)'),
    ('Trolls Jr.',                                   'Trolls, Jr. (9-12)'),
    ('Trolls Jr.',                                   'Trolls, Jr. (12-15)'),
    ('Trolls Jr.',                                   'Trolls, Jr. (tech)')
)
update family_hub.productions fp
   set portal_production_id = sp.id
  from pairs
  join staff_portal.productions sp on sp.title = pairs.portal_title
 where fp.title = pairs.hub_title
   and fp.portal_production_id is distinct from sp.id;

/* ── who is on the show ──────────────────────────────────────────────────── */

/*
 * Every show in this app the caller is assigned to over in the portal.
 *
 * SECURITY DEFINER because a staff member has no business reading the whole
 * assignment table: this answers one question about themselves and nothing
 * else. is_not_needed is the portal's word for a chair this show decided not to
 * fill, and an inactive portal login is a person who has left.
 */
create or replace function family_hub.my_worked_productions()
returns uuid[]
language sql
stable
security definer
set search_path = family_hub, staff_portal, extensions
as $$
  select coalesce(array_agg(distinct fp.id), '{}'::uuid[])
    from family_hub.productions fp
    join staff_portal.production_assignments pa
      on pa.production_id = fp.portal_production_id
    join staff_portal.portal_users pu
      on pu.staff_id = pa.staff_id
   where pu.auth_user_id = auth.uid()
     and coalesce(pu.is_active, true)
     and coalesce(pa.is_not_needed, false) = false
$$;

/** Am I on this show? The question every policy below asks. */
create or replace function family_hub.works_production(p_production uuid)
returns boolean
language sql
stable
security definer
set search_path = family_hub, extensions
as $$
  select p_production = any (family_hub.my_worked_productions())
$$;

grant execute on function family_hub.my_worked_productions() to authenticated;
grant execute on function family_hub.works_production(uuid) to authenticated;

/* ── the audition table itself ───────────────────────────────────────────── */

-- The rubrics: the feature CJ named.
drop policy if exists evaluations_staff on family_hub.audition_evaluations;
create policy evaluations_staff on family_hub.audition_evaluations
  for all
  using (family_hub.is_staffish() or family_hub.works_production(production_id));

-- What the family wrote. Read only — staff never edit an audition form.
drop policy if exists audition_profiles_read on family_hub.audition_profiles;
create policy audition_profiles_read on family_hub.audition_profiles
  for select
  using (
    family_hub.is_staffish()
    or family_hub.works_production(production_id)
    or exists (
      select 1 from family_hub.students s
       where s.id = audition_profiles.student_id
         and s.family_id = family_hub.auth_family_id()
    )
  );

/* ── and the board the grid feeds ────────────────────────────────────────── */

drop policy if exists boards_staff on family_hub.casting_boards;
create policy boards_staff on family_hub.casting_boards
  for all
  using (family_hub.is_staffish() or family_hub.works_production(production_id));

drop policy if exists casting_write_staff on family_hub.casting_assignments;
create policy casting_write_staff on family_hub.casting_assignments
  for all
  using (family_hub.is_staffish() or family_hub.works_production(production_id));

drop policy if exists casting_read on family_hub.casting_assignments;
create policy casting_read on family_hub.casting_assignments
  for select
  using (
    family_hub.is_staffish()
    or family_hub.works_production(production_id)
    or (
      published_at is not null
      and exists (
        select 1 from family_hub.students s
         where s.id = casting_assignments.student_id
           and s.family_id = family_hub.auth_family_id()
      )
    )
  );

drop policy if exists show_roles_write on family_hub.show_roles;
create policy show_roles_write on family_hub.show_roles
  for all
  using (family_hub.is_staffish() or family_hub.works_production(production_id));

/* ── and the people on it ────────────────────────────────────────────────── */

/*
 * Is this child in one of my companies?
 *
 * A function, and SECURITY DEFINER, for a reason that only shows up at query
 * time: the policy on students would otherwise read enrollments, whose own
 * policy reads students, and Postgres answers "infinite recursion detected in
 * policy for relation students" — which it did, on the first test of this
 * migration. Reading enrollments as the owner breaks the loop.
 */
create or replace function family_hub.works_student(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = family_hub, extensions
as $$
  select exists (
    select 1
      from family_hub.enrollments en
     where en.student_id = p_student
       and en.production_id = any (family_hub.my_worked_productions())
  )
$$;

grant execute on function family_hub.works_student(uuid) to authenticated;

/*
 * A cast list with no names is not a cast list. This is the narrow part: not
 * every student, only the ones enrolled in a show you are on — where
 * is_staffish() hands over all 944 of them.
 */
drop policy if exists students_select on family_hub.students;
create policy students_select on family_hub.students
  for select
  using (
    family_id = family_hub.auth_family_id()
    or family_hub.is_staffish()
    or family_hub.works_student(id)
  );

drop policy if exists enrollments_read on family_hub.enrollments;
create policy enrollments_read on family_hub.enrollments
  for select
  using (
    family_hub.is_admin()
    or exists (
      select 1 from family_hub.students s
       where s.id = enrollments.student_id
         and s.family_id = family_hub.auth_family_id()
    )
    or enrollments.production_id = any (family_hub.my_worked_productions())
    or (
      family_hub.auth_role() = 'staff'
      and (
        exists (
          select 1 from family_hub.classes c
           where c.id = enrollments.class_id
             and family_hub.staff_has_program(c.program_id)
        )
        or exists (
          select 1 from family_hub.productions p
           where p.id = enrollments.production_id
             and family_hub.staff_has_program(p.program_id)
        )
      )
    )
  );

create index if not exists enrollments_student_production_idx
  on family_hub.enrollments (student_id, production_id);

/* ── submitting the cast ─────────────────────────────────────────────────── */

/*
 * The one gate RLS cannot reach: this function is SECURITY DEFINER, so it
 * checks for itself. Reproduced from hub 0022 with a single line changed — the
 * question at the top — and nothing else touched.
 */
create or replace function family_hub.portal_submit_casting(p_production uuid)
returns jsonb
language plpgsql
security definer
set search_path = family_hub, extensions
as $$
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
  -- hub 0080: on the show, or staff over all of them.
  if not (coalesce(is_staffish(), false) or works_production(p_production)) then
    raise exception 'Casting for this show can only be submitted by somebody on it';
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
      select (je ->> 'roleId')::uuid    as role_id,
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
$$;

notify pgrst, 'reload schema';
