-- Disney's FROZEN JR., twice: one script, two casts, two curriculums.
--
-- Tony, 2 Sep 2026: "the FROZEN curriculum page for the ages 9-12 and 12-17
-- groups should be two different curriculums". They share the MTI Broadway
-- Junior script — 14 scenes, 37 cues, 124 pages — and nothing else. The Junior
-- cast is 40 roles rehearsing Tuesdays for 90 minutes and opens 29 Jan 2027;
-- the Broadway Bound Teen cast is 20 roles rehearsing Wednesdays for 120 and
-- opens 5 Feb 2027. So the scene and number rows are written once per
-- production, not shared: what differs is who is in them.
--
-- Source of every row below: the "Disney's FROZEN JR. | Production Curriculum"
-- workbook (Scene & Staging Track, Music Track, Character Breakdown, JR Cast
-- List (40), TEEN Cast List (20)), read 2 Sep 2026.
--
-- role_ids come from each cast list's own Scenes and Musical numbers columns,
-- which is the per-cast authority — a Junior Bishop and a Teen Bishop are not
-- called to the same nights. `characters` stays the Director's own wording
-- from the Scene & Staging Track, exactly as Sweeney's rows do: the text is
-- what a parent reads, the ids are what the filter matches.
--
-- Re-runnable: each cast's rows are deleted and rewritten, so a corrected
-- workbook can be replayed. Nothing here touches casting_assignments — who
-- plays what is still the Director's to publish.

update family_hub.productions set
  venue = 'Loudoun Auditorium, National Conference Center, Leesburg VA',
  opens_on = date '2027-01-29',
  closes_on = date '2027-01-30',
  curriculum_url = 'https://docs.google.com/spreadsheets/d/1TqYUXO1jjI3EBzSKwwGPLDLTRgYpDXTcR_TIV_ZmBjw/edit'
where id = 'd7529430-9df6-4d20-87a2-723f4cd83b94';

update family_hub.productions set
  venue = 'Loudoun Auditorium, National Conference Center, Leesburg VA',
  opens_on = date '2027-02-05',
  closes_on = date '2027-02-06',
  curriculum_url = 'https://docs.google.com/spreadsheets/d/1TqYUXO1jjI3EBzSKwwGPLDLTRgYpDXTcR_TIV_ZmBjw/edit'
where id = 'fdd3094d-9f48-4217-bb23-0515266a26d3';

-- ── Junior cast, ages 9-12 — 40 roles ──
delete from family_hub.show_scenes where production_id = 'd7529430-9df6-4d20-87a2-723f4cd83b94';
delete from family_hub.show_roles where production_id = 'd7529430-9df6-4d20-87a2-723f4cd83b94';

insert into family_hub.show_roles
  (production_id, name, tier, description, capacity, sort_order)
