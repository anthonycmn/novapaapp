-- A student is the same child as the camper.
--
-- Tony, 2 Sep 2026: "Do attendance, schedule, weekly email consistency."
--
-- The three surfaces disagree because two databases describe the same child
-- and nothing joins them. `family_hub.students` is who the parent portal knows
-- -- it holds the absence a family files and the answer they give to a call.
-- `public.campers` is who the register knows: staff_portal.v_roster resolves
-- through `campers.id`, and `curriculum_attendance` is taken against that.
-- There is no key between them. Not a missing foreign key -- no column at all,
-- on either side, and none between the two `families` tables either.
--
-- So a parent marks "not attending" on Thursday, it files an absence report,
-- and a director opens Thursday's register to a blank row. The family told us
-- and the register cannot know. That is the whole inconsistency.
--
-- Names are the only bridge, and names are not a key: 26 of Sweeney's 27 match
-- exactly and the 27th is registered "Caroline (Cal) Firestone", the
-- parenthetical form, against a student stored as Caroline / Cal / Firestone.
-- The next family to type something slightly different breaks it silently,
-- which is the failure that matters -- a child marked absent who told us, or
-- marked present who is not in the room.
--
-- So the link is STORED once, here, rather than guessed on every read.
--
-- The backfill matches only where it is UNAMBIGUOUS: exactly one camper for
-- the student and exactly one student for the camper. Siblings share a
-- surname, families re-register, and a wrong link is worse than no link --
-- an unlinked child shows as "not linked" and a human fixes it, a mislinked
-- child shows somebody else's absence and nobody ever notices.

alter table family_hub.students
  add column if not exists camper_id uuid
    references public.campers(id) on delete set null;

comment on column family_hub.students.camper_id is
  'The same child in public.campers, which staff_portal.v_roster and the '
  'attendance register key on. Null means unlinked, which is a visible state, '
  'not an error. Set by 0059 where the name match was unambiguous.';

-- One camper is one student. A second student claiming the same camper would
-- put two children on one register row.
create unique index if not exists students_camper_id_key
  on family_hub.students (camper_id) where camper_id is not null;

do $$
declare
  linked int;
  unlinked int;
begin
  with student_keys as (
    -- What a student could be called. Both forms, because a register may hold
    -- either the legal name or the one they go by.
    select s.id,
           lower(regexp_replace(btrim(s.first_name || ' ' || s.last_name), '\s+', ' ', 'g')) as k
    from family_hub.students s
    where s.camper_id is null
    union
    select s.id,
           lower(regexp_replace(btrim(s.preferred_name || ' ' || s.last_name), '\s+', ' ', 'g'))
    from family_hub.students s
    where s.camper_id is null and nullif(btrim(s.preferred_name), '') is not null
  ),
  camper_keys as (
    -- And what a camper could be called. "Caroline (Cal) Firestone" is three
    -- names in one string: itself, the legal form, and the called form.
    select c.id, lower(regexp_replace(btrim(c.name), '\s+', ' ', 'g')) as k
    from public.campers c
    union
    select c.id,
           lower(regexp_replace(btrim(regexp_replace(c.name, '\s*\([^)]*\)', '', 'g')), '\s+', ' ', 'g'))
    from public.campers c
    where c.name like '%(%'
    union
    select c.id,
           lower(regexp_replace(btrim(
             regexp_replace(c.name, '^\S+\s*\(([^)]*)\)\s*(.*)$', '\1 \2')
           ), '\s+', ' ', 'g'))
    from public.campers c
    where c.name ~ '^\S+\s*\([^)]*\)'
  ),
  pairs as (
    select distinct sk.id as student_id, ck.id as camper_id
    from student_keys sk join camper_keys ck on ck.k = sk.k
    where sk.k <> '' and sk.k is not null
  ),
  -- Unambiguous in BOTH directions, or it is not a match.
  safe as (
    select p.student_id, p.camper_id
    from pairs p
    where (select count(*) from pairs x where x.student_id = p.student_id) = 1
      and (select count(*) from pairs y where y.camper_id  = p.camper_id ) = 1
  )
  update family_hub.students s
     set camper_id = safe.camper_id
    from safe
   where s.id = safe.student_id and s.camper_id is null;

  get diagnostics linked = row_count;
  select count(*) into unlinked from family_hub.students where camper_id is null;
  raise notice 'linked % students to a camper; % still unlinked', linked, unlinked;
end $$;

-- Second pass: the same child, registered twice.
--
-- Every student the first pass refused turned out to be one child holding two
-- camper rows, because the org moved registration systems and both survived:
-- Aubry Travis and Ryan Rodgers each exist once from regpack and once from
-- sawyer, Elyse Rath twice from regpack, and Kai Stuermann is "Kai Stuermann"
-- in one and "Vanessa (Kai)  Stuermann" in the other.
--
-- Which of the two is the right one is not a coin toss: only one of them is
-- carrying live registrations, and that is the row the roster resolves through
-- and the register is taken against. So prefer the camper that is actually
-- registered, and only when exactly one of the candidates is.
--
-- Kai stays unlinked on purpose -- both of those rows have live registrations,
-- so it is a real duplicate for a human to merge, and guessing would put a
-- child's absences on one row while their register is taken on the other.

do $$
declare
  linked int;
