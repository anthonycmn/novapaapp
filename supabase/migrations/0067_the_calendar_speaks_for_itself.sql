-- 0067: the calendar speaks for itself.
--
-- CJ, 5 Sep 2026: "I want the parents to be able to see the descriptions of
-- the events that exist on the Sweeney Todd Google Calendar." The iCal sync
-- already derives who-is-called and what-is-worked from the description; this
-- column carries the description itself, flattened to text lines, so the show
-- page can show the director's full plan in his own words.
--
-- Also puts on the record four columns the sync has used since late August
-- that were applied out-of-band and never got a numbered file: the ownership
-- pair (external_source/external_ref) and the derived notes. On a database
-- that already has them, these lines are no-ops.

set search_path = family_hub, extensions;

alter table calendar_events add column if not exists external_source text;
alter table calendar_events add column if not exists external_ref text;
alter table calendar_events add column if not exists called_note text;
alter table calendar_events add column if not exists works_note text;

alter table calendar_events add column if not exists details text;

comment on column calendar_events.details is
  'The show calendar event''s own description, flattened to plain text lines ("---" = a divider). Synced hourly from Google; families read it verbatim on the show page.';