select 'd7529430-9df6-4d20-87a2-723f4cd83b94', v.name, v.tier, v.description, 1, v.sort_order
from (values
  ('Anna', 'lead', 'Princess of Arendelle. Spirited, lonely, relentlessly hopeful. Ages 11–12. No doubling. Onstage almost continuously from Scene 4.', 1),
  ('Elsa', 'lead', 'Princess, later Queen, with magic she fears. Ages 11–12. No doubling. Vocally the heaviest track in the show.', 2),
  ('Kristoff', 'lead', 'Ice harvester. Prickly exterior, big heart. Ages 11–12. No doubling.', 3),
  ('Olaf', 'lead', 'Magical snowman who dreams of summer. Ages 10–12. No doubling.', 4),
  ('Hans', 'lead', 'Prince of the Southern Isles. Charming, then not. Ages 11–12. No doubling.', 5),
  ('Sven', 'lead', 'Kristoff''s reindeer. Non-speaking, understood only by Kristoff. Ages 10–12. No doubling. Non-speaking; the most physically demanding track in the show.', 6),
  ('Snow Chorus 1', 'featured', 'Ages 10–12. Also plays: Townsperson (Sc.1) — Snow Chorus (Sc.2) — Townsperson (Sc.4) — Ball guest (Sc.6) — Snow Chorus (Sc.9) — Full company (Sc.14)', 7),
  ('Snow Chorus 2', 'featured', 'Ages 10–12. Also plays: Townsperson (Sc.1) — Snow Chorus (Sc.2) — Townsperson (Sc.4) — Ball guest (Sc.6) — Snow Chorus (Sc.9) — Full company (Sc.14)', 8),
  ('Snow Chorus 3', 'featured', 'Ages 10–12. Also plays: Townsperson (Sc.1) — Snow Chorus (Sc.2) — Townsperson (Sc.4) — Ball guest (Sc.6) — Snow Chorus (Sc.9) — Full company (Sc.14)', 9),
  ('Snow Chorus 4', 'featured', 'Ages 10–12. Also plays: Townsperson (Sc.1) — Snow Chorus (Sc.2) — Townsperson (Sc.4) — Ball guest (Sc.6) — Snow Chorus (Sc.9) — Full company (Sc.14)', 10),
  ('Snow Chorus 5', 'featured', 'Ages 10–12. Also plays: Townsperson (Sc.1) — Snow Chorus (Sc.2) — Townsperson (Sc.4) — Ball guest (Sc.6) — Snow Chorus (Sc.9) — Full company (Sc.14)', 11),
  ('Snow Chorus 6', 'featured', 'Ages 10–12. Also plays: Townsperson (Sc.1) — Snow Chorus (Sc.2) — Townsperson (Sc.4) — Ball guest (Sc.6) — Snow Chorus (Sc.9) — Full company (Sc.14)', 12),
  ('Young Anna', 'supporting', 'Anna as a child, Scenes 1-3. Ages 9–10. Also plays: Townsperson (Sc.1) — Court (Sc.5) — Summer Chorus (Sc.7) — Oaken''s Family (Sc.8) — Hidden Folk (Sc.12) — Full company (Sc.14)', 13),
  ('Young Elsa', 'supporting', 'Elsa as a child, Scenes 1-3. Ages 9–10. Also plays: Townsperson (Sc.1) — Court (Sc.5) — Summer Chorus (Sc.7) — Oaken''s Family (Sc.8) — Hidden Folk (Sc.12) — Full company (Sc.14)', 14),
  ('Middle Anna', 'supporting', 'Anna in the years behind the closed door. Ages 10–11. Also plays: Townsperson (Sc.1) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Hidden Folk (Sc.12) — Full company (Sc.14)', 15),
  ('Middle Elsa', 'featured', 'Elsa in the years behind the closed door. Ages 10–11. Also plays: Townsperson (Sc.1) — Castle Staff (Sc.4) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Full company (Sc.14)', 16),
  ('King Agnarr', 'featured', 'King of Arendelle. Protective father. Ages 11–12. Also plays: Guard (Sc.13, 14) — Townsperson (Sc.1) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Hidden Folk (Sc.12) — Full company (Sc.14)', 17),
  ('Queen Iduna', 'featured', 'Queen of Arendelle, descendant of the Northern Nomads. Ages 11–12. Also plays: Townsperson (Sc.1) — Hidden Folk (Sc.2) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Hidden Folk (Sc.12) — Full company (Sc.14)', 18),
  ('Pabbie', 'supporting', 'Mystical leader of the Hidden Folk. Kristoff''s adoptive father. Ages 11–12. Also plays: Townsperson (Sc.1) — Hidden Folk (Sc.2) — Court (Sc.5) — Ball guest (Sc.6) — Hidden Folk (Sc.12) — Full company (Sc.14)', 19),
  ('Bulda', 'supporting', 'Mystical leader of the Hidden Folk. Kristoff''s adoptive mother. Ages 11–12. Also plays: Townsperson (Sc.1) — Hidden Folk (Sc.2) — Court (Sc.5) — Ball guest (Sc.6) — Oaken''s Family (Sc.8) — Hidden Folk (Sc.12) — Full company (Sc.14)', 20),
  ('Bishop', 'featured', 'Bishop of Arendelle, oversees the succession. Ages 11–12. Also plays: Townsperson (Sc.1) — Court (Sc.5) — Ball guest (Sc.6) — Oaken''s Family (Sc.8) — Hidden Folk (Sc.12) — Full company (Sc.14)', 21),
  ('Weselton', 'supporting', 'Impolite, judgmental Duke from a neighboring kingdom. Ages 10–12. Also plays: Townsperson (Sc.1) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Oaken''s Family (Sc.8) — Full company (Sc.14)', 22),
  ('Oaken', 'supporting', 'Wandering salesperson, advocate of hygge. Ages 10–12. Also plays: Townsperson (Sc.1) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Oaken''s Family (Sc.8) — Hidden Folk (Sc.12) — Full company (Sc.14)', 23),
  ('Housekeeper', 'featured', 'Palace household — a named featured line on p.25-26. Ages 10–12. Also plays: Townsperson (Sc.1) — Castle Staff (Sc.4) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Full company (Sc.14)', 24),
  ('Butler', 'featured', 'Palace household — a named featured line on p.25-26. Ages 10–12. Also plays: Guard (Sc.13, 14) — Townsperson (Sc.1) — Castle Staff (Sc.4) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Full company (Sc.14)', 25),
  ('Handmaiden', 'featured', 'Palace household — a named featured line on p.25-26. Ages 10–12. Also plays: Townsperson (Sc.1) — Castle Staff (Sc.4) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Oaken''s Family (Sc.8) — Full company (Sc.14)', 26),
  ('Cook', 'featured', 'Palace household — a named featured line on p.25-26. Ages 10–12. Also plays: Townsperson (Sc.1) — Castle Staff (Sc.4) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Oaken''s Family (Sc.8) — Full company (Sc.14)', 27),
  ('Steward', 'featured', 'Palace household — a named featured line, spoken in Scene 6. Ages 10–12. Also plays: Townsperson (Sc.1) — Castle Staff (Sc.4) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Full company (Sc.14)', 28),
  ('Townsperson 1', 'featured', 'Ages 9–12. Also plays: Line: "No!" (p.111) — Townsperson (Sc.1) — Castle Staff (Sc.4) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Oaken''s Family (Sc.8) — Full company (Sc.14)', 29),
  ('Townsperson 2', 'featured', 'Ages 9–12. Also plays: Line: "By her own sister?!" (p.111) — Townsperson (Sc.1) — Castle Staff (Sc.4) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Oaken''s Family (Sc.8) — Full company (Sc.14)', 30),
  ('Townsperson 3', 'featured', 'Ages 9–12. Also plays: Line: "How can this be?" (p.111) — Townsperson (Sc.1) — Castle Staff (Sc.4) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Oaken''s Family (Sc.8) — Full company (Sc.14)', 31),
  ('Townsperson 4', 'featured', 'Ages 9–12. Also plays: Gasp cue (p.111) — Townsperson (Sc.1) — Castle Staff (Sc.4) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Oaken''s Family (Sc.8) — Full company (Sc.14)', 32),
  ('Hidden Folk 1', 'featured', 'Ages 9–12. Also plays: Lines: "Kristoff!" (p.99) and "Goodbye!" (p.106) — Townsperson (Sc.1) — Hidden Folk (Sc.2) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Hidden Folk (Sc.12) — Full company (Sc.14)', 33),
  ('Hidden Folk 2', 'featured', 'Ages 9–12. Also plays: Lines: "Hello!" (p.99) and "Take care, Kristoff!" (p.106) — Townsperson (Sc.1) — Hidden Folk (Sc.2) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Hidden Folk (Sc.12) — Full company (Sc.14)', 34),
  ('Hidden Folk 3', 'featured', 'Ages 9–12. Also plays: Lines: "Hi!" (p.99) and "Be safe!" (p.106) — Townsperson (Sc.1) — Hidden Folk (Sc.2) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Hidden Folk (Sc.12) — Full company (Sc.14)', 35),
  ('Hidden Folk 4', 'ensemble', 'Ages 9–12. Also plays: Townsperson (Sc.1) — Hidden Folk (Sc.2) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Hidden Folk (Sc.12) — Full company (Sc.14)', 36),
  ('Oaken''s Family 1', 'featured', 'Ages 9–12. Also plays: Townsperson (Sc.1) — Castle Staff (Sc.4) — Ball guest (Sc.6) — Oaken''s Family (Sc.8) — Hidden Folk (Sc.12) — Full company (Sc.14)', 37),
  ('Oaken''s Family 2', 'featured', 'Ages 9–12. Also plays: Townsperson (Sc.1) — Castle Staff (Sc.4) — Ball guest (Sc.6) — Oaken''s Family (Sc.8) — Hidden Folk (Sc.12) — Full company (Sc.14)', 38),
  ('Oaken''s Family 3', 'featured', 'Ages 9–12. Also plays: Guard (Sc.13, 14) — Townsperson (Sc.1) — Castle Staff (Sc.4) — Ball guest (Sc.6) — Oaken''s Family (Sc.8) — Hidden Folk (Sc.12) — Full company (Sc.14)', 39),
  ('Oaken''s Family 4', 'featured', 'Ages 9–12. Also plays: Townsperson (Sc.1) — Castle Staff (Sc.4) — Ball guest (Sc.6) — Oaken''s Family (Sc.8) — Hidden Folk (Sc.12) — Full company (Sc.14)', 40)
) as v(name, tier, description, sort_order);

