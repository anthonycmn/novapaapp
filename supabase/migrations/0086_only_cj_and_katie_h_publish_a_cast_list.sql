-- Only CJ and Katie H publish a cast list or release the rubrics.
--
-- CJ, 14 Sep 2026: "add a stop gap for CJ and Katie H — we have to be the one
-- to release the rubrics and press the cast list submit button."
--
-- Three RPCs are the three moments a family's phone buzzes with something
-- that cannot be taken back: the cast list (portal_submit_casting), the
-- understudies (portal_publish_understudies), and the audition feedback
-- (portal_release_feedback). Until now "staff" — anyone on the show — could
-- press each. Now they ask staff_portal.can_release_casting() (staff 0311):
-- a named-person flag on the staff portal's allowlist, held today by CJ and
-- Katie H and editable on the Chief Suite's access page.
--
-- HOW: each function's live definition is read back and re-created with ONLY
-- its opening guard replaced — so the bodies stay byte-for-byte what 0022 /
-- 0023 / 0025 / 0052 / 0080 left them, and nothing is re-typed. A second run
-- finds the new guard already in place and changes nothing.
--
-- The family's own "request feedback" door closes in the app at the same
-- time (requestAuditionFeedback no longer flips feedback_requested_at for a
-- parent) — otherwise a family could release the rubrics to themselves and
-- the gate here would be decoration.
--
-- Requires staff 0311. Safe to re-run.
set search_path = family_hub, public;

-- Takes the user so the app's server (service role, acting for a signed-in
-- person) can ask about that person; a client call gets auth.uid() as before.
create or replace function family_hub.can_release_casting(p_user uuid default auth.uid())
returns boolean
language sql stable security definer
set search_path to 'family_hub', 'staff_portal', 'extensions'
as $$
  select coalesce(staff_portal.can_release_casting(p_user), false);
$$;

revoke all on function family_hub.can_release_casting(uuid) from public;
revoke all on function family_hub.can_release_casting(uuid) from anon;
grant execute on function family_hub.can_release_casting(uuid) to authenticated, service_role;

comment on function family_hub.can_release_casting(uuid) is
  'Who may submit a cast list, publish understudies or release audition feedback (hub 0086): the staff portal''s can_release_casting flag — CJ and Katie H.';

do $do$
declare
  fn record;
  v_def text;
  v_new text;
begin
  for fn in
    select *
    from (values
      ('portal_submit_casting',
       E'  if not (coalesce(is_staffish(), false) or works_production(p_production)) then\n    raise exception ''Casting for this show can only be submitted by somebody on it'';\n  end if;',
       E'  if not coalesce(family_hub.can_release_casting(), false) then\n    raise exception ''Only CJ or Katie H can submit a cast list'';\n  end if;'),
      ('portal_publish_understudies',
       E'  if not coalesce(is_staffish(), false) then\n    raise exception ''Understudies can only be published by staff'';\n  end if;',
       E'  if not coalesce(family_hub.can_release_casting(), false) then\n    raise exception ''Only CJ or Katie H can publish understudies'';\n  end if;'),
      ('portal_release_feedback',
       E'  if not coalesce(is_staffish(), false) then\n    raise exception ''Feedback can only be released by staff'';\n  end if;',
       E'  if not coalesce(family_hub.can_release_casting(), false) then\n    raise exception ''Only CJ or Katie H can release audition feedback'';\n  end if;')
    ) as t(name, old_guard, new_guard)
  loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p
     where p.pronamespace = 'family_hub'::regnamespace
       and p.proname = fn.name;
    if v_def is null then
      raise exception 'family_hub.%(uuid) is missing — apply hub 0022/0025 first', fn.name;
    end if;
    if position(fn.new_guard in v_def) > 0 then
      continue; -- already gated: re-run
    end if;
    if position(fn.old_guard in v_def) = 0 then
      raise exception 'family_hub.% no longer opens with the guard this migration expects — look before replacing', fn.name;
    end if;
    v_new := replace(v_def, fn.old_guard, fn.new_guard);
    execute v_new;
  end loop;
end
$do$;

-- 0023's rule: defaults re-grant on every create-or-replace, so re-revoke.
revoke all on function family_hub.portal_submit_casting(uuid) from public, anon;
revoke all on function family_hub.portal_publish_understudies(uuid) from public, anon;
revoke all on function family_hub.portal_release_feedback(uuid) from public, anon;
grant execute on function family_hub.portal_submit_casting(uuid) to authenticated;
grant execute on function family_hub.portal_publish_understudies(uuid) to authenticated;
grant execute on function family_hub.portal_release_feedback(uuid) to authenticated;
