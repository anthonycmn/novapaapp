-- 0051 — the rehearsal folders reach the family, without a second copy of them
--
-- CJ, 26 Aug 2026, looking at the Sweeney page in the parent portal: "I still
-- don't see the Click Tracks", and then "I want a tile for each here, in the
-- second row next to Rehearsal Tracks."
--
-- The three folders (click tracks, choreography videos, staging) are columns
-- on STAFF_PORTAL.productions, put there by 0177 so a Director can paste a
-- Drive link onto their own show without a deploy. The family portal reads
-- family_hub. The obvious move — copy the three columns onto
-- family_hub.productions and sync them — is the wrong one: it invents a
-- second source of truth for a link somebody edits by hand, and the first
-- time the sync misses, a parent opens last term's folder.
--
-- So the hub READS THROUGH instead. One view, joined over the existing
-- production_portal_link, resolving a hub production to whatever the portal
-- currently holds. A Director pasting a link in the staff portal changes what
-- families see on the next page load, with nothing to run in between.
--
-- Owner's rights on purpose (no security_invoker): the view is the only thing
-- reaching into staff_portal, and nothing else gains a way in.

create or replace view family_hub.v_production_media as
select
  l.hub_production_id as production_id,
  p.click_tracks_url,
  p.choreography_url,
  p.staging_url,
  -- Carried too, though the tile still reads its code from config today.
  -- When rehearsal tracks stop being Sweeney-shaped, this is where they come
  -- from, and it is one join rather than a second migration.
  p.rehearsal_tracks_code,
  p.rehearsal_tracks_url
from family_hub.production_portal_link l
join staff_portal.productions p on p.id = l.portal_production_id;

comment on view family_hub.v_production_media is
  'Rehearsal media links for a hub production, read through to staff_portal.productions. No copy is kept; the staff portal is the only writer.';

-- 0023's rule. The parent portal is service-key only, server side; anon and
-- authenticated have no business here, and a create-or-replace resets grants.
revoke all on family_hub.v_production_media from anon, authenticated;
grant select on family_hub.v_production_media to service_role;
