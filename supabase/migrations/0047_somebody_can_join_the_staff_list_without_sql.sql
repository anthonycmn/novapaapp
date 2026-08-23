-- ─────────────────────────────────────────────────────────────────────────
-- 0047 — Somebody can join the staff list without SQL.
-- ─────────────────────────────────────────────────────────────────────────
-- Tony: "why can't colton write a bio — he should be able to and then I
-- approve it."
--
-- He should. What stopped him was not a permission: it was that
-- `staff_profiles` had no row for him and no way to make one. The table has
-- carried exactly six people since it was filled in by hand, it has a SELECT
-- policy and an UPDATE policy and NO INSERT POLICY AT ALL, and neither app
-- contains a single line that creates a row in it. So "add somebody to the
-- website staff list" was an operation that existed only as SQL somebody
-- typed once, and every person hired since has been quietly unable to write
-- a bio. Colton is simply the first one anybody noticed, because coaching
-- made his bio matter.
--
-- ── ONE ARGUMENT, ON PURPOSE ─────────────────────────────────────────────
-- A profile is useless unless BOTH of its links are right, and they are easy
-- to get wrong in opposite directions:
--
--   user_id         — who may write this bio. Wrong or missing, and the owner
--                     is told they have no profile (the exact error above).
--   portal_staff_id — which staff record this is. Wrong or missing, and
--                     coaching cannot find the bio (staff portal 0151), so a
--                     published coach still shows families nothing.
--
-- Passing them in separately means passing a pair that can disagree. So this
-- takes ONE argument — the portal staff id — and resolves the name, the job
-- title and the login itself. There is no way to call it that produces a
-- half-linked row.
--
-- ── WHY A FUNCTION AND NOT AN INSERT POLICY ──────────────────────────────
-- An INSERT policy would let an administrator create a row with neither
-- column set, which is precisely the broken state this fixes. The table
-- stays closed and gains one door that cannot build a broken row.
--
-- ── IT IS FOUR ROWS, NOT ONE ─────────────────────────────────────────────
-- Found by testing rather than by reading: `staff_profiles.user_id` is a
-- foreign key to `family_hub.profiles`, and a member of staff can have an
-- auth login and a portal account while having no hub profile at all —
-- Colton did. So the chain a bio actually needs is
--
--   staff_portal.staff → staff_portal.portal_users (a login)
--     → family_hub.profiles (a hub identity)
--       → family_hub.staff_profiles (somewhere for the bio)
--
-- and `profiles.staff_id` points back at the last of those, so the pair is
-- circular and has to be built in order and then stitched. Doing that by hand
-- four times per person is why it had never been done at all. It happens here,
-- in one transaction, or not at all.
--
-- CREATING THE HUB IDENTITY IS A REAL GRANT, not bookkeeping: it gives that
-- person the `staff` role in the parent portal. It is admin-gated for that
-- reason, and the role is only ever set when the row is CREATED — somebody
-- who already has a profile keeps whatever role they were given, so this can
-- never quietly promote or demote anybody.
--
-- NOT PUBLISHED, and not a bio. This creates somewhere for a bio to live and
-- nothing else: the person writes it, an admin approves it, and only then do
-- families see anything. That is the existing queue (0032) and this migration
-- does not touch it.
--
-- Safe to re-run; adding somebody twice returns the profile they already have.
-- ─────────────────────────────────────────────────────────────────────────

set search_path = family_hub, extensions;

create or replace function family_hub.portal_add_staff_profile(
  p_portal_staff_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = family_hub, extensions, pg_temp
as $fn$
declare
  v_name  text;
  v_title text;
  v_uid   uuid;
  v_id    uuid;
begin
  if not coalesce(family_hub.is_admin(), false) then
    raise exception 'Adding somebody to the staff list is admin business'
      using errcode = '42501';
  end if;

  -- Already there: hand back what exists rather than making a second row.
  -- Two profiles for one person means two bios and a coin toss over which
  -- one families read.
  select id into v_id from staff_profiles where portal_staff_id = p_portal_staff_id;
  if found then
    return jsonb_build_object('id', v_id, 'created', false);
  end if;

  -- The portal is where staff records and logins actually live, so the facts
  -- are read from there rather than retyped by the caller.
  select st.full_name,
         nullif(btrim(coalesce(st.job_title, '')), ''),
         pu.auth_user_id
    into v_name, v_title, v_uid
    from staff_portal.staff st
    left join staff_portal.portal_users pu
      on pu.staff_id = st.id and pu.is_active
   where st.id = p_portal_staff_id;

  if v_name is null then
    raise exception 'No such staff member' using errcode = 'P0002';
  end if;

  -- No login means nobody can write the bio. Creating the row anyway would
  -- produce an empty profile that nothing can ever fill, so this refuses and
  -- says which problem to fix first.
  if v_uid is null then
    raise exception
      '% has no active portal login yet, so there is nobody to write the bio. Invite them first.',
      v_name
      using errcode = '22023';
  end if;

  if exists (select 1 from staff_profiles where user_id = v_uid) then
    raise exception '% already has a staff profile under a different staff record.', v_name
      using errcode = '23505';
  end if;

  -- The hub identity the bio hangs off. Created only if absent, and the role
  -- is set only on creation — see the header. An existing profile keeps the
  -- role it already had.
  if not exists (select 1 from profiles where id = v_uid) then
    insert into profiles (id, email, display_name, role)
    values (v_uid,
            coalesce((select lower(btrim(st.email)) from staff_portal.staff st
                       where st.id = p_portal_staff_id), v_uid::text),
            v_name,
            'staff')
    on conflict (id) do nothing;
  end if;

  insert into staff_profiles (user_id, portal_staff_id, full_name, title,
                              bio, specialties, is_published)
  values (v_uid, p_portal_staff_id, v_name, coalesce(v_title, ''),
          '', '{}', false)
  returning id into v_id;

  -- Stitch the circular half: profiles.staff_id points at the row just made,
  -- which is what the approval queue uses to notify the owner (0032).
  update profiles set staff_id = v_id where id = v_uid and staff_id is null;

  return jsonb_build_object('id', v_id, 'created', true, 'fullName', v_name);
end;
$fn$;

comment on function family_hub.portal_add_staff_profile is
  'Give a member of staff somewhere for their bio to live. Takes ONE argument '
  'so user_id and portal_staff_id cannot disagree — see the header of 0047. '
  'Creates an unpublished, empty profile; the bio itself is written by its '
  'owner and released through the 0032 approval queue.';

revoke all on function family_hub.portal_add_staff_profile(uuid) from public, anon;
grant execute on function family_hub.portal_add_staff_profile(uuid) to authenticated;

-- ── who is missing one ───────────────────────────────────────────────────
-- So the gap is visible where bios are approved, instead of being discovered
-- by somebody being told they have no profile.
create or replace view v_staff_without_profile as
  select
    st.id   as portal_staff_id,
    st.full_name,
    st.job_title,
    (pu.auth_user_id is not null) as can_sign_in
  from staff_portal.staff st
  left join staff_portal.portal_users pu
    on pu.staff_id = st.id and pu.is_active
  where st.is_active
    and not exists (
      select 1 from staff_profiles sp where sp.portal_staff_id = st.id
    )
    and family_hub.is_admin();

comment on view v_staff_without_profile is
  'Active staff with no public profile — nobody who can write a bio. Admin '
  'only. 0047.';

grant select on v_staff_without_profile to authenticated;
