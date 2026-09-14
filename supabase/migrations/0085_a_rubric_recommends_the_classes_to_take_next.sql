-- A rubric recommends the classes to take next.
--
-- CJ, 14 Sep 2026: "On every single casting rubric for all of the directors,
-- choreographers, vocal directors, and assistant directors, list every single
-- class with a box next to it — 'classes we recommend to help you improve' —
-- and a spot for voice lessons, private acting lessons, private musical
-- theatre lessons, and private dance lessons. So instructors can click,
-- click, click, and parents see what classes they can sign up for. Include the
-- day of the week and the time that class meets, so when parents receive it
-- they can see if it fits into their schedule."
--
-- Two columns on the evaluation, one per list:
--
--   recommended_classes   a jsonb array of the classes ticked, each carried
--                         as it was on the day — name, ages, weekday, start
--                         and end, and the registration activity id. A
--                         SNAPSHOT, deliberately: the family reads this row
--                         through family_evaluation_view and has no access
--                         to the staff portal's class table, and a note a
--                         family was given should still read the same next
--                         month. The activity id is what turns a name into a
--                         Register button.
--
--   recommended_lessons   the kinds of private lesson ticked, from a fixed
--                         list of four. A kind, not a listing: none of these
--                         is a catalogue row a family can buy today, so the
--                         family side offers the coaching page and the
--                         office arranges the rest.
--
-- growth_notes (0025) stays — it is the free-text half of the same thought.
--
-- family_evaluation_view is rebuilt to carry both, still without
-- callback_notes, still family-scoped, still revoked from anon (0023 rule:
-- create-or-replace re-grants, so the revokes are repeated).
--
-- Additive. Safe to re-run.
set search_path = family_hub, public;

alter table family_hub.audition_evaluations
  add column if not exists recommended_classes jsonb not null default '[]'::jsonb,
  add column if not exists recommended_lessons text[] not null default '{}'::text[];

alter table family_hub.audition_evaluations
  drop constraint if exists audition_evaluations_recommended_classes_is_array;
alter table family_hub.audition_evaluations
  add constraint audition_evaluations_recommended_classes_is_array
  check (jsonb_typeof(recommended_classes) = 'array');

alter table family_hub.audition_evaluations
  drop constraint if exists audition_evaluations_recommended_lessons_known;
alter table family_hub.audition_evaluations
  add constraint audition_evaluations_recommended_lessons_known
  check (recommended_lessons <@ array['voice', 'acting', 'musical_theatre', 'dance']::text[]);

create or replace view family_hub.family_evaluation_view as
select e.id,
       e.student_id,
       e.production_id,
       e.discipline,
       e.evaluator_name,
       e.scores,
       e.notes,
       e.growth_notes,
       e.created_at,
       -- Appended after the 0025 columns: CREATE OR REPLACE VIEW keeps the
       -- existing column order and only allows additions at the end.
       e.recommended_classes,
       e.recommended_lessons
  from family_hub.audition_evaluations e
  join family_hub.students s on s.id = e.student_id
 where s.family_id = family_hub.auth_family_id()
   and exists (
     select 1
       from family_hub.casting_confirmations c
       join family_hub.casting_assignments a on a.id = c.assignment_id
      where c.student_id = e.student_id
        and a.production_id = e.production_id
        and c.feedback_requested_at is not null
   );

revoke all on family_hub.family_evaluation_view from public;
revoke all on family_hub.family_evaluation_view from anon;
-- Default privileges hand authenticated INSERT/UPDATE/DELETE on every new
-- object in this schema, and CREATE OR REPLACE counts as new. The view is
-- not updatable anyway, but a family should hold SELECT and nothing else.
revoke all on family_hub.family_evaluation_view from authenticated;
grant select on family_hub.family_evaluation_view to authenticated;
