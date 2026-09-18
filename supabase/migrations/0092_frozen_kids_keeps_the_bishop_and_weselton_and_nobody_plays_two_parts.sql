-- 0092 — Frozen KIDS keeps the Bishop and Weselton, and nobody plays two parts.
--
-- CJ, 18 Sep 2026, minutes after 0091: "put bishop and wesleton back instead
-- of townsperson we will give out those later" and "do not allow students to
-- take two roles - so give brooklyn young ann and lorelai queen iduna".
--
-- 0091 cut the KIDS list to the 26 roles the draft board used, which let
-- four numbered Townsperson solos outrank two named characters. CJ wants
-- the characters: Bishop and Weselton come back exactly as 0062 wrote them
-- (description, tier, and the sections and cues their tracks are called
-- for), and Townsperson 3 and 4 go, so the list is still 26. The two
-- returning roles are left open on purpose — "we will give out those later".
--
-- The board: Brooklyn Tucker keeps Young Anna and loses Housekeeper;
-- Lorelai Musson keeps Queen Iduna and loses Pabbie. Callie Schulman and
-- Ruth Thompson lose their Townsperson solos with the roles. That leaves
-- four roles open (Bishop, Weselton, Housekeeper, Pabbie) and four students
-- unplaced (Allegra Lehr, Anabelle Weiner, Callie Schulman, Ruth Thompson)
-- — one each, for CJ to hand out on the board.
--
-- "Do not allow two roles" is a rule about the board's right-click "add a
-- 2nd part" (0052), which the staff portal offers on every show; this file
-- only makes the KIDS board obey it today. A per-show switch is a portal
-- change, not a migration.
--
-- Still nothing published, nothing assigned; no family sees a change.
--
-- Safe to re-run.
set search_path = family_hub, public;

do $$
declare
  kids constant uuid := 'a107b67d-df92-4dd6-87d7-17e04455fa2b';
  cut uuid[];
  drop_pairs constant jsonb := '[
    {"role": "Housekeeper", "student": "864dfe5f-d882-4c30-b64e-dce5fd718405"},
    {"role": "Pabbie",      "student": "c7a6eff6-6e72-4692-82f0-07ecd6dd17b9"}
  ]'::jsonb;
  bishop uuid;
  weselton uuid;
begin
  -- Townsperson 3 and 4 go, and their board entries with them.
  select coalesce(array_agg(id), '{}') into cut
  from family_hub.show_roles
  where production_id = kids and name in ('Townsperson 3', 'Townsperson 4');

  update family_hub.show_scenes s set
    role_ids = coalesce((
      select array_agg(r order by ord) from unnest(s.role_ids) with ordinality as u(r, ord)
      where not (r = any (cut))), '{}'::uuid[])
  where s.production_id = kids and s.role_ids && cut;

  delete from family_hub.show_roles where id = any (cut);

  -- Bishop and Weselton return, word for word from 0062, in 0062's place —
  -- after Bulda, before the Castle Staff — and their tracks are written back
  -- into the sections and numbers 0062 called them for.
  update family_hub.show_roles set sort_order = sort_order + 2
  where production_id = kids and sort_order >= 15;

  insert into family_hub.show_roles
    (production_id, name, tier, description, capacity, sort_order, gender, sings, speaks, featured_pages)
  select kids, v.name, 'featured', v.description, 1, v.sort_order, v.gender, v.sings, v.speaks, v.pages
  from (values
    ('Bishop',   'Featured pp. 15, 21-22. Speaking role. Formal and serious.', 15, 'flexible', false, true, '15, 21-22'),
    ('Weselton', 'Featured pp. 20-54. Over-the-top comedy.',                   16, null,       null,  null, '20-54')
  ) as v(name, description, sort_order, gender, sings, speaks, pages)
  where not exists (
    select 1 from family_hub.show_roles r where r.production_id = kids and r.name = v.name);

  select id into bishop   from family_hub.show_roles where production_id = kids and name = 'Bishop';
  select id into weselton from family_hub.show_roles where production_id = kids and name = 'Weselton';

  update family_hub.show_scenes s set role_ids = s.role_ids || bishop
  where s.production_id = kids and not (bishop = any (s.role_ids))
    and ((s.kind = 'scene' and s.sort_order in (6, 9, 20, 21))
      or (s.kind = 'song' and s.number_no in (11, 26, 27)));

  update family_hub.show_scenes s set role_ids = s.role_ids || weselton
  where s.production_id = kids and not (weselton = any (s.role_ids))
    and ((s.kind = 'scene' and s.sort_order in (8, 9, 11, 15, 20, 21))
      or (s.kind = 'song' and s.number_no in (11, 26, 27)));

  -- Housekeeper, Butler, Handmaiden, Cook, Storyteller, Townsperson 1-2,
  -- Hidden Folk Solo 1-3 slide down behind the two returning roles.
  with ordered as (
    select id, row_number() over (order by sort_order, name) as n
    from family_hub.show_roles where production_id = kids)
  update family_hub.show_roles r set sort_order = o.n
  from ordered o where o.id = r.id;

  -- Nobody plays two parts: the second parts come off the board.
  update family_hub.casting_boards b set
    entries = coalesce((
      select jsonb_agg(x) from jsonb_array_elements(b.entries) x
      where not ((x->>'roleId')::uuid = any (cut))
        and not exists (
          select 1 from jsonb_array_elements(drop_pairs) d
          join family_hub.show_roles r on r.production_id = kids and r.name = d->>'role'
          where r.id = (x->>'roleId')::uuid and (d->>'student')::uuid = (x->>'studentId')::uuid)),
      '[]'::jsonb)
  where b.production_id = kids;
end $$;
