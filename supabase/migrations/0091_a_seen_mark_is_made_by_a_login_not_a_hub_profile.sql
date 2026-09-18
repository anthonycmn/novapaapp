-- 0091 a seen mark is made by a login, not by a hub profile.
--
-- 17 Sep 2026, the afternoon of the Frozen and Sweeney auditions: 34 of the 98
-- "seen" marks the panel made were refused. Britney Sistare lost 29 between
-- 2:00 and 3:49 PM ET, Emily Chaumont lost 5 between 8:00 and 11:00 AM, every
-- one of them with
--
--   new row violates row-level security policy for table "audition_reviews"
--
-- and nothing on screen to say the mark had not stuck. Both were reading the
-- grid from the staff portal, both are on the show, and both had the same
-- thing missing: a family_hub.profiles row.
--
-- This is the same wall 0090 took down for the rubrics one table over. Two
-- things in 0074 ask for a hub profile that nobody on a show should need:
--
--   1. reviewer_user_id references family_hub.profiles (id)
--   2. the policy gate is is_staffish(), which reads profiles.role
--
-- The column has always held auth.uid(): the staff portal writes
-- session.user.id, and profiles.id is itself that uid. So the key points one
-- table further up, at the login, exactly as 0090 did for
-- audition_evaluations. Every one of the 578 rows already there passes the new
-- key (checked: 0 reviewer_user_id values absent from auth.users), and none
-- has a null production_id.
--
-- On delete cascade rather than 0090's set null: reviewer_user_id is NOT NULL
-- here, so a departed reader's seen marks go with the login, which is what the
-- old key did too.
--
-- The gate becomes the one 0080 wrote for every other audition table: being on
-- the show is what lets you work it. The with check keeps the part that
-- matters, that you may only write your own mark under your own name.
--
-- What this deliberately does not do: let somebody who is not on the show mark
-- a submission. Taylor White Marshall, the one active staff login still
-- without a hub profile, has no production assignment either, so he stays
-- refused after this, correctly.
--
-- Safe to re-run.
set search_path = family_hub, public;

alter table family_hub.audition_reviews
  drop constraint if exists audition_reviews_reviewer_user_id_fkey;

alter table family_hub.audition_reviews
  add constraint audition_reviews_reviewer_user_id_fkey
  foreign key (reviewer_user_id) references auth.users(id) on delete cascade;

comment on column family_hub.audition_reviews.reviewer_user_id is
  'auth.uid() of the person who opened the submission. A login, not a hub '
  'profile: anybody on the show (hub 0080) leaves a seen mark. Hub 0091.';

drop policy if exists audition_reviews_staff on family_hub.audition_reviews;
create policy audition_reviews_staff on family_hub.audition_reviews
  for all
  using (family_hub.is_staffish() or family_hub.works_production(production_id))
  with check (
    (family_hub.is_staffish() or family_hub.works_production(production_id))
    and reviewer_user_id = auth.uid()
  );
