-- 0025 — seal callback notes + staff-initiated feedback release.
-- (Applied to novapa as family_hub_0025_feedback_release_and_callback_note_seal;
-- the applied migration is canonical, this file is the repo record.)
--
-- 1. THE SEAL. The old evaluations_family_released policy let a
--    feedback-released family SELECT whole audition_evaluations rows over
--    PostgREST — including callback_notes, which the app only strips in its
--    own server code. That policy is gone. Families now have exactly one read
--    path: family_evaluation_view, a definer view that (a) scopes to the
--    caller's own family via auth_family_id() and (b) simply does not contain
--    the callback_notes column. The app itself reads server-side with the
--    service key (src/lib/api/supabase/client.ts), so it never needed the
--    policy; nothing in the app changes.
--
-- 2. THE RELEASE. portal_release_feedback(p_production): the staff-side
--    "release feedback" push Tony asked for. Flips feedback_requested_at on
--    every confirmation of the show whose student HAS at least one scored
--    rubric (a family told "feedback is ready" must find feedback), and
--    notifies those parents (type casting_released, url /casting). Students
--    with no rubric are left untouched — their families can still self-request
--    in the app exactly as before. Idempotent: already-released students are
--    skipped, so re-clicking after scoring stragglers releases just them.
--
-- Hardening per 0023: coalesce() on the staffish guard, and revoke from anon
-- EXPLICITLY (defaults re-grant on every create-or-replace — re-revoke if this
-- function is ever replaced).

drop policy if exists evaluations_family_released on family_hub.audition_evaluations;

drop view if exists family_hub.family_evaluation_view;
create view family_hub.family_evaluation_view as
select e.id, e.student_id, e.production_id, e.discipline, e.evaluator_name,
       e.scores, e.notes, e.growth_notes, e.created_at
from family_hub.audition_evaluations e
join family_hub.students s on s.id = e.student_id
where s.family_id = family_hub.auth_family_id()
  and exists (
    select 1
    from family_hub.casting_confirmations c
    join family_hub.casting_assignments a on a.id = c.assignment_id
    where c.student_id = e.student_id
      and a.production_id = e.production_id
      and c.feedback_requested_at is not null
  );

revoke all on family_hub.family_evaluation_view from public;
revoke all on family_hub.family_evaluation_view from anon;
grant select on family_hub.family_evaluation_view to authenticated;

create or replace function family_hub.portal_release_feedback(p_production uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'family_hub', 'extensions'
as $$
declare
  v_title text;
  v_now timestamptz := now();
  e record;
  v_students int := 0;
  v_skipped int := 0;
  v_parents int;
  v_families int := 0;
begin
  if not coalesce(is_staffish(), false) then
    raise exception 'Feedback can only be released by staff';
  end if;

  select title into v_title from productions where id = p_production;

  select count(*) into v_skipped
  from (
    select distinct c.student_id
    from casting_confirmations c
    join casting_assignments a on a.id = c.assignment_id
    where a.production_id = p_production
      and c.feedback_requested_at is null
      and not exists (
        select 1 from audition_evaluations ev
        where ev.student_id = c.student_id and ev.production_id = p_production
      )
  ) x;

  for e in
    select distinct c.student_id, c.family_id
    from casting_confirmations c
    join casting_assignments a on a.id = c.assignment_id
    where a.production_id = p_production
      and c.feedback_requested_at is null
      and exists (
        select 1 from audition_evaluations ev
        where ev.student_id = c.student_id and ev.production_id = p_production
      )
  loop
    update casting_confirmations c
    set feedback_requested_at = v_now
    from casting_assignments a
    where a.id = c.assignment_id
      and a.production_id = p_production
      and c.student_id = e.student_id
      and c.feedback_requested_at is null;

    insert into notifications (user_id, type, title, body, url)
    select pr.id, 'casting_released',
           'Audition feedback for ' || coalesce(v_title, 'the show') || ' 🎭',
           coalesce(nullif(st.preferred_name, ''), st.first_name)
             || '''s audition feedback from the team is ready. Tap to read it.',
           '/casting'
    from students st, profiles pr
    where st.id = e.student_id
      and pr.role = 'parent' and pr.family_id = e.family_id;
    get diagnostics v_parents = row_count;
    if v_parents > 0 then v_families := v_families + 1; end if;

    v_students := v_students + 1;
  end loop;

  return jsonb_build_object(
    'students', v_students, 'families', v_families, 'unscored_skipped', v_skipped
  );
end
$$;

revoke all on function family_hub.portal_release_feedback(uuid) from public;
revoke all on function family_hub.portal_release_feedback(uuid) from anon;
grant execute on function family_hub.portal_release_feedback(uuid) to authenticated;

notify pgrst, 'reload schema';