begin
  with student_keys as (
    select s.id,
           lower(regexp_replace(btrim(s.first_name || ' ' || s.last_name), '\s+', ' ', 'g')) as k
    from family_hub.students s
    where s.camper_id is null
    union
    select s.id,
           lower(regexp_replace(btrim(s.preferred_name || ' ' || s.last_name), '\s+', ' ', 'g'))
    from family_hub.students s
    where s.camper_id is null and nullif(btrim(s.preferred_name), '') is not null
  ),
  camper_keys as (
    select c.id, lower(regexp_replace(btrim(c.name), '\s+', ' ', 'g')) as k
    from public.campers c
    union
    select c.id,
           lower(regexp_replace(btrim(regexp_replace(c.name, '\s*\([^)]*\)', '', 'g')), '\s+', ' ', 'g'))
    from public.campers c
    where c.name like '%(%'
    union
    select c.id,
           lower(regexp_replace(btrim(
             regexp_replace(c.name, '^\S+\s*\(([^)]*)\)\s*(.*)$', '\1 \2')
           ), '\s+', ' ', 'g'))
    from public.campers c
    where c.name ~ '^\S+\s*\([^)]*\)'
  ),
  pairs as (
    select distinct sk.id as student_id, ck.id as camper_id
    from student_keys sk join camper_keys ck on ck.k = sk.k
    where sk.k <> '' and sk.k is not null
  ),
  -- Only the candidates that are actually registered.
  registered as (
    select p.student_id, p.camper_id
    from pairs p
    where exists (
      select 1 from staff_portal.v_reg_participants_live rp
       where rp.participant_id = p.camper_id
    )
  ),
  safe as (
    select r.student_id, r.camper_id
    from registered r
    where (select count(*) from registered x where x.student_id = r.student_id) = 1
      and (select count(*) from registered y where y.camper_id  = r.camper_id ) = 1
      -- Never take a camper another student already holds.
      and not exists (select 1 from family_hub.students s2 where s2.camper_id = r.camper_id)
  )
  update family_hub.students s
     set camper_id = safe.camper_id
    from safe
   where s.id = safe.student_id and s.camper_id is null;

  get diagnostics linked = row_count;
  raise notice 'second pass linked % more', linked;
end $$;

-- Third pass: and the same child, imported twice.
--
-- The duplication runs both ways. family_hub.students also holds two rows for
-- one child -- two "Aubry Travis", two "Elyse Rath", same import timestamp,
-- filed under different family_id. So a camper that is unambiguous on its own
-- side still matches two students and pass two refuses it.
--
-- Same principle as pass two, mirrored: prefer the row that is actually in
-- use. One of each pair carries the enrollment and the casting; the other is
-- an orphan holding nothing. Link the one the show actually knows about.
--
-- (Worth recording what this is NOT. Aubry's duplicate looked like the cause
-- of "Beggar Woman and Young Lucy should be the same person" -- two rows, two
-- roles, one child. It is not: both roles sit on the SAME student row, the
-- casting was always right, and the orphan holds no casting at all. Whatever
-- splits those two characters is in a view, not here.)

do $$
declare
  linked int;
begin
  with student_keys as (
    select s.id,
           lower(regexp_replace(btrim(s.first_name || ' ' || s.last_name), '\s+', ' ', 'g')) as k
    from family_hub.students s where s.camper_id is null
    union
    select s.id,
           lower(regexp_replace(btrim(s.preferred_name || ' ' || s.last_name), '\s+', ' ', 'g'))
    from family_hub.students s
    where s.camper_id is null and nullif(btrim(s.preferred_name), '') is not null
  ),
  camper_keys as (
    select c.id, lower(regexp_replace(btrim(c.name), '\s+', ' ', 'g')) as k from public.campers c
    union
    select c.id,
           lower(regexp_replace(btrim(regexp_replace(c.name, '\s*\([^)]*\)', '', 'g')), '\s+', ' ', 'g'))
    from public.campers c where c.name like '%(%'
    union
    select c.id,
           lower(regexp_replace(btrim(
             regexp_replace(c.name, '^\S+\s*\(([^)]*)\)\s*(.*)$', '\1 \2')
           ), '\s+', ' ', 'g'))
    from public.campers c where c.name ~ '^\S+\s*\([^)]*\)'
  ),
  pairs as (
    select distinct sk.id as student_id, ck.id as camper_id
    from student_keys sk join camper_keys ck on ck.k = sk.k
    where sk.k <> '' and sk.k is not null
  ),
  -- In use on the camper side...
  registered as (
    select p.* from pairs p
    where exists (select 1 from staff_portal.v_reg_participants_live rp
                   where rp.participant_id = p.camper_id)
  ),
  -- ...and in use on the student side.
  enrolled as (
    select r.* from registered r
    where exists (select 1 from family_hub.enrollments e where e.student_id = r.student_id)
  ),
  safe as (
    select e.student_id, e.camper_id
    from enrolled e
    where (select count(*) from enrolled x where x.student_id = e.student_id) = 1
      and (select count(*) from enrolled y where y.camper_id  = e.camper_id ) = 1
      and not exists (select 1 from family_hub.students s2 where s2.camper_id = e.camper_id)
  )
  update family_hub.students s
     set camper_id = safe.camper_id
    from safe
   where s.id = safe.student_id and s.camper_id is null;

  get diagnostics linked = row_count;
  raise notice 'third pass linked % more', linked;
end $$;