-- Every actor's track, straight off the cast list: the scenes they are in and
-- the numbers they sing. Inverting it here rather than in the rows below is
-- what keeps this file readable — and what makes a correction a one-line edit.
with tracks (name, scenes, cues) as (values
  ('Anna', array[4,6,7,8,9,11,12,13,14], array[10,14,17,18,25,28,33,34,35,36]),
  ('Elsa', array[5,6,9,11,13,14], array[10,12,22,25,33,34,35,36]),
  ('Kristoff', array[4,7,8,9,11,12,13,14], array[16,17,27,28,33,34,35,36]),
  ('Olaf', array[7,8,11,12,13,14], array[17,18,28,33,34,35,36]),
  ('Hans', array[4,6,10,11,13,14], array[14,33,34,35,36]),
  ('Sven', array[4,7,11,12,13,14], array[16,28,33,34,35,36]),
  ('Snow Chorus 1', array[1,2,4,6,9,14], array[1,3,10,13,22,26,32,33,34,35,36]),
  ('Snow Chorus 2', array[1,2,4,6,9,14], array[1,3,10,13,22,26,32,33,34,35,36]),
  ('Snow Chorus 3', array[1,2,4,6,9,14], array[1,3,10,13,22,26,32,33,34,35,36]),
  ('Snow Chorus 4', array[1,2,4,6,9,14], array[1,3,10,13,22,26,32,33,34,35,36]),
  ('Snow Chorus 5', array[1,2,4,6,9,14], array[1,3,10,13,22,26,32,33,34,35,36]),
  ('Snow Chorus 6', array[1,2,4,6,9,14], array[1,3,10,13,22,26,32,33,34,35,36]),
  ('Young Anna', array[1,2,3,5,7,8,12,14], array[1,4,8,12,18,20,28,33,34,35,36]),
  ('Young Elsa', array[1,2,3,5,7,8,12,14], array[1,4,8,12,18,20,28,33,34,35,36]),
  ('Middle Anna', array[1,3,5,6,7,12,14], array[1,8,12,13,18,28,33,34,35,36]),
  ('Middle Elsa', array[1,3,4,5,6,7,14], array[1,9,10,12,13,18,33,34,35,36]),
  ('King Agnarr', array[1,2,3,5,6,7,12,13,14], array[1,4,12,13,18,28,30,33,34,35,36]),
  ('Queen Iduna', array[1,2,3,5,6,7,12,14], array[1,4,5,12,13,18,28,33,34,35,36]),
  ('Pabbie', array[1,2,5,6,12,14], array[1,5,6,12,13,28,29,33,34,35,36]),
  ('Bulda', array[1,2,5,6,8,12,14], array[1,5,12,13,20,28,33,34,35,36]),
  ('Bishop', array[1,3,5,6,8,12,14], array[1,12,13,20,28,33,34,35,36]),
  ('Weselton', array[1,5,6,7,8,10,11,13,14], array[1,12,13,18,20,33,34,35,36]),
  ('Oaken', array[1,5,6,7,8,12,14], array[1,12,13,18,20,21,28,33,34,35,36]),
  ('Housekeeper', array[1,4,5,6,7,14], array[1,10,12,13,18,33,34,35,36]),
  ('Butler', array[1,4,5,6,7,13,14], array[1,10,12,13,18,30,33,34,35,36]),
  ('Handmaiden', array[1,4,5,6,7,8,14], array[1,10,12,13,18,20,33,34,35,36]),
  ('Cook', array[1,4,5,6,7,8,14], array[1,10,12,13,18,20,33,34,35,36]),
  ('Steward', array[1,4,5,6,7,14], array[1,10,12,13,18,33,34,35,36]),
  ('Townsperson 1', array[1,4,5,6,7,8,14], array[1,10,12,13,18,20,33,34,35,36]),
  ('Townsperson 2', array[1,4,5,6,7,8,14], array[1,10,12,13,18,20,33,34,35,36]),
  ('Townsperson 3', array[1,4,5,6,7,8,14], array[1,10,12,13,18,20,33,34,35,36]),
  ('Townsperson 4', array[1,4,5,6,7,8,14], array[1,10,12,13,18,20,33,34,35,36]),
  ('Hidden Folk 1', array[1,2,6,7,12,14], array[1,5,13,18,28,33,34,35,36]),
  ('Hidden Folk 2', array[1,2,6,7,12,14], array[1,5,13,18,28,33,34,35,36]),
  ('Hidden Folk 3', array[1,2,6,7,12,14], array[1,5,13,18,28,33,34,35,36]),
  ('Hidden Folk 4', array[1,2,6,7,12,14], array[1,5,13,18,28,33,34,35,36]),
  ('Oaken''s Family 1', array[1,4,6,8,12,14], array[1,10,13,20,21,28,33,34,35,36]),
  ('Oaken''s Family 2', array[1,4,6,8,12,14], array[1,10,13,20,21,28,33,34,35,36]),
  ('Oaken''s Family 3', array[1,4,6,8,12,13,14], array[1,10,13,20,21,28,30,33,34,35,36]),
  ('Oaken''s Family 4', array[1,4,6,8,12,14], array[1,10,13,20,21,28,33,34,35,36])
),
called as (
  select r.id, r.sort_order, t.scenes, t.cues
  from family_hub.show_roles r
  join tracks t on t.name = r.name
  where r.production_id = 'd7529430-9df6-4d20-87a2-723f4cd83b94'
)
insert into family_hub.show_scenes
  (production_id, kind, sort_order, label, name, setting, numbers, characters,
   number_no, from_page, to_page, role_ids)
