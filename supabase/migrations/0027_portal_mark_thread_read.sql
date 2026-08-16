-- 0027 — mark a family thread read from the portal.
-- (Applied to novapa as family_hub_0027_portal_mark_thread_read.)
--
-- messages has no UPDATE policy (the app marks reads with the service key
-- server-side), so the portal marks a thread read through this narrow
-- definer function instead of a broad staff-can-edit-messages policy that
-- would let anyone rewrite a family's words. It can set read_at on the
-- family's unread messages and nothing else.

create or replace function family_hub.portal_mark_thread_read(p_thread uuid)
returns void
language plpgsql
security definer
set search_path to 'family_hub', 'extensions'
as $$
begin
  if not coalesce(is_staffish(), false) then
    raise exception 'Staff only';
  end if;
  update messages
  set read_at = now()
  where thread_id = p_thread and author_side = 'family' and read_at is null;
end
$$;

revoke all on function family_hub.portal_mark_thread_read(uuid) from public;
revoke all on function family_hub.portal_mark_thread_read(uuid) from anon;
grant execute on function family_hub.portal_mark_thread_read(uuid) to authenticated;

notify pgrst, 'reload schema';
