-- 0091 — Frozen KIDS has twenty-six roles, for twenty-six students.
--
-- CJ, 18 Sep 2026: "fix the frozen kids cast so that it only has 26 roles to
-- match the 26 students registered - wayyyyy too many roles otherwise."
--
-- 0062 seeded the KIDS cast list as the workbook's 85 named slots — every
-- Townsperson, every chorus member, numbered — because a KIDS show casts
-- every enrolled child and nobody knew how many there would be. There are
-- 26, and a casting board with 85 rows is a wall of empty ensemble slots
-- around the parts that matter.
--
-- Which 26 survive is decided by the board CJ was building this afternoon
-- (family_hub.casting_boards, draft, 32 entries placing 24 of the 26). Every
-- role a student is placed in stays, bar six. The cuts are the 53 slots
-- nobody was put in — Bishop, Weselton, Steward, the Guards, Storyteller 4,
-- Townspeople 4 and 7-14, the Snow, Summer, Hidden Folk and Townsperson
-- ensembles — plus the six that only existed as a second or third part for
-- a child who already has one, one of them a storyteller who would have
-- been narrating his own scene as the King: Storyteller 2 and 3,
-- Townsperson 5, Hidden Folk Solo 4-6. Ensemble work — snow, summer, hidden folk, townspeople — is what the
-- whole company does between their named parts, the way every KIDS show
-- runs; it is not a row on the cast list.
--
-- What is left: the ten leads, the royal couple and the two elder Hidden
-- Folk, four Castle Staff, one Storyteller, four Townsperson solos and three
-- Hidden Folk solos. Townsperson 6 becomes Townsperson 4 so the solos are
-- numbered consecutively, as their description promises. Storyteller 1
-- becomes Storyteller.
--
-- The draft board's six entries in cut roles are dropped with them; the
-- other 26 are untouched, and all 24 placed students keep at least one
-- part. Two students (Allegra Lehr, Anabelle Weiner) are still to be placed
-- and two are doubled (Brooklyn Tucker, Lorelai Musson) — CJ's call, on the
-- board, not here. show_scenes.role_ids is stripped of the cut ids; the
-- scenes' `characters` text stays the workbook's wording, as 0062 chose.
--
-- Nothing is published, nothing is assigned (casting_assignments is empty
-- for this show), so no family sees a change.
--
-- Safe to re-run.
set search_path = family_hub, public;

do $$
declare
  kids constant uuid := 'a107b67d-df92-4dd6-87d7-17e04455fa2b';
  keep constant text[] := array[
    'Young Anna', 'Middle Anna', 'Anna', 'Young Elsa', 'Middle Elsa', 'Elsa',
    'Hans', 'Kristoff', 'Olaf', 'Sven',
    'King Agnarr', 'Queen Iduna', 'Pabbie', 'Bulda',
    'Housekeeper', 'Butler', 'Handmaiden', 'Cook',
    'Storyteller 1',
    'Townsperson 1', 'Townsperson 2', 'Townsperson 3', 'Townsperson 6',
    'Hidden Folk Solo 1', 'Hidden Folk Solo 2', 'Hidden Folk Solo 3'
  ];
  cut uuid[];
begin
  select coalesce(array_agg(id), '{}') into cut
  from family_hub.show_roles
  where production_id = kids and name <> all (keep);

  -- The draft board forgets the cut roles; the rest of it is untouched.
  update family_hub.casting_boards b set
    entries = coalesce((
      select jsonb_agg(x) from jsonb_array_elements(b.entries) x
      where not ((x->>'roleId')::uuid = any (cut))), '[]'::jsonb),
    understudy_entries = coalesce((
      select jsonb_agg(x) from jsonb_array_elements(b.understudy_entries) x
      where not ((x->>'roleId')::uuid = any (cut))), '[]'::jsonb)
  where b.production_id = kids;

  -- The breakdown stops calling roles that no longer exist.
  update family_hub.show_scenes s set
    role_ids = coalesce((
      select array_agg(r order by ord) from unnest(s.role_ids) with ordinality as u(r, ord)
      where not (r = any (cut))), '{}'::uuid[])
  where s.production_id = kids and s.role_ids && cut;

  delete from family_hub.show_roles where id = any (cut);

  -- Renumber and rename after the delete so no name collides on the way.
  update family_hub.show_roles set name = 'Townsperson 4'
    where production_id = kids and name = 'Townsperson 6';
  update family_hub.show_roles set
    name = 'Storyteller',
    description = 'Featured pp. 1-4, 10, 12, 15-16, 19-20, 29, 31, 44-46, 52-57. The script writes four Storytellers; with 26 in the cast one carries the track and the Townspeople share the rest of the lines.'
    where production_id = kids and name = 'Storyteller 1';

  with ordered as (
    select id, row_number() over (order by sort_order) as n
    from family_hub.show_roles where production_id = kids)
  update family_hub.show_roles r set sort_order = o.n
  from ordered o where o.id = r.id;
end $$;
