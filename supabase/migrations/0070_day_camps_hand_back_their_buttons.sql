-- ─────────────────────────────────────────────────────────────────────────
-- 0070_day_camps_hand_back_their_buttons.sql
--
-- CJ, 5 Sep 2026: "remove the day camp templates so only real shows are
-- listed." The 0005 seed gave every casting-era production a button
-- template, day camps included. The artwork desks list exactly the
-- templated productions, so the camp templates ARE the camp cards.
--
-- Which rows are camps is the registration system's own answer:
-- public.activities.offering_kind = 'camp' (the Charlie, How to Train Your
-- Dragon, and Trolls age-band/tech rows — 12 templates). All twelve were
-- verified untouched before this ran: no background artwork, no order
-- items, no cart lines. A camp can always be re-added deliberately through
-- the desk's "add artwork for another show" picker.
--
-- Applied to live novapa via MCP as hub_0070_day_camps_hand_back_their_buttons
-- on 5 Sep 2026. Eight templates remain, one per real show.
-- ─────────────────────────────────────────────────────────────────────────
set search_path = family_hub, extensions;

delete from button_templates t
using productions p, public.activities a
where p.id = t.production_id
  and a.id = p.registration_activity_id
  and a.offering_kind = 'camp';
