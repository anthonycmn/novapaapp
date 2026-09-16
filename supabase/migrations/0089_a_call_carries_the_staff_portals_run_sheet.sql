-- 0089 — a call carries the staff portal's run sheet
--
-- CJ, 16 Sep 2026: "the curriculum pages between the staff and parent portal
-- are not syncing properly - I need them to have the same calendar, run
-- pages, etc . . . . and I want the staff page to be the authority."
--
-- Both portals read the same Google calendar. The staff portal turns each
-- event into the ROOMS it is run as — "Run the day": 9:00–9:30 Act II
-- Sequence, pages 94–99, Johanna · Anthony · Sweeney Todd · Beggar Woman,
-- with Colton — and staff correct those rows by hand. Until now the family
-- side flattened that back into two sentences ("Called … / Working …") that
-- lost the times, the rooms and who leads, and a labelled cast list in the
-- Google description could still override what staff had corrected.
--
-- This column is the staff portal's run sheet for the event, verbatim, as
-- the iCal sync last read it from staff_portal.curriculum_calls: one JSON
-- object per room block, in order. The sync remains the only writer (one
-- writer, one pass — see src/lib/ical/portal-calls.ts), and the staff portal
-- is now the authority on who is called and what is worked whenever it has
-- a block for the event. Null means the staff portal keeps no curriculum for
-- this show, and the calendar's own prose stands.
--
--   [{ "start": "09:00", "end": "09:30", "room": null, "leader": "Colton",
--      "what": "Act II Sequence", "pages": "Pages 94 - 99",
--      "called": ["Johanna", "Anthony", "Sweeney Todd", "Beggar Woman"],
--      "roleIds": ["…"] }]
--
-- Additive; safe to re-run.
set search_path = family_hub, public;

alter table family_hub.calendar_events
  add column if not exists run jsonb;

comment on column family_hub.calendar_events.run is
  'The staff portal''s run sheet for this event (staff_portal.curriculum_calls, non-cancelled), one object per room block, written by the iCal sync. Staff is the authority: when present it outranks called_note/works_note, which are kept as one-line summaries. Null = the staff portal keeps no curriculum for this show.';
