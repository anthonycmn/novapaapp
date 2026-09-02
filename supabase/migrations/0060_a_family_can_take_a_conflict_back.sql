-- A family can take a conflict back.
--
-- Tony, 2 Sep 2026: "allow parents to adjust their own child's conflicts."
--
-- Half of this already worked and half of it never has, and a parent said so
-- in the only place they could -- inside the reason box of the absence itself:
--
--   "They changed the date from the 14th to the 3rd. ... So I need to cancel
--    the conflict I submitted for the 14th but I could not see how to do that.
--    However he will not be at rehearsal on the 3rd."
--
-- That is a parent filing a SECOND absence to explain that the FIRST one is
-- wrong, because the portal gave them no way to withdraw it. The director now
-- has two conflicts, one of them false, and the only thing distinguishing them
-- is a paragraph of prose nobody can query.
--
-- Answering a call has always been reversible: respond_to_call takes 'clear'
-- and removes the answer and the absence it filed. But an absence reported
-- from the absences page is a different door into the same table, and that
-- door only opened one way. There was no delete anywhere in the provider.
--
-- Withdrawal DELETES, exactly as 'clear' does. A withdrawn absence must not
-- linger anywhere -- not in the staff Absences panel, not in the morning
-- digest, not in the register that staff_portal 0217 just taught to read these
-- -- and one delete guarantees that across every reader at once, where a
-- `withdrawn_at` flag would guarantee it only in the readers I remembered to
-- change.
--
-- The linked event_response goes with it. Otherwise the chip on the calendar
-- keeps saying "Not attending" while the absence behind it no longer exists,
-- which is the same class of split this week has otherwise been spent closing.

create or replace function family_hub.withdraw_absence_report(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'family_hub', 'extensions'
as $function$
declare
  own uuid := family_hub.auth_family_id();
  rep absence_reports;
begin
  if own is null then
    raise exception 'Only a signed-in family can withdraw a conflict.' using errcode = '42501';
  end if;

  select * into rep from absence_reports where id = p_id;
  -- Already gone is a success: two taps on a slow connection must not error.
  if not found then
    return jsonb_build_object('ok', true, 'already_gone', true);
  end if;

  if rep.family_id <> own then
    raise exception 'That is not your report.' using errcode = '42501';
  end if;

  delete from event_responses where absence_report_id = p_id;
  delete from absence_reports where id = p_id;

  return jsonb_build_object('ok', true, 'withdrew', p_id);
end
$function$;

-- Supabase re-grants EXECUTE to anon on every CREATE OR REPLACE, and a new
-- function also carries the default grant to PUBLIC that anon inherits.
-- Revoke both, or anon keeps it. (0023, 0029, 0058.)
revoke execute on function family_hub.withdraw_absence_report(uuid) from public, anon;
grant execute on function family_hub.withdraw_absence_report(uuid) to authenticated;
