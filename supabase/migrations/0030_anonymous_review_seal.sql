-- 0030 — seal anonymous-review identity (same shape as 0025's callback seal).
-- (Applied to novapa as family_hub_0030_anonymous_review_seal.)
--
-- The app's stated rule (src/lib/api/reviews/types.ts): "when a review is
-- anonymous, staff must not be able to tell who wrote it." The base-table
-- policy reviews_read_staff_scoped let a staff member named in staff_ids
-- SELECT the raw row over PostgREST — reviewer_name, reviewer_user_id,
-- is_anonymous and all. The app strips identity in its server code, but the
-- database did not, and staff_review_view was security_invoker (riding that
-- same leaky policy).
--
-- Now: staff read ONLY through staff_review_view, recreated as a definer
-- view that (a) scopes to reviews naming the caller (or admins) and
-- (b) exposes attribution ('A family' when anonymous) instead of identity.
-- The base-table staff policy is dropped; admins keep raw access via
-- reviews_read_own; anon is revoked from the view (verified 42501).

drop policy if exists reviews_read_staff_scoped on family_hub.reviews;

drop view if exists family_hub.staff_review_view;
create view family_hub.staff_review_view as
select r.id,
       r.subject_type,
       r.subject_id,
       r.staff_ids,
       case when r.is_anonymous then 'A family'::text else r.reviewer_name end as attribution,
       r.instruction_quality,
       r.communication,
       r.child_growth,
       r.organization,
       r.comment,
       r.created_at
from family_hub.reviews r
where coalesce(family_hub.is_admin(), false)
   or exists (
        select 1 from family_hub.staff_profiles sp
        where sp.user_id = auth.uid() and sp.id = any (r.staff_ids)
      );

revoke all on family_hub.staff_review_view from public;
revoke all on family_hub.staff_review_view from anon;
grant select on family_hub.staff_review_view to authenticated;

notify pgrst, 'reload schema';
