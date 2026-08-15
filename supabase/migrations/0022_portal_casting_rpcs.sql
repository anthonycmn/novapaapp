-- 0022 — the casting tools move into the staff portal (Tony, 2026-08-15:
-- "build it so that it lives in the staff portal and communicates with the
-- student/parent portal").
--
-- The portal talks to these tables over PostgREST with the signed-in user's
-- own token, so ordinary board edits ride the existing is_staffish() RLS.
-- Two steps cannot: submitting casting and publishing understudies each write
-- assignments + confirmations + notifications for OTHER users in one breath,
-- and notifications has (deliberately) no INSERT policy. So those two steps
-- become SECURITY DEFINER functions — which also makes them transactions,
-- something the app's own submit loop never had.
--
-- The semantics mirror src/lib/api/supabase/provider.ts submitCasting /
-- publishUnderstudies EXACTLY (same gate, same cast_group rule, same
-- "(Understudy)" suffix, same notification wording, one shared timestamp),
-- so a show cast from the portal is indistinguishable from one cast in the
-- app. The casting_published_trigger appends show_history on its own — these
-- functions must never write it.

create or replace function family_hub.portal_submit_casting(p_production uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'family_hub', 'extensions'
as $$
declare
  v_board casting_boards%rowtype;
  v_title text;
  v_missing text[];
  v_now timestamptz := now();
  e record;
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

  -- The app's hard gate: every enrolled student holds a role before anything
  -- is published. A show where three children hear nothing is worse than a
  -- show published a day later.
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
    select (je ->> 'roleId')::uuid as role_id,
           (je ->> 'studentId')::uuid as student_id
    from jsonb_array_elements(v_board.entries) je
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

    -- This family, this child, this role. Never a cast list.
    insert into notifications (user_id, type, title, body, url)
    select pr.id, 'casting_released',
           'Casting for ' || coalesce(v_title, 'the show') || ' 🎉',
           coalesce(nullif(v_student.preferred_name, ''), v_student.first_name)
             || ' will be: ' || v_role.name
             || '. Tap to confirm the name for the playbill.',
           '/casting'
    from profiles pr
    where pr.role = 'parent' and pr.family_id = v_student.family_id;
    get diagnostics v_parents = row_count;
    if v_parents > 0 then v_families := v_families + 1; end if;

    v_count := v_count + 1;
  end loop;

  update casting_boards
  set status = 'submitted', submitted_at = v_now, updated_at = v_now
  where production_id = p_production;

  return jsonb_build_object('assignments', v_count, 'families', v_families);
end
$$;

create or replace function family_hub.portal_publish_understudies(p_production uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'family_hub', 'extensions'
as $$
declare
  v_board casting_boards%rowtype;
  v_title text;
  v_now timestamptz := now();
  e record;
  v_role show_roles%rowtype;
  v_student students%rowtype;
  v_assignment_id uuid;
  v_count int := 0;
  v_families int := 0;
  v_parents int;
begin
  if not coalesce(is_staffish(), false) then
    raise exception 'Understudies can only be published by staff';
  end if;

  select * into v_board from casting_boards
  where production_id = p_production for update;
  if not found or v_board.status <> 'submitted' then
    raise exception 'Cast the show first — understudies come after every role is filled';
  end if;
  if v_board.understudies_published_at is not null then
    raise exception 'Understudies have already been published';
  end if;

  select title into v_title from productions where id = p_production;

  for e in
    select (je ->> 'roleId')::uuid as role_id,
           (je ->> 'studentId')::uuid as student_id
    from jsonb_array_elements(v_board.understudy_entries) je
  loop
    select * into v_role from show_roles where id = e.role_id;
    if not found then continue; end if;
    select * into v_student from students where id = e.student_id;
    if not found then continue; end if;

    -- The "(Understudy)" suffix is load-bearing: the app parses it back out
    -- of character_name. Preserve the exact format.
    insert into casting_assignments
      (production_id, student_id, character_name, is_understudy, published_at)
    values
      (p_production, e.student_id, v_role.name || ' (Understudy)', true, v_now)
    returning id into v_assignment_id;

    insert into casting_confirmations
      (assignment_id, student_id, family_id, last_reminded_at, reminder_count)
    values (v_assignment_id, e.student_id, v_student.family_id, v_now, 0);

    insert into notifications (user_id, type, title, body, url)
    select pr.id, 'casting_released',
           'Understudy casting for ' || coalesce(v_title, 'the show') || ' ⭐',
           coalesce(nullif(v_student.preferred_name, ''), v_student.first_name)
             || ' will understudy: ' || v_role.name
             || '. Tap to confirm the name for the playbill.',
           '/casting'
    from profiles pr
    where pr.role = 'parent' and pr.family_id = v_student.family_id;
    get diagnostics v_parents = row_count;
    if v_parents > 0 then v_families := v_families + 1; end if;

    v_count := v_count + 1;
  end loop;

  update casting_boards
  set understudies_published_at = v_now, updated_at = v_now
  where production_id = p_production;

  return jsonb_build_object('assignments', v_count, 'families', v_families);
end
$$;

-- Callable only by a signed-in user; both functions re-assert is_staffish()
-- internally because SECURITY DEFINER bypasses RLS.
revoke all on function family_hub.portal_submit_casting(uuid) from public;
revoke all on function family_hub.portal_publish_understudies(uuid) from public;
grant execute on function family_hub.portal_submit_casting(uuid) to authenticated;
grant execute on function family_hub.portal_publish_understudies(uuid) to authenticated;
