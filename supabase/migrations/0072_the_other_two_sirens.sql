-- 0072 — The other two sirens.
--
-- 0071 renamed the freight ('broadcast' is the un-mutable red emergency
-- band; everything routine moved to 'announcement') and retyped the RPC it
-- knew about — but two more live producers still insert type 'broadcast':
--
--   * portal_set_order_status (hub 0031)          — "your buttons are ready"
--   * portal_review_staff_profile (staff 0167)    — "your profile is live"
--
-- Both are called from the STAFF portal, so the day after 0071 the first
-- order marked "ready" would have lit the emergency band again — and 0071's
-- one-off history UPDATE would have needed re-running forever. Same bodies
-- as live, one word changed in each, plus a catch-up retype for any rows
-- written between 0071 and this.
--
-- Safe to re-run.

create or replace function family_hub.portal_set_order_status(p_order uuid, p_status text, p_note text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'family_hub', 'extensions'
as $function$
declare
  v_order button_orders%rowtype;
  v_now timestamptz := now();
  v_parents int := 0;
begin
  if not coalesce(is_staffish(), false) then
    raise exception 'Order statuses are staff business';
  end if;
  if p_status not in ('new', 'in_production', 'ready', 'delivered') then
    raise exception 'Unknown order status %', p_status;
  end if;

  select * into v_order from button_orders where id = p_order for update;
  if not found then
    raise exception 'No such order';
  end if;

  update button_orders
  set status = p_status,
      status_updated_at = v_now,
      admin_note = coalesce(p_note, admin_note)
  where id = p_order;

  if p_status in ('ready', 'delivered') then
    -- 'announcement', not 'broadcast' — an order update is not a closure.
    insert into notifications (user_id, type, title, body, url)
    select pr.id, 'announcement',
           case when p_status = 'ready'
                then 'Order ' || v_order.reference || ' is ready'
                else 'Order ' || v_order.reference || ' delivered' end,
           case when p_status = 'ready'
                then 'Your spirit buttons are ready to pick up at the front desk.'
                else 'Your spirit buttons have been handed off. Enjoy!' end,
           '/store/orders'
    from profiles pr
    where pr.role = 'parent' and pr.family_id = v_order.family_id;
    get diagnostics v_parents = row_count;
  end if;

  return jsonb_build_object('status', p_status, 'parents_notified', v_parents);
end
$function$;

create or replace function family_hub.portal_review_staff_profile(p_staff uuid, p_approve boolean, p_reason text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'family_hub', 'extensions'
as $function$
declare
  v_row     staff_profiles%rowtype;
  v_pending jsonb;
  v_owner   uuid;
begin
  if not coalesce(staff_portal.is_chief(), false) then
    raise exception 'Only a Super Admin can approve or reject a bio.'
      using errcode = '42501';
  end if;

  select * into v_row from staff_profiles where id = p_staff for update;
  if not found then
    raise exception 'Staff profile not found';
  end if;
  v_pending := v_row.pending_changes;
  if v_pending is null then
    raise exception 'Nothing is waiting for review on this profile';
  end if;

  if p_approve then
    update staff_profiles
    set bio = case when v_pending ? 'bio' then v_pending->>'bio' else bio end,
        title = case when v_pending ? 'title' then v_pending->>'title' else title end,
        credits = case when v_pending ? 'credits' then v_pending->>'credits' else credits end,
        photo_url = case when v_pending ? 'photoUrl' then v_pending->>'photoUrl' else photo_url end,
        specialties = case
          when v_pending ? 'specialties'
          then coalesce(
            (select array_agg(x) from jsonb_array_elements_text(v_pending->'specialties') x),
            '{}'::text[]
          )
          else specialties
        end,
        pending_changes = null,
        change_rejection = null,
        is_published = true
    where id = p_staff;
  else
    if p_reason is null or btrim(p_reason) = '' then
      raise exception 'A rejection needs a reason the person can act on';
    end if;
    update staff_profiles
    set pending_changes = null,
        change_rejection = btrim(p_reason)
    where id = p_staff;
  end if;

  select id into v_owner from profiles where staff_id = p_staff;
  if v_owner is not null then
    -- 'announcement', not 'broadcast' — a bio verdict is not a venue move.
    insert into notifications (user_id, type, title, body, url)
    values (
      v_owner, 'announcement',
      case when p_approve then 'Your profile is live' else 'Profile changes need another pass' end,
      case when p_approve
           then 'An administrator approved your profile changes.'
           else btrim(p_reason) end,
      case when p_approve then '/staff/' || p_staff else '/staff/edit' end
    );
  end if;

  return jsonb_build_object('approved', p_approve);
end
$function$;

-- The 0023/0024 rule: re-revoke after every create-or-replace, because
-- default privileges re-grant EXECUTE to anon+authenticated each time.
revoke execute on function family_hub.portal_set_order_status(uuid, text, text) from public;
revoke execute on function family_hub.portal_set_order_status(uuid, text, text) from anon;
grant execute on function family_hub.portal_set_order_status(uuid, text, text) to authenticated;
revoke execute on function family_hub.portal_review_staff_profile(uuid, boolean, text) from public;
revoke execute on function family_hub.portal_review_staff_profile(uuid, boolean, text) from anon;
grant execute on function family_hub.portal_review_staff_profile(uuid, boolean, text) to authenticated;

-- Anything the two producers wrote between 0071 and now, retyped the same
-- way 0071 retyped their history.
update family_hub.notifications set type = 'announcement'
 where type = 'broadcast'
   and (url like '/store/orders%'
        or url = '/staff/edit'
        or (url like '/staff/%' and title in ('Your profile is live', 'Profile changes need another pass')));
