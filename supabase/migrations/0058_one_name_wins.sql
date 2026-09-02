-- One name wins.
--
-- Tony, 2 Sep 2026: "make one defer to the other."
--
-- A staff member's name was written down in three places. The portal's reply
-- box promised "Reply as {staff_portal.staff.full_name}". The reply itself
-- signed with {family_hub.profiles.display_name}. A third copy sat in
-- family_hub.staff_profiles.full_name. Nothing held them together, so they
-- came apart: the box promised Jennifer Travis and the family got a reply from
-- Jen Travis, promised Jason Jones and delivered Jason, and spelled Colton's
-- surname two different ways -- Sorensen in the staff record, Sorenson in the
-- profile. 0057 fixed three of those rows by hand, which is not a fix; it is
-- the same bug waiting on the next edit.
--
-- staff_portal.staff is the record. It is the table a person exists in from
-- the day they are hired, it is what the portal session already reads, and
-- when the three copies disagreed it was the one that was right -- Tony
-- confirmed Sorensen against it. profiles.display_name is a field people edit
-- about themselves, which is how three of them came to hold an email address.
--
-- So the signature is defined ONCE, here, and everything defers to it:
-- portal_reply_thread signs with it, and the portal's reply box asks for it
-- instead of guessing. The promise and the signature are now the same
-- expression, and cannot drift apart, because there is only one of them.
--
-- full_name, not preferred_name, deliberately. Preferred names are what the
-- building says out loud and they are not signatures: Tony's is "CJ", and two
-- different directors both answer to "Katie". A parent reading a reply needs
-- the name that identifies one person.

-- The rule. Returns null -- not a fallback -- when there is no usable name, so
-- callers can tell "signed by a person" from "signed by the organization".
create or replace function family_hub.reply_signature(p_user uuid)
returns text
language sql
stable
security definer
set search_path to 'family_hub', 'extensions'
as $function$
  -- An address is never a signature -- that is what stopped a reply from the
  -- Director of Health & Safety signing itself "katie@novapa.org" (0057). Each
  -- candidate is guarded on its own: an address sitting in the staff record has
  -- to fall through to the next name, and guarding in the WHERE instead would
  -- throw the whole row away and sign as the organization.
  select coalesce(
           -- The record first.
           case when btrim(coalesce(s.full_name, '')) <> ''
                 and s.full_name not like '%@%'
                then btrim(s.full_name) end,
           -- Then whatever they call themselves, so somebody hired today,
           -- before the chain below is linked, still signs as a person.
           case when btrim(coalesce(p.display_name, '')) <> ''
                 and p.display_name not like '%@%'
                then btrim(p.display_name) end
         )
  -- profiles.staff_id names a hub staff_profile, which carries the
  -- portal_staff_id. staff_id has no foreign key, so this is a join by
  -- convention: left joins throughout, because a broken link has to degrade to
  -- the next name, never to an error.
  from family_hub.profiles p
  left join family_hub.staff_profiles sp on sp.id = p.staff_id
  left join staff_portal.staff s on s.id = sp.portal_staff_id
  where p.id = p_user;
$function$;

-- Internal. Only the two definer functions below have any business calling it.
revoke execute on function family_hub.reply_signature(uuid) from public, anon, authenticated;

-- What the reply box asks for. Same rule, already coalesced, because the box
-- is showing a person a sentence and not making a decision.
create or replace function family_hub.my_reply_signature()
returns text
language plpgsql
stable
security definer
set search_path to 'family_hub', 'extensions'
as $function$
begin
  -- coalesce, because `not null` is null: without it a caller with no JWT
  -- passes straight through the guard. (0023, learned by probing.)
  if not coalesce(is_staffish(), false) then
    return null;
  end if;
  return coalesce(reply_signature(auth.uid()), 'NOVA PA Staff');
end
$function$;

-- "revoke from anon" alone is not enough on a NEW function: it is created with
-- EXECUTE already granted to PUBLIC, which anon inherits, so anon keeps the
-- privilege until PUBLIC loses it. (Checked with has_function_privilege, which
-- is the only way to see this -- it does not show up as a grant to anon.)
revoke execute on function family_hub.my_reply_signature() from public, anon;
grant execute on function family_hub.my_reply_signature() to authenticated;

-- And the reply itself defers to the same rule. Everything else about this
-- function is 0057 unchanged.
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

  v_sender := reply_signature(auth.uid());
  v_named  := v_sender is not null;
  -- The reply still sends when the name is unusable. A family waiting on an
  -- answer must not be blocked by a profile field.
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
