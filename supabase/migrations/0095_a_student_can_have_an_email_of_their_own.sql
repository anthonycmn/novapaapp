-- 0095 — a student can have an email of their own
--
-- Jen Travis, 5 Oct 2026: "it would be awesome to have a drop-down option for
-- the students or to include the students in the communication being sent."
-- CJ: "ALLOW PARENTS TO PUT IN THEIR STUDENT'S EMAIL ADDRESS AND THEY CAN ALSO
-- RECEIVE EMAILS."
--
-- So the address is the PARENT'S to give, on the student's page in the Parent
-- Portal — not a login, not a student account (students still have none). A
-- staff email that ticks "Also send to students" copies every student in the
-- audience who has one. A student with no address is simply not copied.
--
-- email_opted_out is the student's own "Unsubscribe" from newsletters and
-- fundraising: it stops that one address, never the parents'. The household
-- opt-out (email_preferences) still covers the student too.
--
-- Parents can already update any column of their own students (students_update
-- in 0001), so no policy changes. Safe to re-run.
set search_path = family_hub, public;

alter table family_hub.students
  add column if not exists email text,
  add column if not exists email_opted_out boolean not null default false;

alter table family_hub.students
  drop constraint if exists students_email_shape;
alter table family_hub.students
  add constraint students_email_shape
  check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

/* The 0079 trigger, plus email: blank becomes NULL and the address is stored
   lowercase, so the same child typed twice is the same address. */
create or replace function family_hub.students_blank_is_null()
returns trigger
language plpgsql
set search_path = family_hub, public
as $$
begin
  new.preferred_name     := nullif(btrim(new.preferred_name), '');
  new.pronouns           := nullif(btrim(new.pronouns), '');
  new.school             := nullif(btrim(new.school), '');
  new.allergies          := nullif(btrim(new.allergies), '');
  new.medical_flags      := nullif(btrim(new.medical_flags), '');
  new.vocal_range        := nullif(btrim(new.vocal_range), '');
  new.dance_experience   := nullif(btrim(new.dance_experience), '');
  new.tshirt_size        := nullif(btrim(new.tshirt_size), '');
  new.headshot_url       := nullif(btrim(new.headshot_url), '');
  new.headshot_print_url := nullif(btrim(new.headshot_print_url), '');
  new.resume_pdf_url     := nullif(btrim(new.resume_pdf_url), '');
  new.audition_song_url  := nullif(btrim(new.audition_song_url), '');
  new.audition_audio_url := nullif(btrim(new.audition_audio_url), '');
  new.email              := lower(nullif(btrim(new.email), ''));
  -- A new address is a new yes: a parent who types it in is asking for mail.
  if tg_op = 'UPDATE' and new.email is distinct from old.email then
    new.email_opted_out := false;
  end if;
  return new;
end;
$$;
