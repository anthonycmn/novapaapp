-- 0079 — A cleared box is empty, not blank.
--
-- Yin, a parent, 8 Sep 2026, with a screenshot of her own family's week: "it
-- doesn't properly display Azalea's name. I suspect that you only need to fix
-- how the name is retrieved. I double checked and found that Azalea's full name
-- is already entered properly in the account."
--
-- It was entered properly. Azalea's preferred_name was the empty string, and
-- the app reads a preferred name as `preferredName ?? firstName` in over a
-- hundred places — and `??` steps past null, not past "". So she rendered as a
-- colored dot with nothing beside it, on the calendar of the family that named
-- her.
--
-- The reading is fixed in the app (lib/api/optional-text.ts). This is the other
-- half: the column should never have held a blank in the first place. A form
-- posts "" when a parent clears a box, which means "nothing here" — the same
-- thing NULL means, and the thing every other reader of this schema (the staff
-- portal, the mailers, the website) is entitled to assume.
--
-- 27 students carried a blank preferred name, 48 a blank pronouns, 20 a blank
-- allergies, 5 a blank school. Those rows are cleaned, and the trigger stops
-- the next one arriving from whichever of the three systems writes it.
--
-- Safe to re-run.

update family_hub.students
   set preferred_name     = nullif(btrim(preferred_name), ''),
       pronouns           = nullif(btrim(pronouns), ''),
       school             = nullif(btrim(school), ''),
       allergies          = nullif(btrim(allergies), ''),
       medical_flags      = nullif(btrim(medical_flags), ''),
       vocal_range        = nullif(btrim(vocal_range), ''),
       dance_experience   = nullif(btrim(dance_experience), ''),
       tshirt_size        = nullif(btrim(tshirt_size), ''),
       headshot_url       = nullif(btrim(headshot_url), ''),
       headshot_print_url = nullif(btrim(headshot_print_url), ''),
       resume_pdf_url     = nullif(btrim(resume_pdf_url), ''),
       audition_song_url  = nullif(btrim(audition_song_url), ''),
       audition_audio_url = nullif(btrim(audition_audio_url), '')
 where btrim(coalesce(preferred_name,     'x')) = ''
    or btrim(coalesce(pronouns,           'x')) = ''
    or btrim(coalesce(school,             'x')) = ''
    or btrim(coalesce(allergies,          'x')) = ''
    or btrim(coalesce(medical_flags,      'x')) = ''
    or btrim(coalesce(vocal_range,        'x')) = ''
    or btrim(coalesce(dance_experience,   'x')) = ''
    or btrim(coalesce(tshirt_size,        'x')) = ''
    or btrim(coalesce(headshot_url,       'x')) = ''
    or btrim(coalesce(headshot_print_url, 'x')) = ''
    or btrim(coalesce(resume_pdf_url,     'x')) = ''
    or btrim(coalesce(audition_song_url,  'x')) = ''
    or btrim(coalesce(audition_audio_url, 'x')) = '';

/*
 * Only the optional columns. first_name, last_name, date_of_birth and grade are
 * required and are left exactly as they are: a blank there is a data problem to
 * be seen and fixed, not one to be quietly turned into NULL.
 */
create or replace function family_hub.students_blank_is_null()
returns trigger
language plpgsql
security invoker
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
  return new;
end;
$$;

drop trigger if exists students_blank_is_null on family_hub.students;
create trigger students_blank_is_null
  before insert or update on family_hub.students
  for each row execute function family_hub.students_blank_is_null();
