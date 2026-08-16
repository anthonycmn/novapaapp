-- 0026 — staff reply to a family message thread, from the portal.
-- (Applied to novapa as family_hub_0026_portal_reply_thread; the applied
-- migration is canonical, this file is the repo record.)
--
-- Mirrors provider.ts replyToThread for the staff side: insert the message,
-- bump last_message_at (reopening a closed thread — the conversation clearly
-- isn't done), and notify the family's parents (type direct_message, title
-- 'Reply from NOVA PA', body = thread subject, url /messages/<id>). One
-- transaction, which the app's own three-step version never was.
-- Hardening per 0023: coalesce guard, anon revoked explicitly (re-revoke
-- after any create-or-replace).

create or replace function family_hub.portal_reply_thread(p_thread uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path to 'family_hub', 'extensions'
as $$
declare
  v_thread message_threads%rowtype;
  v_sender text;
  v_now timestamptz := now();
  v_message_id uuid;
  v_parents int := 0;
begin
  if not coalesce(is_staffish(), false) then
    raise exception 'Only staff reply from the portal';
  end if;
  if p_body is null or btrim(p_body) = '' then
    raise exception 'Write a message first';
  end if;

  select * into v_thread from message_threads where id = p_thread for update;
  if not found then
    raise exception 'Thread not found';
  end if;

  select display_name into v_sender from profiles where id = auth.uid();

  insert into messages (thread_id, sender_user_id, sender_name, author_side, body)
  values (p_thread, auth.uid(), coalesce(nullif(v_sender, ''), 'NOVA PA Staff'), 'staff', btrim(p_body))
  returning id into v_message_id;

  update message_threads
  set last_message_at = v_now,
      updated_at = v_now,
      status = case when status = 'closed' then 'open' else status end
  where id = p_thread;

  insert into notifications (user_id, type, title, body, url)
  select pr.id, 'direct_message', 'Reply from NOVA PA', v_thread.subject,
         '/messages/' || p_thread
  from profiles pr
  where pr.role = 'parent' and pr.family_id = v_thread.family_id;
  get diagnostics v_parents = row_count;

  return jsonb_build_object('message_id', v_message_id, 'parents_notified', v_parents);
end
$$;

revoke all on function family_hub.portal_reply_thread(uuid, text) from public;
revoke all on function family_hub.portal_reply_thread(uuid, text) from anon;
grant execute on function family_hub.portal_reply_thread(uuid, text) to authenticated;

notify pgrst, 'reload schema';
