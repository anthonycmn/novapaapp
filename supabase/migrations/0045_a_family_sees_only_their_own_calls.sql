-- Per-role call filtering on the family calendar.
--
-- 0009 tagged rehearsals by SCENE, and for "what is my child in" that is the
-- right unit. For "does my child have to be there on Thursday" it is not.
-- This is a character-block schedule: the 12 Sep leads call works Act I Sc. 8
-- and 9 with three people in the room, but those scenes belong to most of the
-- company, so filtering by scene invites everyone to a rehearsal for three.
--
-- The schedule already knows the answer directly. calendar_events.called_note
-- is the workbook's WHO IS CALLED column, written per call and per room, and
-- it is the thing a stage manager would read aloud. So the roles get their own
-- column and the family filter reads it first, falling back to scene tagging.
--
-- NULL or empty means EVERYONE, deliberately: that is what a full-company
-- call, the parent meeting, the load-in notice and the Labor Day
-- no-rehearsal marker all want, and it is the safe way to fail. A family
-- seeing one rehearsal too many is a nuisance; a family missing one because
-- a role failed to match is a child who does not turn up.
alter table family_hub.calendar_events
  add column if not exists role_ids uuid[];

comment on column family_hub.calendar_events.role_ids is
  'Roles called to this event, from the call sheet. NULL/empty = whole company. Takes precedence over scene_ids when filtering a family calendar.';
