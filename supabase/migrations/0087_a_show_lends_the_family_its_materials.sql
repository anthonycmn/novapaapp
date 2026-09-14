-- 0087 — a show lends the family its materials, by the row
--
-- CJ, 14 Sep 2026, with the Frozen KIDS ShowKit: guide vocals, performance
-- tracks, the actor's script (with a note that a printed copy comes in
-- person), choreography and staging videos for the show page in BOTH
-- portals — and four more documents "ONLY put in the staff portal."
--
-- 0051 read three fixed columns through to this app. Staff 0312 replaces
-- them with staff_portal.production_materials — one row per link, with a
-- label, a kind, a note and an AUDIENCE. This view is 0051's successor: the
-- same join over production_portal_link, one row per material instead of
-- one row of columns, and the audience filter HERE rather than in the app.
-- A director's guide is licensed for the director; the app should not be
-- the only thing standing between it and a family.
--
-- v_production_media stays until the app's build reading this one is live;
-- the staff portal drops it with 0177's columns afterwards.
--
-- Owner's rights on purpose (no security_invoker): the view is the only
-- thing reaching into staff_portal, and nothing else gains a way in.
-- Requires staff 0312. Safe to re-run.
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
where m.audience = 'company';

comment on view family_hub.v_production_materials is
  'The links a family rehearses from, read through to staff_portal.production_materials (staff 0312). Only audience = company; staff-only material never crosses. No copy is kept.';

-- 0023's rule. The parent portal is service-key only, server side; anon and
-- authenticated have no business here, and a create-or-replace resets grants.
revoke all on family_hub.v_production_materials from anon, authenticated;
grant select on family_hub.v_production_materials to service_role;