select 'd7529430-9df6-4d20-87a2-723f4cd83b94', v.kind, v.sort_order, v.label, v.name, v.setting, v.numbers,
       v.characters, v.number_no, v.from_page, v.to_page,
       coalesce((
         select array_agg(c.id order by c.sort_order)
         from called c
         where case v.kind
                 when 'scene' then v.sort_order = any (c.scenes)
                 else v.number_no = any (c.cues)
               end
       ), '{}'::uuid[])
from (values
  ('scene', 1, 'Sc. 1', 'Sc. 1 — Summer Festival', 'Summer Festival', '#1 Let the Sun Shine On · #2 Playoff', 'Young Anna, Young Elsa, Agnarr, Iduna, Townspeople', null, 1, 8),
  ('scene', 2, 'Sc. 2', 'Sc. 2 — Castle Interior', 'Castle Interior', '#3 Elsa and Anna · #4 A Little Bit of You · #5 First Joik · #6 Magic Removal', 'Young Anna, Young Elsa, Agnarr, Iduna, Snow Chorus, Pabbie, Bulda', null, 9, 18),
  ('scene', 3, 'Sc. 3', 'Sc. 3 — Castle Interior, A Few Months Later', 'Castle Interior, A Few Months Later', '#7 Transition to Snowman · #8 Do You Want to Build a Snowman?', 'Young Anna, Middle Anna, Young Elsa, Middle Elsa, Agnarr, Iduna, Bishop', null, 19, 24),
  ('scene', 4, 'Sc. 4', 'Sc. 4 — Castle Interior, Three Years Later', 'Castle Interior, Three Years Later', '#9 Coronation Day · #10 For the First Time in Forever · #11 Playoff', 'Middle Elsa, Anna, Townspeople, Castle Staff, Bishop, Kristoff, Sven, Hans', null, 25, 39),
  ('scene', 5, 'Sc. 5', 'Sc. 5 — Castle Interior, Coronation Ceremony', 'Castle Interior, Coronation Ceremony', '#12 Dangerous to Dream', 'Elsa, Bishop, Townspeople', null, 40, 44),
  ('scene', 6, 'Sc. 6', 'Sc. 6 — Castle Interior, Coronation Ball', 'Castle Interior, Coronation Ball', '#13 Coronation Ball · #14 Love Is an Open Door · #15 Elsa Flees', 'Anna, Elsa, Hans, Weselton, Steward', null, 45, 59),
  ('scene', 7, 'Sc. 7', 'Sc. 7 — Snowy Mountainside', 'Snowy Mountainside', '#16 Reindeer(s) Are Better Than People · #17 You''re Hired · #18 In Summer · #19 Playoff', 'Anna, Kristoff, Sven, Olaf, Summer Chorus', null, 60, 69),
  ('scene', 8, 'Sc. 8', 'Sc. 8 — Wandering Oaken''s', 'Wandering Oaken''s', '#20 Hygge · #21 Covered in Snow', 'Anna, Kristoff, Olaf, Oaken, Oaken''s Family', null, 70, 77),
  ('scene', 9, 'Sc. 9', 'Sc. 9 — North Mountain', 'North Mountain', '#22 Let It Go', 'Elsa, Anna, Kristoff, Snow Chorus', null, 78, 87),
  ('scene', 10, 'Sc. 10', 'Sc. 10 — Mountain Path', 'Mountain Path', '#23 The Search Party', 'Hans, Weselton', null, 88, 88),
  ('scene', 11, 'Sc. 11', 'Sc. 11 — Elsa''s Palace', 'Elsa''s Palace', '#24 This · #25 For the First Time in Forever (Reprise) · #26 Mountain Fall', 'Anna, Elsa, Kristoff, Olaf, Hans, Weselton, Sven', null, 89, 96),
  ('scene', 12, 'Sc. 12', 'Sc. 12 — Foot of the Mountain', 'Foot of the Mountain', '#27 Kristoff''s Joik · #28 Fixer Upper · #29 An Act of True Love', 'Anna, Kristoff, Olaf, Sven, Pabbie, Bulda, Hidden Folk', null, 97, 106),
  ('scene', 13, 'Sc. 13', 'Sc. 13 — Castle Interior', 'Castle Interior', '#30 Elsa Is Captured · #31 Anna and Olaf', 'Anna, Elsa, Hans, Weselton, Kristoff, Sven, Olaf', null, 107, 110),
  ('scene', 14, 'Sc. 14', 'Sc. 14 — Castle Exterior', 'Castle Exterior', '#32 Transition · #33 Colder by the Minute · #34 Finale Pt 1 · #35 Finale Pt 2 · #36 Bows', 'Full Company', null, 111, 124),
  ('song', 101, null, '1. Let the Sun Shine On', null, null, 'Townspeople / Full Company', 1, 1, 1),
  ('song', 102, null, '2. Let the Sun Shine On - Playoff', null, null, 'Orchestra / Company', 2, 8, 8),
  ('song', 103, null, '3. Elsa and Anna', null, null, 'Underscore', 3, 9, 9),
  ('song', 104, null, '4. A Little Bit of You', null, null, 'Young Anna, Young Elsa, Snow Chorus', 4, 9, 9),
  ('song', 105, null, '5. First Joik', null, null, 'Pabbie, Bulda, Hidden Folk', 5, 16, 16),
  ('song', 106, null, '6. Magic Removal', null, null, 'Pabbie / Underscore', 6, 17, 17),
  ('song', 107, null, '7. Transition to Snowman', null, null, 'Orchestra', 7, 19, 19),
  ('song', 108, null, '8. Do You Want to Build a Snowman?', null, null, 'Young Anna, Middle Anna, Anna', 8, 19, 19),
  ('song', 109, null, '9. Coronation Day', null, null, 'Company underscore', 9, 25, 25),
  ('song', 110, null, '10. For the First Time in Forever', null, null, 'Anna, Elsa, Castle Staff, Townspeople', 10, 25, 25),
  ('song', 111, null, '11. For the First Time in Forever - Playoff', null, null, 'Orchestra', 11, 37, 37),
  ('song', 112, null, '12. Dangerous to Dream', null, null, 'Elsa, Bishop, Townspeople', 12, 39, 39),
  ('song', 113, null, '13. Coronation Ball', null, null, 'Orchestra / Company', 13, 45, 45),
  ('song', 114, null, '14. Love Is an Open Door', null, null, 'Anna, Hans', 14, 49, 49),
  ('song', 115, null, '15. Elsa Flees', null, null, 'Orchestra', 15, 58, 58),
  ('song', 116, null, '16. Reindeer(s) Are Better Than People', null, null, 'Kristoff, Sven', 16, 60, 60),
  ('song', 117, null, '17. You''re Hired', null, null, 'Anna, Kristoff, Olaf', 17, 63, 63),
  ('song', 118, null, '18. In Summer', null, null, 'Olaf, Summer Chorus', 18, 65, 65),
  ('song', 119, null, '19. In Summer - Playoff', null, null, 'Orchestra', 19, 70, 70),
  ('song', 120, null, '20. Hygge', null, null, 'Oaken, Oaken''s Family, Anna, Kristoff, Olaf', 20, 72, 72),
  ('song', 121, null, '21. Covered in Snow', null, null, 'Orchestra', 21, 77, 77),
  ('song', 122, null, '22. Let It Go', null, null, 'Elsa, Snow Chorus', 22, 78, 78),
  ('song', 123, null, '23. The Search Party', null, null, 'Orchestra', 23, 88, 88),
  ('song', 124, null, '24. This', null, null, 'Orchestra', 24, 89, 89),
  ('song', 125, null, '25. For the First Time in Forever (Reprise)', null, null, 'Anna, Elsa', 25, 91, 91),
  ('song', 126, null, '26. Mountain Fall', null, null, 'Orchestra / Snow Chorus', 26, 96, 96),
  ('song', 127, null, '27. Kristoff''s Joik', null, null, 'Kristoff', 27, 97, 97),
  ('song', 128, null, '28. Fixer Upper', null, null, 'Bulda, Pabbie, Hidden Folk', 28, 99, 99),
  ('song', 129, null, '29. An Act of True Love', null, null, 'Orchestra', 29, 105, 105),
  ('song', 130, null, '30. Elsa Is Captured', null, null, 'Orchestra', 30, 107, 107),
  ('song', 131, null, '31. Anna and Olaf', null, null, 'Orchestra', 31, 109, 109),
  ('song', 132, null, '32. Transition to Castle', null, null, 'Orchestra', 32, 111, 111),
  ('song', 133, null, '33. Colder by the Minute', null, null, 'Full Company', 33, 111, 111),
  ('song', 134, null, '34. Finale - Part 1', null, null, 'Anna, Elsa, Company', 34, 116, 116),
  ('song', 135, null, '35. Finale - Part 2', null, null, 'Full Company', 35, 119, 119),
  ('song', 136, null, '36. Bows', null, null, 'Full Company', 36, 123, 123),
  ('song', 137, null, '37. Exit Music', null, null, 'Orchestra', 37, 124, 124)
) as v(kind, sort_order, label, name, setting, numbers, characters,
       number_no, from_page, to_page);

