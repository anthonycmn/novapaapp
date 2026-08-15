-- 0024 — pick-up / drop-off decisions from the staff portal.
--
-- The portal reads health_forms and pickup_requests directly (staffish RLS
-- already grants both), but DECIDING a request also notifies the family's
-- parents, and notifications has (deliberately) no INSERT policy. Same shape
-- as 0022's casting RPCs: one SECURITY DEFINER function, one transaction.
--
-- Mirrors provider.ts decidePickupRequest exactly: status/note/decided_by/
-- decided_at on the row, then one notification per parent profile of THAT
-- family — type 'form_due', title "Pick-up request approved|denied", body
-- "<first name>: <note or fallback>", url '/family/pickup'.
--
-- Hardening rules learned in 0023, applied from birth here:
--   * guard with coalesce(is_staffish(), false) — a bare `if not is_staffish()`
--     never fires without a JWT (null is not true, and `not null` is null);
--   * revoke from anon EXPLICITLY (Supabase default privileges grant EXECUTE
--     to anon+authenticated on every new function; revoke-from-public alone
--     leaves both), and re-revoke after any create-or-replace.

create or replace function family_hub.portal_decide_pickup(
  p_request uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'family_hub', 'extensions'
as $$
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

  insert into notifications (user_id, type, title, body, url)
  select pr.id, 'form_due',
         'Pick-up request ' || p_status,
         coalesce(v_first, 'Your student') || ': '
           || coalesce(p_note, 'See details in the app.'),
         '/family/pickup'
  from profiles pr
  where pr.role = 'parent' and pr.family_id = v_req.family_id;
  get diagnostics v_parents = row_count;

  return jsonb_build_object('status', p_status, 'parents_notified', v_parents);
end
$$;

revoke all on function family_hub.portal_decide_pickup(uuid, text, text) from public;
revoke all on function family_hub.portal_decide_pickup(uuid, text, text) from anon;
grant execute on function family_hub.portal_decide_pickup(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
