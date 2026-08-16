-- 0028 — the casting nudge, portal-side and per-show.
-- (Applied to novapa as family_hub_0028_portal_nudge_confirmations.)
--
-- Mirrors the app's remindPendingCastingConfirmations: every confirmation of
-- this production with no family answer yet gets a reminder notification to
-- that family's parents ('Reminder: confirm the playbill name'), and the
-- confirmation's last_reminded_at/reminder_count advance. The app's 12-hour
-- courtesy gap (CONFIRMATION_REMINDER_MS) is kept: anyone reminded (or first
-- notified) within the last 12 hours is skipped, so a twitchy double-click
-- cannot double-ping a family.
-- Hardening per 0023: coalesce guard, anon revoked explicitly.

create or replace function family_hub.portal_nudge_confirmations(p_production uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'family_hub', 'extensions'
as $$
declare
  v_now timestamptz := now();
  e record;
  v_reminded int := 0;
  v_skipped_recent int := 0;
begin
  if not coalesce(is_staffish(), false) then
    raise exception 'Nudges can only be sent by staff';
  end if;

  for e in
    select c.id, c.student_id, c.family_id, c.last_reminded_at, c.reminder_count,
           a.character_name
    from casting_confirmations c
    join casting_assignments a on a.id = c.assignment_id
    where a.production_id = p_production
      and c.name_correct is null
  loop
    if e.last_reminded_at is not null and e.last_reminded_at > v_now - interval '12 hours' then
      v_skipped_recent := v_skipped_recent + 1;
      continue;
    end if;

    insert into notifications (user_id, type, title, body, url)
    select pr.id, 'casting_released',
           'Reminder: confirm the playbill name',
           coalesce(nullif(st.preferred_name, ''), st.first_name)
             || '''s role (' || e.character_name || ') is waiting on your confirmation.',
           '/casting'
    from students st, profiles pr
    where st.id = e.student_id
      and pr.role = 'parent' and pr.family_id = e.family_id;

    update casting_confirmations
    set last_reminded_at = v_now,
        reminder_count = coalesce(e.reminder_count, 0) + 1
    where id = e.id;

    v_reminded := v_reminded + 1;
  end loop;

  return jsonb_build_object('reminded', v_reminded, 'skipped_recent', v_skipped_recent);
end
$$;

revoke all on function family_hub.portal_nudge_confirmations(uuid) from public;
revoke all on function family_hub.portal_nudge_confirmations(uuid) from anon;
grant execute on function family_hub.portal_nudge_confirmations(uuid) to authenticated;

notify pgrst, 'reload schema';
