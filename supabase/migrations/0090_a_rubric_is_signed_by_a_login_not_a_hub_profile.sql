-- 0090 — A rubric is signed by a login, not by a hub profile.
--
-- 17 Sep 2026: Emily Chaumont, Choreographer on Frozen JR. Cast C, could open
-- the Teens audition grid, read every student and both colleagues' rubrics,
-- and save nothing. Hub 0080 opened the policy gate for anybody assigned to
-- the show, and she passes it — works_production() says yes. What stopped
-- her is older and quieter: audition_evaluations.evaluator_user_id was a
-- foreign key to family_hub.profiles, and she has no profile row. Deb and
-- Colton save theirs only because somebody hand-made a hub identity for each
-- of them (0047's chain, which also hands out the season-wide staff role).
--
-- The column has always held auth.uid() — the portal writes
-- session.user.id, the parent portal writes actor.id, and profiles.id is
-- itself that same uid — so the key simply points one table further up, at
-- the login. Being on the show is what lets you work it; a rubric asks for
-- nothing more.
--
-- Every existing evaluator_user_id is a profile id, and every profile id is
-- an auth user, so no row fails the new key. On delete stays SET NULL: a
-- departed evaluator's scores remain, unsigned, as before.
--
-- Safe to re-run.
set search_path = family_hub, public;

alter table family_hub.audition_evaluations
  drop constraint if exists audition_evaluations_evaluator_user_id_fkey;

alter table family_hub.audition_evaluations
  add constraint audition_evaluations_evaluator_user_id_fkey
  foreign key (evaluator_user_id) references auth.users(id) on delete set null;

comment on column family_hub.audition_evaluations.evaluator_user_id is
  'auth.uid() of the staff member who saved this rubric. A login, not a hub '
  'profile: anybody on the show (hub 0080) can sign one. Hub 0090.';
