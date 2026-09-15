-- 0088 — A role says who sings it, and how high.
--
-- CJ, 15 Sep 2026, with the MTI Director's Guide open at C6–C7: "Make sure
-- that all of these roles are on the cast list and their gender, featured
-- songs and vocal ranges are available for the casting directors for Frozen
-- Jr. and Frozen Teen — also make sure there are 46 available roles for
-- Frozen Jr. ages 9–12."
--
-- Until now a role was a name, a tier and a description. The casting board
-- draws only the name. So the people casting Elsa could not see, on the
-- board, that she is written for a girl who can sing an E5 — they had the
-- binder open on the table instead. These columns are the binder's two
-- casting pages, row for row: the Primary Storytellers (C6: gender, featured
-- songs, vocal range) and the Featured Roles (C7: gender, sings, speaks,
-- featured pages in the Actor's Script).
--
-- Two casts, one script, so the same facts land on both boards by role
-- name. The Teen board writes the ensemble as "Townsperson 1 / Ensemble";
-- the match is on the prefix.
--
-- ROLES ADDED, so the list is MTI's list: Guards (2) and Townspeople 5–6 on
-- both casts, and Hidden Folk 5–6 on the Junior cast to reach 46 — one
-- named slot for every one of the 46 children enrolled. Each new role is
-- also written into the scenes and numbers its track is called for, copied
-- from the sibling role on the same cast list (a Guard is a Townsperson who
-- is also in Sc. 13). The Teen cast keeps its doublings (Housekeeper on
-- Middle Elsa and so on) — those are the Teen cast list's own design and a
-- 16-child company does not want 34 cards.
--
-- Vocal ranges were read off the staves on C6 by eye. They are text, on
-- purpose: a wrong one is a one-line UPDATE, not a migration.
--
-- Re-runnable, and it must be replayed after 0061: that file deletes and
-- rewrites both casts from the workbook, and the workbook has none of this.

alter table family_hub.show_roles
  add column if not exists gender text
    check (gender is null or gender in ('female', 'male', 'flexible')),
  add column if not exists vocal_range text,
  add column if not exists featured_songs text[],
  add column if not exists sings boolean,
  add column if not exists speaks boolean,
  add column if not exists featured_pages text;

comment on column family_hub.show_roles.gender is
  'MTI casting page: female, male, or flexible ("the gender of the character, including costuming, should align with the gender identity of the actor cast"). Null = the page does not say.';
comment on column family_hub.show_roles.vocal_range is
  'Lowest–highest written pitch, e.g. A3–D5, read off the MTI casting page staff. Text so a correction is an UPDATE.';
comment on column family_hub.show_roles.featured_songs is
  'The numbers the MTI casting page lists against a Primary Storyteller.';
comment on column family_hub.show_roles.featured_pages is
  'Featured page(s) in the Actor''s Script, from the MTI Featured Roles table.';

-- ── 1. The roles MTI lists that the boards did not ──────────────────────────
-- Junior (d7529430): 40 → 46. Teen (fdd3094d): 20 → 25.
insert into family_hub.show_roles (production_id, name, tier, description, capacity, sort_order)
select v.production_id::uuid, v.name, v.tier, v.description, 1, v.sort_order
from (values
  ('d7529430-9df6-4d20-87a2-723f4cd83b94', 'Townsperson 5', 'featured',
   'Ages 9–12. Also plays: Townsperson (Sc.1) — Castle Staff (Sc.4) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Oaken''s Family (Sc.8) — Full company (Sc.14)', 41),
  ('d7529430-9df6-4d20-87a2-723f4cd83b94', 'Townsperson 6', 'featured',
   'Ages 9–12. Also plays: Townsperson (Sc.1) — Castle Staff (Sc.4) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Oaken''s Family (Sc.8) — Full company (Sc.14)', 42),
  ('d7529430-9df6-4d20-87a2-723f4cd83b94', 'Guard 1', 'featured',
   'Ages 10–12. Non-singing, non-speaking. Also plays: Guard (Sc.13, 14) — Townsperson (Sc.1) — Castle Staff (Sc.4) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Full company (Sc.14)', 43),
  ('d7529430-9df6-4d20-87a2-723f4cd83b94', 'Guard 2', 'featured',
   'Ages 10–12. Non-singing, non-speaking. Also plays: Guard (Sc.13, 14) — Townsperson (Sc.1) — Castle Staff (Sc.4) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Full company (Sc.14)', 44),
  ('d7529430-9df6-4d20-87a2-723f4cd83b94', 'Hidden Folk 5', 'featured',
   'Ages 9–12. Hidden Folk solo (p.99-104). Also plays: Townsperson (Sc.1) — Hidden Folk (Sc.2) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Hidden Folk (Sc.12) — Full company (Sc.14)', 45),
  ('d7529430-9df6-4d20-87a2-723f4cd83b94', 'Hidden Folk 6', 'featured',
   'Ages 9–12. Hidden Folk solo (p.99-104). Also plays: Townsperson (Sc.1) — Hidden Folk (Sc.2) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Hidden Folk (Sc.12) — Full company (Sc.14)', 46),
  ('fdd3094d-9f48-4217-bb23-0515266a26d3', 'Townsperson 4 / Ensemble', 'featured',
   'Ages 13–17. Also plays: Townsperson (Sc.1) — Snow Chorus (Sc.2) — Castle Staff (Sc.4) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Snow Chorus (Sc.9) — Hidden Folk (Sc.12) — Full company (Sc.14)', 21),
  ('fdd3094d-9f48-4217-bb23-0515266a26d3', 'Townsperson 5 / Ensemble', 'featured',
   'Ages 13–17. Also plays: Townsperson (Sc.1) — Snow Chorus (Sc.2) — Castle Staff (Sc.4) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Snow Chorus (Sc.9) — Hidden Folk (Sc.12) — Full company (Sc.14)', 22),
  ('fdd3094d-9f48-4217-bb23-0515266a26d3', 'Townsperson 6 / Ensemble', 'featured',
   'Ages 13–17. Also plays: Townsperson (Sc.1) — Snow Chorus (Sc.2) — Castle Staff (Sc.4) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Snow Chorus (Sc.9) — Hidden Folk (Sc.12) — Full company (Sc.14)', 23),
  ('fdd3094d-9f48-4217-bb23-0515266a26d3', 'Guard 1', 'featured',
   'Ages 13–17. Non-singing, non-speaking. Also plays: Guard (Sc.13, 14) — Townsperson (Sc.1) — Castle Staff (Sc.4) — Court (Sc.5) — Ball guest (Sc.6) — Full company (Sc.14)', 24),
  ('fdd3094d-9f48-4217-bb23-0515266a26d3', 'Guard 2', 'featured',
   'Ages 13–17. Non-singing, non-speaking. Also plays: Guard (Sc.13, 14) — Townsperson (Sc.1) — Castle Staff (Sc.4) — Court (Sc.5) — Ball guest (Sc.6) — Full company (Sc.14)', 25)
) as v(production_id, name, tier, description, sort_order)
where not exists (
  select 1 from family_hub.show_roles r
  where r.production_id = v.production_id::uuid and r.name = v.name
);

-- ── 2. Their scenes and numbers, copied from the sibling track ─────────────
-- show_scenes.role_ids is who is called; a new role that is in no scene is a
-- role the rehearsal calendar never calls. Scene rows are matched by
-- sort_order (scenes) and number_no (songs), exactly as 0061 built them.
with tracks (production_id, name, scenes, cues) as (values
  -- Junior: Townspeople 5–6 walk Townsperson 4's track; Guards add Sc.13 / #30
  ('d7529430-9df6-4d20-87a2-723f4cd83b94', 'Townsperson 5', array[1,4,5,6,7,8,14], array[1,10,12,13,18,20,33,34,35,36]),
  ('d7529430-9df6-4d20-87a2-723f4cd83b94', 'Townsperson 6', array[1,4,5,6,7,8,14], array[1,10,12,13,18,20,33,34,35,36]),
  ('d7529430-9df6-4d20-87a2-723f4cd83b94', 'Guard 1',       array[1,4,5,6,7,13,14], array[1,10,12,13,18,30,33,34,35,36]),
  ('d7529430-9df6-4d20-87a2-723f4cd83b94', 'Guard 2',       array[1,4,5,6,7,13,14], array[1,10,12,13,18,30,33,34,35,36]),
  ('d7529430-9df6-4d20-87a2-723f4cd83b94', 'Hidden Folk 5', array[1,2,6,7,12,14], array[1,5,13,18,28,33,34,35,36]),
  ('d7529430-9df6-4d20-87a2-723f4cd83b94', 'Hidden Folk 6', array[1,2,6,7,12,14], array[1,5,13,18,28,33,34,35,36]),
  -- Teen: Townspeople 4–6 walk Townsperson 3's track without the Sc.13 guard
  ('fdd3094d-9f48-4217-bb23-0515266a26d3', 'Townsperson 4 / Ensemble', array[1,2,4,5,6,7,9,12,14], array[1,3,5,10,12,13,18,22,26,28,32,33,34,35,36]),
  ('fdd3094d-9f48-4217-bb23-0515266a26d3', 'Townsperson 5 / Ensemble', array[1,2,4,5,6,7,9,12,14], array[1,3,5,10,12,13,18,22,26,28,32,33,34,35,36]),
  ('fdd3094d-9f48-4217-bb23-0515266a26d3', 'Townsperson 6 / Ensemble', array[1,2,4,5,6,7,9,12,14], array[1,3,5,10,12,13,18,22,26,28,32,33,34,35,36]),
  ('fdd3094d-9f48-4217-bb23-0515266a26d3', 'Guard 1', array[1,4,5,6,13,14], array[1,10,12,13,30,33,34,35,36]),
  ('fdd3094d-9f48-4217-bb23-0515266a26d3', 'Guard 2', array[1,4,5,6,13,14], array[1,10,12,13,30,33,34,35,36])
),
called as (
  select r.id, r.production_id, t.scenes, t.cues
  from tracks t
  join family_hub.show_roles r on r.production_id = t.production_id::uuid and r.name = t.name
)
update family_hub.show_scenes s
   set role_ids = s.role_ids || c.id
  from called c
 where s.production_id = c.production_id
   and not (c.id = any (s.role_ids))
   and case s.kind
         when 'scene' then s.sort_order = any (c.scenes)
         else s.number_no = any (c.cues)
       end;

-- ── 3. C6 — Primary Storytellers: gender, featured songs, vocal range ──────
update family_hub.show_roles r
   set gender = v.gender, vocal_range = v.vocal_range, featured_songs = v.songs,
       sings = true, speaks = (v.name <> 'Sven')
  from (values
    ('Young Anna',  'female', 'A3–D5',  array['Let the Sun Shine On', 'A Little Bit of You', 'Do You Want to Build a Snowman?']),
    ('Middle Anna', 'female', 'A3–D5',  array['Do You Want to Build a Snowman?']),
    ('Anna',        'female', 'A3–D5',  array['For the First Time in Forever', 'Love Is an Open Door', 'For the First Time in Forever (Reprise)', 'Finale (Part 2)']),
    ('Young Elsa',  'female', 'A3–C#5', array['Let the Sun Shine On', 'A Little Bit of You']),
    ('Middle Elsa', 'female', 'A3–C#5', array['Do You Want to Build a Snowman?']),
    ('Elsa',        'female', 'F#3–E5', array['For the First Time in Forever', 'Dangerous to Dream', 'Let It Go', 'For the First Time in Forever (Reprise)', 'Colder by the Minute', 'Finale (Part 2)']),
    ('Hans',        'male',   'A3–D5',  array['Love Is an Open Door']),
    ('Kristoff',    'male',   'A3–D5',  array['Reindeer(s) Are Better Than People', 'Hygge']),
    ('Olaf',        'male',   'F#3–D5', array['In Summer']),
    ('Sven',        'flexible', 'Bb3–D5', array['Reindeer(s) Are Better Than People', 'In Summer'])
  ) as v(name, gender, vocal_range, songs)
 where r.name = v.name
   and r.production_id in ('d7529430-9df6-4d20-87a2-723f4cd83b94', 'fdd3094d-9f48-4217-bb23-0515266a26d3');

-- ── 4. C7 — Featured Roles: gender, sings, speaks, featured pages ──────────
-- Matched on the role name's stem so "Townsperson 3" and "Townsperson 3 /
-- Ensemble" and "Oaken's Family 2" all land.
update family_hub.show_roles r
   set gender = v.gender, sings = v.sings, speaks = v.speaks, featured_pages = v.pages
  from (values
    ('Bishop',          'flexible', false, true,  '23-24, 29, 39, 43'),
    ('Bulda',           'flexible', true,  true,  '16-18, 98-106'),
    ('Butler',          'flexible', true,  true,  '25-26'),
    ('Cook',            'flexible', true,  true,  '25-26'),
    ('Guard',           'flexible', false, false, '111'),
    ('Handmaiden',      'flexible', true,  true,  '25-26'),
    ('Hidden Folk',     'flexible', true,  false, '99-104'),
    ('Housekeeper',     'flexible', true,  true,  '25-26'),
    ('King Agnarr',     'male',     true,  true,  '3-9, 15-19, 21-23'),
    ('Oaken',           'flexible', true,  true,  '71-77'),
    ('Oaken''s Family', 'flexible', true,  true,  '71-73'),
    ('Pabbie',          'flexible', true,  true,  '17-18, 98-106'),
    ('Queen Iduna',     'female',   true,  true,  '3-9, 15-19, 21-23'),
    ('Steward',         'flexible', false, true,  '46'),
    ('Townsperson',     'flexible', true,  true,  '24, 58-59, 88-89, 111-112')
  ) as v(stem, gender, sings, speaks, pages)
 where r.production_id in ('d7529430-9df6-4d20-87a2-723f4cd83b94', 'fdd3094d-9f48-4217-bb23-0515266a26d3')
   and (r.name = v.stem or r.name ~ ('^' || v.stem || ' [0-9]+'));

-- Not on C6 or C7 as given (Weselton, the Snow Chorus corps): left null, so
-- the board says nothing rather than something made up.
