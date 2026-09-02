-- A reply says who it is from.
--
-- Tony, 2 Sep 2026: "if whoever replies from it, make sure that they click
-- their name and, um, that it's clear it's coming from them."
--
-- Two things were in the way. The notification a family got was titled
-- "Reply from NOVA PA" — an organisation, not a person — so the thing that
-- actually lands on a parent's phone named nobody at all. And sender_name was
-- taken from profiles.display_name with no check on it, which for three of the
-- staff was their email address: a reply from the Director of Health & Safety
-- signed itself "katie@novapa.org". Those three rows are corrected, and this
-- stops the next one happening, because a display name is a thing people edit.
--
-- An email address is never a signature. If the name is unusable the reply
-- still sends — a family waiting on an answer must not be blocked by a profile
-- field — but it signs as NOVA PA Staff and the notification says so plainly,
-- rather than printing an address at a parent and calling it a name.

create or replace function family_hub.portal_reply_thread(p_thread uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path to 'family_hub', 'extensions'
as $function$
declare
  v_thread message_threads%rowtype;
  v_sender text;
  v_named boolean;
  v_now timestamptz := now();
  v_message_id uuid;
  v_parents int := 0;
begin
  -- coalesce, because `not null` is null: without it a caller with no JWT
  -- passes straight through the guard. (0023, learned by probing.)
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
  v_sender := btrim(coalesce(v_sender, ''));
  -- An address is not a name, and neither is an empty string.
  if v_sender = '' or v_sender like '%@%' then
    v_sender := null;
  end if;
  v_named := v_sender is not null;
  v_sender := coalesce(v_sender, 'NOVA PA Staff');

  insert into messages (thread_id, sender_user_id, sender_name, author_side, body)
  values (p_thread, auth.uid(), v_sender, 'staff', btrim(p_body))
  returning id into v_message_id;

  update message_threads
  set last_message_at = v_now,
      updated_at = v_now,
      status = case when status = 'closed' then 'open' else status end
  where id = p_thread;

  -- The name goes in the title, because the title is the whole of what a
  -- parent sees on a phone before they decide whether to open it.
  insert into notifications (user_id, type, title, body, url)
  select pr.id,
         'direct_message',
         case when v_named then 'Reply from ' || v_sender else 'Reply from NOVA PA' end,
         v_thread.subject,
         '/messages/' || p_thread
  from profiles pr
  where pr.role = 'parent' and pr.family_id = v_thread.family_id;
  get diagnostics v_parents = row_count;

  return jsonb_build_object(
    'message_id', v_message_id,
    'parents_notified', v_parents,
    'signed_as', v_sender
  );
end
$function$;

-- Supabase re-grants EXECUTE to anon on every CREATE OR REPLACE, and `revoke
-- from public` does not remove it. Re-revoke explicitly, every time. (0023,
-- 0029.)
revoke execute on function family_hub.portal_reply_thread(uuid, text) from anon;
grant execute on function family_hub.portal_reply_thread(uuid, text) to authenticated;
