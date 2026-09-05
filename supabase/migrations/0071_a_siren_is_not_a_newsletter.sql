-- 0071 — A siren is not a newsletter.
--
-- Two notification types were carrying freight that wasn't theirs (Sep 5
-- 2026 audit):
--
--   * 'broadcast' is the dashboard's red emergency band — "a closure, a
--     venue move, a canceled night" — excluded from the mute toggles on
--     purpose. But every bulk-email echo, answered question, order update
--     and staff-profile notice was typed broadcast, so a newsletter lit an
--     un-mutable siren on eight hundred dashboards. Those move to
--     'announcement' (mutable, "General notices"), and answered questions
--     to 'direct_message', whose toggle already reads "Replies — answers
--     to your questions". 'broadcast' is left holding only what the band
--     was built for.
--
--   * 'form_due' is labelled "Forms — health forms due or expiring" in the
--     settings, but its only producer was the pick-up decision — so muting
--     paperwork muted a safety decision. Pick-up gets its own type,
--     'pickup_decision', and form_due is freed for the actual health-form
--     reminder job that ships alongside this migration.
--
-- The app side of both changes is in the same day's deploy (provider.ts,
-- notifications/settings). This migration retypes the RPC the staff portal
-- calls, and the rows already written, so history stops sirening too.
--
-- Safe to re-run.

create or replace function family_hub.portal_decide_pickup(p_request uuid, p_status text, p_note text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'family_hub', 'extensions'
as $function$
declare
  v_req pickup_requests%rowtype;
  v_first text;
  v_decider text;
  v_now timestamptz := now();
  v_parents int := 0;
begin
  if not coalesce(is_staffish(), false) then
    raise exception 'Pick-up requests can only be decided by staff';
  end if;
  if p_status not in ('approved', 'denied') then
    raise exception 'A decision is approved or denied, nothing else';
  end if;

  select * into v_req from pickup_requests where id = p_request for update;
  if not found then
    raise exception 'No such pick-up request';
  end if;

  select display_name into v_decider from profiles where id = auth.uid();

  update pickup_requests
  set status = p_status,
      decision_note = p_note,
      decided_by_name = coalesce(nullif(v_decider, ''), 'Staff'),
      decided_at = v_now
  where id = p_request;

  select first_name into v_first from students where id = v_req.student_id;

  -- 'pickup_decision', not 'form_due' — the whole point of this migration.
  insert into notifications (user_id, type, title, body, url)
  select pr.id, 'pickup_decision',
         'Pick-up request ' || p_status,
         coalesce(v_first, 'Your student') || ': '
           || coalesce(p_note, 'See details in the app.'),
         '/family/pickup'
  from profiles pr
  where pr.role = 'parent' and pr.family_id = v_req.family_id;
  get diagnostics v_parents = row_count;

  return jsonb_build_object('status', p_status, 'parents_notified', v_parents);
end
$function$;

-- The 0023/0024 rule: re-revoke after every create-or-replace, because
-- default privileges re-grant EXECUTE to anon+authenticated each time.
revoke execute on function family_hub.portal_decide_pickup(uuid, text, text) from public;
revoke execute on function family_hub.portal_decide_pickup(uuid, text, text) from anon;
grant execute on function family_hub.portal_decide_pickup(uuid, text, text) to authenticated;

-- History stops sirening: retype the rows already written, matched by the
-- exact shapes their producers used.
update family_hub.notifications set type = 'pickup_decision'
 where type = 'form_due' and url = '/family/pickup';
update family_hub.notifications set type = 'direct_message'
 where type = 'broadcast' and url = '/feed' and title = 'Your question was answered';
update family_hub.notifications set type = 'announcement'
 where type = 'broadcast'
   and (url = '/notifications'
        or url like '/store/orders%'
        or url = '/admin/staff-profiles'
        or url = '/staff/edit'
        or (url like '/staff/%' and title = 'Your profile is live')
        or title = 'Playbill name correction');