-- ── Broadway Bound Teen cast, ages 12-17 — 20 roles ──
delete from family_hub.show_scenes where production_id = 'fdd3094d-9f48-4217-bb23-0515266a26d3';
delete from family_hub.show_roles where production_id = 'fdd3094d-9f48-4217-bb23-0515266a26d3';

insert into family_hub.show_roles
  (production_id, name, tier, description, capacity, sort_order)
select 'fdd3094d-9f48-4217-bb23-0515266a26d3', v.name, v.tier, v.description, 1, v.sort_order
from (values
  ('Anna', 'lead', 'Princess of Arendelle. Spirited, lonely, relentlessly hopeful. Ages 15–17. No doubling. Onstage almost continuously from Scene 4.', 1),
  ('Elsa', 'lead', 'Princess, later Queen, with magic she fears. Ages 15–17. No doubling. Vocally the heaviest track in the show.', 2),
  ('Kristoff', 'lead', 'Ice harvester. Prickly exterior, big heart. Ages 15–17. No doubling.', 3),
  ('Olaf', 'lead', 'Magical snowman who dreams of summer. Ages 13–17. No doubling.', 4),
  ('Hans', 'lead', 'Prince of the Southern Isles. Charming, then not. Ages 15–17. No doubling.', 5),
  ('Sven', 'lead', 'Kristoff''s reindeer. Non-speaking, understood only by Kristoff. Ages 13–17. No doubling. Non-speaking; the most physically demanding track in the show.', 6),
  ('Middle Anna', 'supporting', 'Anna in the years behind the closed door. Ages 13–15. Also plays: Handmaiden (Sc.4) — Townsperson (Sc.1) — Snow Chorus (Sc.2) — Castle Staff (Sc.4) — Court (Sc.5) — Snow Chorus (Sc.9) — Full company (Sc.14)', 7),
  ('Middle Elsa', 'featured', 'Elsa in the years behind the closed door. Ages 13–15. Also plays: Housekeeper (Sc.4) — Townsperson (Sc.1) — Snow Chorus (Sc.2) — Castle Staff (Sc.4) — Court (Sc.5) — Snow Chorus (Sc.9) — Full company (Sc.14)', 8),
  ('Townsperson 1 / Ensemble', 'featured', 'Ages 13–17. Also plays: Line: "No!" (p.111) — Hidden Folk 1, "Kristoff!" / "Goodbye!" — Guard (Sc.13, 14) — Townsperson (Sc.1) — Snow Chorus (Sc.2) — Castle Staff (Sc.4) — Court (Sc.5) — Ball guest (Sc.6) — Oaken''s Family (Sc.8) — Snow Chorus (Sc.9) — Hidden Folk (Sc.12) — Full company (Sc.14)', 9),
  ('Townsperson 2 / Ensemble', 'featured', 'Ages 13–17. Also plays: Line: "By her own sister?!" (p.111) — Hidden Folk 2, "Hello!" / "Take care, Kristoff!" — Guard (Sc.13, 14) — Townsperson (Sc.1) — Snow Chorus (Sc.2) — Castle Staff (Sc.4) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Snow Chorus (Sc.9) — Hidden Folk (Sc.12) — Full company (Sc.14)', 10),
  ('Townsperson 3 / Ensemble', 'featured', 'Ages 13–17. Also plays: Snow Chorus Lead — Line: "How can this be?" (p.111) — Hidden Folk 3, "Hi!" / "Be safe!" — Guard (Sc.13, 14) — Townsperson (Sc.1) — Snow Chorus (Sc.2) — Castle Staff (Sc.4) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Snow Chorus (Sc.9) — Hidden Folk (Sc.12) — Full company (Sc.14)', 11),
  ('Young Anna', 'supporting', 'Anna as a child, Scenes 1-3. Ages 13–14. Also plays: Steward (Sc.6) — Townsperson (Sc.1) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Oaken''s Family (Sc.8) — Hidden Folk (Sc.12) — Full company (Sc.14)', 12),
  ('Young Elsa', 'supporting', 'Elsa as a child, Scenes 1-3. Ages 13–14. Also plays: Cook (Sc.4) — Townsperson (Sc.1) — Castle Staff (Sc.4) — Summer Chorus (Sc.7) — Oaken''s Family (Sc.8) — Hidden Folk (Sc.12) — Full company (Sc.14)', 13),
  ('King Agnarr', 'featured', 'King of Arendelle. Protective father. Ages 15–17. Also plays: Butler (Sc.4) — Guard (Sc.13, 14) — Townsperson (Sc.1) — Castle Staff (Sc.4) — Court (Sc.5) — Ball guest (Sc.6) — Hidden Folk (Sc.12) — Full company (Sc.14)', 14),
  ('Queen Iduna', 'featured', 'Queen of Arendelle, descendant of the Northern Nomads. Ages 15–17. Also plays: Townsperson (Sc.1) — Hidden Folk (Sc.2) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Hidden Folk (Sc.12) — Full company (Sc.14)', 15),
  ('Pabbie', 'supporting', 'Mystical leader of the Hidden Folk. Kristoff''s adoptive father. Ages 14–17. Also plays: Guard (Sc.13, 14) — Townsperson (Sc.1) — Hidden Folk (Sc.2) — Court (Sc.5) — Ball guest (Sc.6) — Hidden Folk (Sc.12) — Full company (Sc.14)', 16),
  ('Bulda', 'supporting', 'Mystical leader of the Hidden Folk. Kristoff''s adoptive mother. Ages 14–17. Also plays: Townsperson (Sc.1) — Hidden Folk (Sc.2) — Court (Sc.5) — Ball guest (Sc.6) — Oaken''s Family (Sc.8) — Hidden Folk (Sc.12) — Full company (Sc.14)', 17),
  ('Bishop', 'featured', 'Bishop of Arendelle, oversees the succession. Ages 15–17. Also plays: Townsperson (Sc.1) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Oaken''s Family (Sc.8) — Hidden Folk (Sc.12) — Full company (Sc.14)', 18),
  ('Weselton', 'supporting', 'Impolite, judgmental Duke from a neighboring kingdom. Ages 13–17. Also plays: Townsperson (Sc.1) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Oaken''s Family (Sc.8) — Full company (Sc.14)', 19),
  ('Oaken', 'supporting', 'Wandering salesperson, advocate of hygge. Ages 13–17. Also plays: Townsperson (Sc.1) — Court (Sc.5) — Ball guest (Sc.6) — Summer Chorus (Sc.7) — Oaken''s Family (Sc.8) — Hidden Folk (Sc.12) — Full company (Sc.14)', 20)
) as v(name, tier, description, sort_order);

