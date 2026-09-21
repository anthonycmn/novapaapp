-- 0094 — a day camp lends the family its materials
--
-- CJ, 21 Sep 2026: the day camp pages get everything the show pages have,
-- materials included. Staff 0318 lets a production_materials row belong to
-- a camp (camp_id) instead of a production. This view is how a family sees
-- it: the same rows, the same audience rule, one more way to find them.
--
-- A show reaches its rows through production_portal_link (0051), which pairs
-- a hub production with a portal production. A day camp is a hub production
-- too — the sync files every order line against the row whose
-- registration_activity_id is the listing's id — but the portal side is a
-- CAMP, not a production, and the link table has no row for it. The bridge
-- is the listing: hub productions.registration_activity_id is the same
-- number the staff portal keeps in reg_offering_links.offering_key as
-- 'activity:<id>' against camp_id. One equality, nothing to keep in step.
--
-- Same audience filter, here and not in the app: only 'company' crosses.
--
-- Owner's rights on purpose (no security_invoker): the view is the only
-- thing reaching into staff_portal, and nothing else gains a way in.
-- Requires staff 0318. Safe to re-run.
set search_path = family_hub, public;

create or replace view family_hub.v_production_materials as
select
  l.hub_production_id as production_id,
  m.id,
  m.label,
  m.url,
  m.kind,
  m.note,
  m.sort_order
from family_hub.production_portal_link l
join staff_portal.production_materials m on m.production_id = l.portal_production_id
where m.audience = 'company'
union all
select
  p.id as production_id,
  m.id,
  m.label,
  m.url,
  m.kind,
  m.note,
  m.sort_order
from family_hub.productions p
join staff_portal.reg_offering_links k
  on k.camp_id is not null
 and k.offering_key = 'activity:' || p.registration_activity_id
join staff_portal.production_materials m on m.camp_id = k.camp_id
where p.registration_activity_id is not null
  and m.audience = 'company';

comment on view family_hub.v_production_materials is
  'The links a family rehearses from, read through to staff_portal.production_materials (staff 0312). Shows through production_portal_link; day camps through the registration activity id (0094). Only audience = company; staff-only material never crosses. No copy is kept.';

-- 0023's rule. The parent portal is service-key only, server side; anon and
-- authenticated have no business here, and a create-or-replace resets grants.
revoke all on family_hub.v_production_materials from anon, authenticated;
grant select on family_hub.v_production_materials to service_role;
