-- A rubric belongs to a chair on the panel, not to a discipline.
--
-- CJ, 8 Sep 2026, on the staff Casting page: a grid with every student down
-- the side and "a director column, a vocal director column, a choreographer
-- column, and perhaps an assistant director column. And each one of those
-- columns houses their individual rubric."
--
-- Until now an evaluation was unique per (student, show, DISCIPLINE): one
-- acting rubric, one vocal, one dance. That cannot hold a Director's acting
-- rubric AND an Assistant Director's acting rubric for the same child, which
-- is exactly what a fourth column asks for. So the key becomes the chair —
-- evaluator_role — and discipline stays as the rubric that chair fills in:
--
--     director            → acting
--     assistant_director  → acting
--     vocal_director      → vocal     (the Music Director sits in this chair
--                                      on a show that has no Vocal Director)
--     choreographer       → dance
--
-- The check constraint pins that mapping so a row cannot claim to be the
-- choreographer's vocal rubric. Zero rows exist today (8 Sep 2026), so the
-- backfill below is belt-and-braces for any environment that has some.
--
-- family_evaluation_view (0025) selects named columns and is untouched: a
-- family who asks for feedback sees each rubric with the evaluator's name,
-- and a second acting rubric is simply a second card.
--
-- Additive except for the unique key swap. Safe to re-run.
set search_path = family_hub, public;

alter table family_hub.audition_evaluations
  add column if not exists evaluator_role text;

update family_hub.audition_evaluations
   set evaluator_role = case discipline
                          when 'acting' then 'director'
                          when 'vocal'  then 'vocal_director'
                          when 'dance'  then 'choreographer'
                        end
 where evaluator_role is null;

alter table family_hub.audition_evaluations
  alter column evaluator_role set not null;

alter table family_hub.audition_evaluations
  drop constraint if exists audition_evaluations_evaluator_role_check;
alter table family_hub.audition_evaluations
  add constraint audition_evaluations_evaluator_role_check check (
       (evaluator_role in ('director', 'assistant_director') and discipline = 'acting')
    or (evaluator_role = 'vocal_director' and discipline = 'vocal')
    or (evaluator_role = 'choreographer' and discipline = 'dance')
  );

alter table family_hub.audition_evaluations
  drop constraint if exists audition_evaluations_student_id_production_id_discipline_key;
alter table family_hub.audition_evaluations
  drop constraint if exists audition_evaluations_student_production_role_key;
alter table family_hub.audition_evaluations
  add constraint audition_evaluations_student_production_role_key
  unique (student_id, production_id, evaluator_role);

comment on column family_hub.audition_evaluations.evaluator_role is
  'The chair on the audition panel this rubric belongs to: director, '
  'assistant_director, vocal_director or choreographer. One rubric per chair '
  'per student per show; discipline is the rubric that chair fills in. Hub 0075.';