-- Every actor's track, straight off the cast list: the scenes they are in and
-- the numbers they sing. Inverting it here rather than in the rows below is
-- what keeps this file readable — and what makes a correction a one-line edit.
with tracks (name, scenes, cues) as (values
  ('Anna', array[4,6,7,8,9,11,12,13,14], array[10,14,17,18,25,28,33,34,35,36]),
  ('Elsa', array[5,6,9,11,13,14], array[10,12,22,25,33,34,35,36]),
  ('Kristoff', array[4,7,8,9,11,12,13,14], array[16,17,27,28,33,34,35,36]),
  ('Olaf', array[7,8,11,12,13,14], array[17,18,28,33,34,35,36]),
  ('Hans', array[4,6,10,11,13,14], array[14,33,34,35,36]),
  ('Sven', array[4,7,11,12,13,14], array[16,28,33,34,35,36]),
  ('Middle Anna', array[1,2,3,4,5,9,14], array[1,3,8,10,12,22,26,32,33,34,35,36]),
  ('Middle Elsa', array[1,2,3,4,5,9,14], array[1,3,10,12,22,26,32,33,34,35,36]),
  ('Townsperson 1 / Ensemble', array[1,2,4,5,6,8,9,12,13,14], array[1,3,5,10,12,13,20,22,26,28,30,32,33,34,35,36]),
  ('Townsperson 2 / Ensemble', array[1,2,4,5,6,7,9,12,13,14], array[1,3,5,10,12,13,18,22,26,28,30,32,33,34,35,36]),
  ('Townsperson 3 / Ensemble', array[1,2,4,5,6,7,9,12,13,14], array[1,3,5,10,12,13,18,22,26,28,30,32,33,34,35,36]),
  ('Young Anna', array[1,2,3,6,7,8,12,14], array[1,4,8,13,18,20,28,33,34,35,36]),
  ('Young Elsa', array[1,2,3,4,7,8,12,14], array[1,4,8,10,18,20,28,33,34,35,36]),
  ('King Agnarr', array[1,2,3,4,5,6,12,13,14], array[1,4,10,12,13,28,30,33,34,35,36]),
  ('Queen Iduna', array[1,2,3,5,6,7,12,14], array[1,4,5,12,13,18,28,33,34,35,36]),
  ('Pabbie', array[1,2,5,6,12,13,14], array[1,5,6,12,13,28,29,30,33,34,35,36]),
  ('Bulda', array[1,2,5,6,8,12,14], array[1,5,12,13,20,28,33,34,35,36]),
  ('Bishop', array[1,3,5,6,7,8,12,14], array[1,12,13,18,20,28,33,34,35,36]),
  ('Weselton', array[1,5,6,7,8,10,11,13,14], array[1,12,13,18,20,33,34,35,36]),
  ('Oaken', array[1,5,6,7,8,12,14], array[1,12,13,18,20,21,28,33,34,35,36])
),
called as (
  select r.id, r.sort_order, t.scenes, t.cues
  from family_hub.show_roles r
  join tracks t on t.name = r.name
  where r.production_id = 'fdd3094d-9f48-4217-bb23-0515266a26d3'
)
insert into family_hub.show_scenes
  (production_id, kind, sort_order, label, name, setting, numbers, characters,
   number_no, from_page, to_page, role_ids)
select 'fdd3094d-9f48-4217-bb23-0515266a26d3', v.kind, v.sort_order, v.label, v.name, v.setting, v.numbers,
       v.characters, v.number_no, v.from_page, v.to_page,
       coalesce((
         select array_agg(c.id order by c.sort_order)
         from called c
         where case v.kind
                 when 'scene' then v.sort_order = any (c.scenes)
                 else v.number_no = any (c.cues)
               end
       ), '{}'::uuid[])
from (values
  ('scene', 1, 'Sc. 1', 'Sc. 1 — Summer Festival', 'Summer Festival', '#1 Let the Sun Shine On · #2 Playoff', 'Young Anna, Young Elsa, Agnarr, Iduna, Townspeople', null, 1, 8),
  ('scene', 2, 'Sc. 2', 'Sc. 2 — Castle Interior', 'Castle Interior', '#3 Elsa and Anna · #4 A Little Bit of You · #5 First Joik · #6 Magic Removal', 'Young Anna, Young Elsa, Agnarr, Iduna, Snow Chorus, Pabbie, Bulda', null, 9, 18),
  ('scene', 3, 'Sc. 3', 'Sc. 3 — Castle Interior, A Few Months Later', 'Castle Interior, A Few Months Later', '#7 Transition to Snowman · #8 Do You Want to Build a Snowman?', 'Young Anna, Middle Anna, Young Elsa, Middle Elsa, Agnarr, Iduna, Bishop', null, 19, 24),
  ('scene', 4, 'Sc. 4', 'Sc. 4 — Castle Interior, Three Years Later', 'Castle Interior, Three Years Later', '#9 Coronation Day · #10 For the First Time in Forever · #11 Playoff', 'Middle Elsa, Anna, Townspeople, Castle Staff, Bishop, Kristoff, Sven, Hans', null, 25, 39),
  ('scene', 5, 'Sc. 5', 'Sc. 5 — Castle Interior, Coronation Ceremony', 'Castle Interior, Coronation Ceremony', '#12 Dangerous to Dream', 'Elsa, Bishop, Townspeople', null, 40, 44),
  ('scene', 6, 'Sc. 6', 'Sc. 6 — Castle Interior, Coronation Ball', 'Castle Interior, Coronation Ball', '#13 Coronation Ball · #14 Love Is an Open Door · #15 Elsa Flees', 'Anna, Elsa, Hans, Weselton, Steward', null, 45, 59),
  ('scene', 7, 'Sc. 7', 'Sc. 7 — Snowy Mountainside', 'Snowy Mountainside', '#16 Reindeer(s) Are Better Than People · #17 You''re Hired · #18 In Summer · #19 Playoff', 'Anna, Kristoff, Sven, Olaf, Summer Chorus', null, 60, 69),
  ('scene', 8, 'Sc. 8', 'Sc. 8 — Wandering Oaken''s', 'Wandering Oaken''s', '#20 Hygge · #21 Covered in Snow', 'Anna, Kristoff, Olaf, Oaken, Oaken''s Family', null, 70, 77),
  ('scene', 9, 'Sc. 9', 'Sc. 9 — North Mountain', 'North Mountain', '#22 Let It Go', 'Elsa, Anna, Kristoff, Snow Chorus', null, 78, 87),
  ('scene', 10, 'Sc. 10', 'Sc. 10 — Mountain Path', 'Mountain Path', '#23 The Search Party', 'Hans, Weselton', null, 88, 88),
  ('scene', 11, 'Sc. 11', 'Sc. 11 — Elsa''s Palace', 'Elsa''s Palace', '#24 This · #25 For the First Time in Forever (Reprise) · #26 Mountain Fall', 'Anna, Elsa, Kristoff, Olaf, Hans, Weselton, Sven', null, 89, 96),
  ('scene', 12, 'Sc. 12', 'Sc. 12 — Foot of the Mountain', 'Foot of the Mountain', '#27 Kristoff''s Joik · #28 Fixer Upper · #29 An Act of True Love', 'Anna, Kristoff, Olaf, Sven, Pabbie, Bulda, Hidden Folk', null, 97, 106),
  ('scene', 13, 'Sc. 13', 'Sc. 13 — Castle Interior', 'Castle Interior', '#30 Elsa Is Captured · #31 Anna and Olaf', 'Anna, Elsa, Hans, Weselton, Kristoff, Sven, Olaf', null, 107, 110),
  ('scene', 14, 'Sc. 14', 'Sc. 14 — Castle Exterior', 'Castle Exterior', '#32 Transition · #33 Colder by the Minute · #34 Finale Pt 1 · #35 Finale Pt 2 · #36 Bows', 'Full Company', null, 111, 124),
  ('song', 101, null, '1. Let the Sun Shine On', null, null, 'Townspeople / Full Company', 1, 1, 1),
  ('song', 102, null, '2. Let the Sun Shine On - Playoff', null, null, 'Orchestra / Company', 2, 8, 8),
  ('song', 103, null, '3. Elsa and Anna', null, null, 'Underscore', 3, 9, 9),
  ('song', 104, null, '4. A Little Bit of You', null, null, 'Young Anna, Young Elsa, Snow Chorus', 4, 9, 9),
  ('song', 105, null, '5. First Joik', null, null, 'Pabbie, Bulda, Hidden Folk', 5, 16, 16),
  ('song', 106, null, '6. Magic Removal', null, null, 'Pabbie / Underscore', 6, 17, 17),
  ('song', 107, null, '7. Transition to Snowman', null, null, 'Orchestra', 7, 19, 19),
  ('song', 108, null, '8. Do You Want to Build a Snowman?', null, null, 'Young Anna, Middle Anna, Anna', 8, 19, 19),
  ('song', 109, null, '9. Coronation Day', null, null, 'Company underscore', 9, 25, 25),
  ('song', 110, null, '10. For the First Time in Forever', null, null, 'Anna, Elsa, Castle Staff, Townspeople', 10, 25, 25),
  ('song', 111, null, '11. For the First Time in Forever - Playoff', null, null, 'Orchestra', 11, 37, 37),
  ('song', 112, null, '12. Dangerous to Dream', null, null, 'Elsa, Bishop, Townspeople', 12, 39, 39),
  ('song', 113, null, '13. Coronation Ball', null, null, 'Orchestra / Company', 13, 45, 45),
  ('song', 114, null, '14. Love Is an Open Door', null, null, 'Anna, Hans', 14, 49, 49),
  ('song', 115, null, '15. Elsa Flees', null, null, 'Orchestra', 15, 58, 58),
  ('song', 116, null, '16. Reindeer(s) Are Better Than People', null, null, 'Kristoff, Sven', 16, 60, 60),
  ('song', 117, null, '17. You''re Hired', null, null, 'Anna, Kristoff, Olaf', 17, 63, 63),
  ('song', 118, null, '18. In Summer', null, null, 'Olaf, Summer Chorus', 18, 65, 65),
  ('song', 119, null, '19. In Summer - Playoff', null, null, 'Orchestra', 19, 70, 70),
  ('song', 120, null, '20. Hygge', null, null, 'Oaken, Oaken''s Family, Anna, Kristoff, Olaf', 20, 72, 72),
  ('song', 121, null, '21. Covered in Snow', null, null, 'Orchestra', 21, 77, 77),
  ('song', 122, null, '22. Let It Go', null, null, 'Elsa, Snow Chorus', 22, 78, 78),
  ('song', 123, null, '23. The Search Party', null, null, 'Orchestra', 23, 88, 88),
  ('song', 124, null, '24. This', null, null, 'Orchestra', 24, 89, 89),
  ('song', 125, null, '25. For the First Time in Forever (Reprise)', null, null, 'Anna, Elsa', 25, 91, 91),
  ('song', 126, null, '26. Mountain Fall', null, null, 'Orchestra / Snow Chorus', 26, 96, 96),
  ('song', 127, null, '27. Kristoff''s Joik', null, null, 'Kristoff', 27, 97, 97),
  ('song', 128, null, '28. Fixer Upper', null, null, 'Bulda, Pabbie, Hidden Folk', 28, 99, 99),
  ('song', 129, null, '29. An Act of True Love', null, null, 'Orchestra', 29, 105, 105),
  ('song', 130, null, '30. Elsa Is Captured', null, null, 'Orchestra', 30, 107, 107),
  ('song', 131, null, '31. Anna and Olaf', null, null, 'Orchestra', 31, 109, 109),
  ('song', 132, null, '32. Transition to Castle', null, null, 'Orchestra', 32, 111, 111),
  ('song', 133, null, '33. Colder by the Minute', null, null, 'Full Company', 33, 111, 111),
  ('song', 134, null, '34. Finale - Part 1', null, null, 'Anna, Elsa, Company', 34, 116, 116),
  ('song', 135, null, '35. Finale - Part 2', null, null, 'Full Company', 35, 119, 119),
  ('song', 136, null, '36. Bows', null, null, 'Full Company', 36, 123, 123),
  ('song', 137, null, '37. Exit Music', null, null, 'Orchestra', 37, 124, 124)
) as v(kind, sort_order, label, name, setting, numbers, characters,
       number_no, from_page, to_page);
