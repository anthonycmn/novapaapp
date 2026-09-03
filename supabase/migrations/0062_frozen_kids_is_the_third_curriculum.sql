-- Disney's FROZEN KIDS: the third Frozen curriculum, and a different show.
--
-- Tony, 3 Sep 2026: "there should be three curriculums building - frozen kids,
-- frozen jr. 9-12, and frozen jr. 12-17". The first two were built from the
-- Frozen JR. workbook, which covers only its own two casts. KIDS is a separate
-- MTI licence — Broadway KIDS, ONE 30-minute act, 21 sections, 28 tracks, 60
-- pages — so not a row of the JR breakdown transfers. Its own workbook is
-- "FROZEN_KIDS_OFFICIAL_CURRICULUM" (cj@novapa.org), read 3 Sep 2026, and is
-- the source of everything below.
--
-- Ages 5-9, Wednesdays 5:15-6:45pm, 15 rehearsals from 16 Sep 2026, tech
-- 18-21 Jan, three performances 22-23 Jan 2027 — a week before the Junior
-- cast, in the same auditorium. Nobody auditions: placement is by grade level
-- and every enrolled child is cast, which is why the list below is 85 named
-- slots rather than a set of parts to win.
--
-- role_ids: the KIDS cast list has no per-role scenes column, so the mapping is
-- inverted out of each section's "characters in the section" and each track's
-- "sung by", with the group names expanded to cast-list rows. Instrumental
-- cues resolve to nobody, which is correct — they are played, not sung.
-- `characters` stays the workbook's own wording, as Sweeney's and the two JR
-- casts' rows do.
--
-- Re-runnable: the cast's rows are deleted and rewritten.

update family_hub.productions set
  venue = 'Loudoun Auditorium, National Conference Center, Leesburg VA',
  opens_on = date '2027-01-22',
  closes_on = date '2027-01-23',
  curriculum_url = 'https://docs.google.com/spreadsheets/d/1d9D1_s1rKBCINWC975Jx2wPqb5uP4sTBsAoUngkbd_U/edit'
where id = 'a107b67d-df92-4dd6-87d7-17e04455fa2b';

delete from family_hub.show_scenes where production_id = 'a107b67d-df92-4dd6-87d7-17e04455fa2b';
delete from family_hub.show_roles where production_id = 'a107b67d-df92-4dd6-87d7-17e04455fa2b';

insert into family_hub.show_roles
  (production_id, name, tier, description, capacity, sort_order)
select 'a107b67d-df92-4dd6-87d7-17e04455fa2b', v.name, v.tier, v.description, 1, v.sort_order
from (values
  ('Young Anna', 'lead', 'Featured pp. 1-14. Strong singer, great comic timing. Audition with Young Elsa. Folds into the Ensemble after p. 14.', 1),
  ('Middle Anna', 'lead', 'Featured pp. 13-16. Same tune as Young Anna, older voice, less hope. Folds into the Ensemble after p. 16.', 2),
  ('Anna', 'lead', 'Featured pp. 17-58. The largest singing track in the show.', 3),
  ('Young Elsa', 'lead', 'Featured pp. 1-13. Needs the gloves. Audition with Young Anna. Folds into the Ensemble after p. 13.', 4),
  ('Middle Elsa', 'lead', 'Featured pp. 13-16. ONE lyric in the entire show, in “Do You Want to Build a Snowman?” Folds into the Ensemble after p. 16.', 5),
  ('Elsa', 'lead', 'Featured pp. 17-58. Sings “Let It Go”. Restrained, not cold.', 6),
  ('Hans', 'lead', 'Featured pp. 20-58. Must play both sides. Sings “Love Is an Open Door”.', 7),
  ('Kristoff', 'lead', 'Featured pp. 20-58. Sings in the Finale. Audition with Sven.', 8),
  ('Olaf', 'lead', 'Featured pp. 39-58. Solos may be sung, spoken or a mixture. Cast for comic timing.', 9),
  ('Sven', 'lead', 'Featured pp. 20-58. Almost no lines. Cast for physical acting. Audition with Kristoff.', 10),
  ('King Agnarr', 'featured', 'Featured pp. 1-5, 9-11, 13-15. No singing solos.', 11),
  ('Queen Iduna', 'featured', 'Featured pp. 1-5, 9-11, 13-15. Calls the Hidden Folk; gives Elsa the gloves.', 12),
  ('Pabbie', 'featured', 'Featured pp. 10-11, 46-52. Speaks and sings. Names the cure.', 13),
  ('Bulda', 'featured', 'Featured pp. 10-11, 46-52. Speaks and sings. Opens “Fixer Upper”.', 14),
  ('Bishop', 'featured', 'Featured pp. 15, 21-22. Speaking role. Formal and serious.', 15),
  ('Weselton', 'featured', 'Featured pp. 20-54. Over-the-top comedy.', 16),
  ('Housekeeper', 'featured', 'Featured pp. 16-21. Castle Staff. Sings and speaks.', 17),
  ('Butler', 'featured', 'Featured pp. 16-21. Castle Staff. Sings and speaks.', 18),
  ('Handmaiden', 'featured', 'Featured pp. 16-21. Castle Staff. Sings and speaks.', 19),
  ('Cook', 'featured', 'Featured pp. 16-21. Castle Staff. Sings and speaks.', 20),
  ('Steward', 'featured', 'Featured p. 22. Castle Staff. Speaking role.', 21),
  ('Guard 1', 'featured', 'Featured p. 54. Onstage briefly.', 22),
  ('Guard 2', 'featured', 'Featured p. 54. Onstage briefly.', 23),
  ('Storyteller 1', 'featured', 'Featured pp. 1-4, 10, 12, 15-16, 19-20, 29, 31, 44-46, 52-57. Lines may be divided among more than four performers if that suits the cast.', 24),
  ('Storyteller 2', 'featured', 'Featured pp. 1-4, 10, 12, 15-16, 19-20, 29, 31, 44-46, 52-57. Lines may be divided among more than four performers if that suits the cast.', 25),
  ('Storyteller 3', 'featured', 'Featured pp. 1-4, 10, 12, 15-16, 19-20, 29, 31, 44-46, 52-57. Lines may be divided among more than four performers if that suits the cast.', 26),
  ('Storyteller 4', 'featured', 'Featured pp. 1-4, 10, 12, 15-16, 19-20, 29, 31, 44-46, 52-57. Lines may be divided among more than four performers if that suits the cast.', 27),
  ('Townsperson 1', 'featured', 'Featured pp. 15, 30, 31, 44, 55. Speaking solo, numbered consecutively from the top of the show; reassign freely.', 28),
  ('Townsperson 2', 'featured', 'Featured pp. 15, 30, 31, 44, 55. Speaking solo, numbered consecutively from the top of the show; reassign freely.', 29),
  ('Townsperson 3', 'featured', 'Featured pp. 15, 30, 31, 44, 55. Speaking solo, numbered consecutively from the top of the show; reassign freely.', 30),
  ('Townsperson 4', 'featured', 'Featured pp. 15, 30, 31, 44, 55. Speaking solo, numbered consecutively from the top of the show; reassign freely.', 31),
  ('Townsperson 5', 'featured', 'Featured pp. 15, 30, 31, 44, 55. Speaking solo, numbered consecutively from the top of the show; reassign freely.', 32),
  ('Townsperson 6', 'featured', 'Featured pp. 15, 30, 31, 44, 55. Speaking solo, numbered consecutively from the top of the show; reassign freely.', 33),
  ('Townsperson 7', 'featured', 'Featured pp. 15, 30, 31, 44, 55. Speaking solo, numbered consecutively from the top of the show; reassign freely.', 34),
  ('Townsperson 8', 'featured', 'Featured pp. 15, 30, 31, 44, 55. Speaking solo, numbered consecutively from the top of the show; reassign freely.', 35),
  ('Townsperson 9', 'featured', 'Featured pp. 15, 30, 31, 44, 55. Speaking solo, numbered consecutively from the top of the show; reassign freely.', 36),
  ('Townsperson 10', 'featured', 'Featured pp. 15, 30, 31, 44, 55. Speaking solo, numbered consecutively from the top of the show; reassign freely.', 37),
  ('Townsperson 11', 'featured', 'Featured pp. 15, 30, 31, 44, 55. Speaking solo, numbered consecutively from the top of the show; reassign freely.', 38),
  ('Townsperson 12', 'featured', 'Featured pp. 15, 30, 31, 44, 55. Speaking solo, numbered consecutively from the top of the show; reassign freely.', 39),
  ('Townsperson 13', 'featured', 'Featured pp. 15, 30, 31, 44, 55. Speaking solo, numbered consecutively from the top of the show; reassign freely.', 40),
  ('Townsperson 14', 'featured', 'Featured pp. 15, 30, 31, 44, 55. Speaking solo, numbered consecutively from the top of the show; reassign freely.', 41),
  ('Hidden Folk Solo 1', 'featured', 'Featured pp. 47-51. Sings and speaks inside “Fixer Upper”. The safest way to give a nervous performer a solo.', 42),
  ('Hidden Folk Solo 2', 'featured', 'Featured pp. 47-51. Sings and speaks inside “Fixer Upper”. The safest way to give a nervous performer a solo.', 43),
  ('Hidden Folk Solo 3', 'featured', 'Featured pp. 47-51. Sings and speaks inside “Fixer Upper”. The safest way to give a nervous performer a solo.', 44),
  ('Hidden Folk Solo 4', 'featured', 'Featured pp. 47-51. Sings and speaks inside “Fixer Upper”. The safest way to give a nervous performer a solo.', 45),
  ('Hidden Folk Solo 5', 'featured', 'Featured pp. 47-51. Sings and speaks inside “Fixer Upper”. The safest way to give a nervous performer a solo.', 46),
  ('Hidden Folk Solo 6', 'featured', 'Featured pp. 47-51. Sings and speaks inside “Fixer Upper”. The safest way to give a nervous performer a solo.', 47),
  ('Snow Chorus 1', 'ensemble', 'Personification of Elsa''s power; builds the ice palace and the blizzard. Cast strong movers.', 48),
  ('Snow Chorus 2', 'ensemble', 'Personification of Elsa''s power; builds the ice palace and the blizzard. Cast strong movers.', 49),
  ('Snow Chorus 3', 'ensemble', 'Personification of Elsa''s power; builds the ice palace and the blizzard. Cast strong movers.', 50),
  ('Snow Chorus 4', 'ensemble', 'Personification of Elsa''s power; builds the ice palace and the blizzard. Cast strong movers.', 51),
  ('Snow Chorus 5', 'ensemble', 'Personification of Elsa''s power; builds the ice palace and the blizzard. Cast strong movers.', 52),
  ('Snow Chorus 6', 'ensemble', 'Personification of Elsa''s power; builds the ice palace and the blizzard. Cast strong movers.', 53),
  ('Snow Chorus 7', 'ensemble', 'Personification of Elsa''s power; builds the ice palace and the blizzard. Cast strong movers.', 54),
  ('Snow Chorus 8', 'ensemble', 'Personification of Elsa''s power; builds the ice palace and the blizzard. Cast strong movers.', 55),
  ('Snow Chorus 9', 'ensemble', 'Personification of Elsa''s power; builds the ice palace and the blizzard. Cast strong movers.', 56),
  ('Snow Chorus 10', 'ensemble', 'Personification of Elsa''s power; builds the ice palace and the blizzard. Cast strong movers.', 57),
  ('Summer Chorus 1', 'ensemble', 'Olaf''s summer daydream in “In Summer”.', 58),
  ('Summer Chorus 2', 'ensemble', 'Olaf''s summer daydream in “In Summer”.', 59),
  ('Summer Chorus 3', 'ensemble', 'Olaf''s summer daydream in “In Summer”.', 60),
  ('Summer Chorus 4', 'ensemble', 'Olaf''s summer daydream in “In Summer”.', 61),
  ('Summer Chorus 5', 'ensemble', 'Olaf''s summer daydream in “In Summer”.', 62),
  ('Summer Chorus 6', 'ensemble', 'Olaf''s summer daydream in “In Summer”.', 63),
  ('Summer Chorus 7', 'ensemble', 'Olaf''s summer daydream in “In Summer”.', 64),
  ('Summer Chorus 8', 'ensemble', 'Olaf''s summer daydream in “In Summer”.', 65),
  ('Hidden Folk 1', 'ensemble', 'The mountain family who raise Kristoff. Sings “The Hidden Folk” and “Fixer Upper”.', 66),
  ('Hidden Folk 2', 'ensemble', 'The mountain family who raise Kristoff. Sings “The Hidden Folk” and “Fixer Upper”.', 67),
  ('Hidden Folk 3', 'ensemble', 'The mountain family who raise Kristoff. Sings “The Hidden Folk” and “Fixer Upper”.', 68),
  ('Hidden Folk 4', 'ensemble', 'The mountain family who raise Kristoff. Sings “The Hidden Folk” and “Fixer Upper”.', 69),
  ('Hidden Folk 5', 'ensemble', 'The mountain family who raise Kristoff. Sings “The Hidden Folk” and “Fixer Upper”.', 70),
  ('Hidden Folk 6', 'ensemble', 'The mountain family who raise Kristoff. Sings “The Hidden Folk” and “Fixer Upper”.', 71),
  ('Hidden Folk 7', 'ensemble', 'The mountain family who raise Kristoff. Sings “The Hidden Folk” and “Fixer Upper”.', 72),
  ('Hidden Folk 8', 'ensemble', 'The mountain family who raise Kristoff. Sings “The Hidden Folk” and “Fixer Upper”.', 73),
  ('Townsperson (Ensemble) 1', 'ensemble', 'Citizen of Arendelle. Onstage for the festival, the coronation and the finale.', 74),
  ('Townsperson (Ensemble) 2', 'ensemble', 'Citizen of Arendelle. Onstage for the festival, the coronation and the finale.', 75),
  ('Townsperson (Ensemble) 3', 'ensemble', 'Citizen of Arendelle. Onstage for the festival, the coronation and the finale.', 76),
  ('Townsperson (Ensemble) 4', 'ensemble', 'Citizen of Arendelle. Onstage for the festival, the coronation and the finale.', 77),
  ('Townsperson (Ensemble) 5', 'ensemble', 'Citizen of Arendelle. Onstage for the festival, the coronation and the finale.', 78),
  ('Townsperson (Ensemble) 6', 'ensemble', 'Citizen of Arendelle. Onstage for the festival, the coronation and the finale.', 79),
  ('Townsperson (Ensemble) 7', 'ensemble', 'Citizen of Arendelle. Onstage for the festival, the coronation and the finale.', 80),
  ('Townsperson (Ensemble) 8', 'ensemble', 'Citizen of Arendelle. Onstage for the festival, the coronation and the finale.', 81),
  ('Townsperson (Ensemble) 9', 'ensemble', 'Citizen of Arendelle. Onstage for the festival, the coronation and the finale.', 82),
  ('Townsperson (Ensemble) 10', 'ensemble', 'Citizen of Arendelle. Onstage for the festival, the coronation and the finale.', 83),
  ('Townsperson (Ensemble) 11', 'ensemble', 'Citizen of Arendelle. Onstage for the festival, the coronation and the finale.', 84),
  ('Townsperson (Ensemble) 12', 'ensemble', 'Citizen of Arendelle. Onstage for the festival, the coronation and the finale.', 85)
) as v(name, tier, description, sort_order);

-- Each track's sections and cues, inverted from the two workbook tables.
with tracks (name, sections, cues) as (values
  ('Young Anna', array[1,2,3,4,5,20,21], array[1,4,8,11,26,27]),
  ('Middle Anna', array[5,6,20,21], array[8,11,26,27]),
  ('Anna', array[7,8,9,10,11,13,14,15,16,17,18,19,20,21], array[10,11,12,26,27]),
  ('Young Elsa', array[1,2,3,4,5,20,21], array[1,4,11,26,27]),
  ('Middle Elsa', array[5,6,20,21], array[8,11,26,27]),
  ('Elsa', array[7,8,9,11,12,15,18,19,20,21], array[10,11,14,26,27]),
  ('Hans', array[8,10,11,15,18,19,20,21], array[11,12,26,27]),
  ('Kristoff', array[8,13,14,15,16,17,18,19,20,21], array[11,26,27]),
  ('Olaf', array[2,13,14,15,16,17,18,20,21], array[11,17,26,27]),
  ('Sven', array[8,13,14,15,17,20,21], array[11,17,26,27]),
  ('King Agnarr', array[1,2,3,4,5,6,20,21], array[1,11,26,27]),
  ('Queen Iduna', array[1,2,3,4,5,6,20,21], array[1,11,26,27]),
  ('Pabbie', array[4,16,17,20,21], array[11,22,26,27]),
  ('Bulda', array[4,16,17,20,21], array[11,22,26,27]),
  ('Bishop', array[6,9,20,21], array[11,26,27]),
  ('Weselton', array[8,9,11,15,20,21], array[11,26,27]),
  ('Housekeeper', array[6,7,9,20,21], array[9,10,11,26,27]),
  ('Butler', array[6,7,9,20,21], array[9,10,11,26,27]),
  ('Handmaiden', array[6,7,9,20,21], array[9,10,11,26,27]),
  ('Cook', array[6,7,9,20,21], array[9,10,11,26,27]),
  ('Steward', array[6,7,9,20,21], array[9,10,11,26,27]),
  ('Guard 1', array[15,19,20,21], array[11,26,27]),
  ('Guard 2', array[15,19,20,21], array[11,26,27]),
  ('Storyteller 1', array[1,4,6,15,18,20,21], array[1,11,26,27]),
  ('Storyteller 2', array[1,4,6,15,18,20,21], array[1,11,26,27]),
  ('Storyteller 3', array[1,5,6,11,15,17,19,20,21], array[1,11,26,27]),
  ('Storyteller 4', array[1,5,6,15,17,20,21], array[1,11,26,27]),
  ('Townsperson 1', array[1,6,8,9,10,20,21], array[1,11,26,27]),
  ('Townsperson 2', array[1,6,8,9,10,20,21], array[1,11,26,27]),
  ('Townsperson 3', array[1,8,9,10,20,21], array[1,11,26,27]),
  ('Townsperson 4', array[1,8,9,10,20,21], array[1,11,26,27]),
  ('Townsperson 5', array[1,8,9,10,11,20,21], array[1,11,26,27]),
  ('Townsperson 6', array[1,8,9,10,11,20,21], array[1,11,26,27]),
  ('Townsperson 7', array[1,8,9,10,11,20,21], array[1,11,26,27]),
  ('Townsperson 8', array[1,8,9,10,11,20,21], array[1,11,26,27]),
  ('Townsperson 9', array[1,8,9,10,11,20,21], array[1,11,26,27]),
  ('Townsperson 10', array[1,8,9,10,15,20,21], array[1,11,26,27]),
  ('Townsperson 11', array[1,8,9,10,15,20,21], array[1,11,26,27]),
  ('Townsperson 12', array[1,8,9,10,20,21], array[1,11,26,27]),
  ('Townsperson 13', array[1,8,9,10,20,21], array[1,11,26,27]),
  ('Townsperson 14', array[1,8,9,10,20,21], array[1,11,26,27]),
  ('Hidden Folk Solo 1', array[4,16,20,21], array[5,11,22,26,27]),
  ('Hidden Folk Solo 2', array[4,16,20,21], array[5,11,22,26,27]),
  ('Hidden Folk Solo 3', array[4,16,20,21], array[5,11,22,26,27]),
  ('Hidden Folk Solo 4', array[4,16,20,21], array[5,11,22,26,27]),
  ('Hidden Folk Solo 5', array[4,16,20,21], array[5,11,22,26,27]),
  ('Hidden Folk Solo 6', array[4,16,20,21], array[5,11,22,26,27]),
  ('Snow Chorus 1', array[2,3,12,15,19,20,21], array[4,11,14,19,25,26,27]),
  ('Snow Chorus 2', array[2,3,12,15,19,20,21], array[4,11,14,19,25,26,27]),
  ('Snow Chorus 3', array[2,3,12,15,19,20,21], array[4,11,14,19,25,26,27]),
  ('Snow Chorus 4', array[2,3,12,15,19,20,21], array[4,11,14,19,25,26,27]),
  ('Snow Chorus 5', array[2,3,12,15,19,20,21], array[4,11,14,19,25,26,27]),
  ('Snow Chorus 6', array[2,3,12,15,19,20,21], array[4,11,14,19,25,26,27]),
  ('Snow Chorus 7', array[2,3,12,15,19,20,21], array[4,11,14,19,25,26,27]),
  ('Snow Chorus 8', array[2,3,12,15,19,20,21], array[4,11,14,19,25,26,27]),
  ('Snow Chorus 9', array[2,3,12,15,19,20,21], array[4,11,14,19,25,26,27]),
  ('Snow Chorus 10', array[2,3,12,15,19,20,21], array[4,11,14,19,25,26,27]),
  ('Summer Chorus 1', array[14,20,21], array[11,17,26,27]),
  ('Summer Chorus 2', array[14,20,21], array[11,17,26,27]),
  ('Summer Chorus 3', array[14,20,21], array[11,17,26,27]),
  ('Summer Chorus 4', array[14,20,21], array[11,17,26,27]),
  ('Summer Chorus 5', array[14,20,21], array[11,17,26,27]),
  ('Summer Chorus 6', array[14,20,21], array[11,17,26,27]),
  ('Summer Chorus 7', array[14,20,21], array[11,17,26,27]),
  ('Summer Chorus 8', array[14,20,21], array[11,17,26,27]),
  ('Hidden Folk 1', array[4,16,20,21], array[5,11,26,27]),
  ('Hidden Folk 2', array[4,16,20,21], array[5,11,26,27]),
  ('Hidden Folk 3', array[4,16,20,21], array[5,11,26,27]),
  ('Hidden Folk 4', array[4,16,20,21], array[5,11,26,27]),
  ('Hidden Folk 5', array[4,16,20,21], array[5,11,26,27]),
  ('Hidden Folk 6', array[4,16,20,21], array[5,11,26,27]),
  ('Hidden Folk 7', array[4,16,20,21], array[5,11,26,27]),
  ('Hidden Folk 8', array[4,16,20,21], array[5,11,26,27]),
  ('Townsperson (Ensemble) 1', array[1,6,8,9,10,20,21], array[1,11,26,27]),
  ('Townsperson (Ensemble) 2', array[1,6,8,9,10,20,21], array[1,11,26,27]),
  ('Townsperson (Ensemble) 3', array[1,6,8,9,10,20,21], array[1,11,26,27]),
  ('Townsperson (Ensemble) 4', array[1,6,8,9,10,20,21], array[1,11,26,27]),
  ('Townsperson (Ensemble) 5', array[1,6,8,9,10,20,21], array[1,11,26,27]),
  ('Townsperson (Ensemble) 6', array[1,6,8,9,10,20,21], array[1,11,26,27]),
  ('Townsperson (Ensemble) 7', array[1,6,8,9,10,20,21], array[1,11,26,27]),
  ('Townsperson (Ensemble) 8', array[1,6,8,9,10,20,21], array[1,11,26,27]),
  ('Townsperson (Ensemble) 9', array[1,6,8,9,10,20,21], array[1,11,26,27]),
  ('Townsperson (Ensemble) 10', array[1,6,8,9,10,20,21], array[1,11,26,27]),
  ('Townsperson (Ensemble) 11', array[1,6,8,9,10,20,21], array[1,11,26,27]),
  ('Townsperson (Ensemble) 12', array[1,6,8,9,10,20,21], array[1,11,26,27])
),
called as (
  select r.id, r.sort_order, t.sections, t.cues
  from family_hub.show_roles r
  join tracks t on t.name = r.name
  where r.production_id = 'a107b67d-df92-4dd6-87d7-17e04455fa2b'
)
insert into family_hub.show_scenes
  (production_id, kind, sort_order, label, name, setting, numbers, characters,
   number_no, from_page, to_page, role_ids)
select 'a107b67d-df92-4dd6-87d7-17e04455fa2b', v.kind, v.sort_order, v.label, v.name, v.setting, v.numbers,
       v.characters, v.number_no, v.from_page, v.to_page,
       coalesce((
         select array_agg(c.id order by c.sort_order)
         from called c
         where case v.kind
                 when 'scene' then v.sort_order = any (c.sections)
                 else v.number_no = any (c.cues)
               end
       ), '{}'::uuid[])
from (values
  ('scene', 1, 'Sec. 1', 'Sec. 1 — Arendelle, summer. The Summer Festival', 'Arendelle, summer. The Summer Festival', '#1 Let the Sun Shine On · #2 Playoff', 'Storytellers 1-4, Townspeople 1-14, King Agnarr, Queen Iduna, Young Anna, Young Elsa', null, 1, 4),
  ('scene', 2, 'Sec. 2', 'Sec. 2 — The girls'' bedroom. Building Olaf', 'The girls'' bedroom. Building Olaf', '#3 Elsa and Anna · #4 A Little Bit of You', 'Young Anna, Young Elsa, Snow Chorus, Olaf, King Agnarr, Queen Iduna', null, 5, 8),
  ('scene', 3, 'Sec. 3', 'Sec. 3 — The ice strike', 'The ice strike', '(underscored)', 'Young Anna, Young Elsa, Snow Chorus, King Agnarr, Queen Iduna', null, 9, 9),
  ('scene', 4, 'Sec. 4', 'Sec. 4 — The mountains. The Hidden Folk heal Anna', 'The mountains. The Hidden Folk heal Anna', '#5 The Hidden Folk · #6 Magic Removal · #7 Transition to Snowman', 'Pabbie, Bulda, Hidden Folk, Queen Iduna, King Agnarr, Young Anna, Young Elsa, Storytellers 1-2', null, 10, 11),
  ('scene', 5, 'Sec. 5', 'Sec. 5 — Outside Elsa''s door. Years pass', 'Outside Elsa''s door. Years pass', '#8 Do You Want to Build a Snowman?', 'Young Anna, Middle Anna, Young Elsa, Middle Elsa, King Agnarr, Queen Iduna, Storytellers 3-4', null, 12, 14),
  ('scene', 6, 'Sec. 6', 'Sec. 6 — The voyage, the loss, and the coronation announced', 'The voyage, the loss, and the coronation announced', '#9 Coronation Day', 'King Agnarr, Queen Iduna, Middle Anna, Middle Elsa, Bishop, Townspeople 1-2, Storytellers 1-4, Castle Staff', null, 14, 16),
  ('scene', 7, 'Sec. 7', 'Sec. 7 — The castle on Coronation Day', 'The castle on Coronation Day', '#10 For the First Time in Forever', 'Anna, Elsa, Castle Staff (Housekeeper, Butler, Handmaiden, Cook, Steward)', null, 17, 20),
  ('scene', 8, 'Sec. 8', 'Sec. 8 — The gates open. New arrivals', 'The gates open. New arrivals', '(dialogue)', 'Weselton, Hans, Kristoff, Sven, Anna, Elsa, Townspeople 1-14', null, 20, 21),
  ('scene', 9, 'Sec. 9', 'Sec. 9 — The coronation and the ball', 'The coronation and the ball', '#11 Coronation Ball', 'Bishop, Elsa, Anna, Steward, Weselton, Townspeople 1-14, Castle Staff', null, 21, 23),
  ('scene', 10, 'Sec. 10', 'Sec. 10 — Anna and Hans meet', 'Anna and Hans meet', '#12 Love Is an Open Door', 'Anna, Hans, Townspeople 1-14', null, 24, 29),
  ('scene', 11, 'Sec. 11', 'Sec. 11 — The blessing refused. Elsa flees', 'The blessing refused. Elsa flees', '#13 Elsa Flees', 'Anna, Elsa, Hans, Weselton, Storyteller 3, Townspeople 5-9', null, 29, 30),
  ('scene', 12, 'Sec. 12', 'Sec. 12 — The North Mountain. The ice palace', 'The North Mountain. The ice palace', '#14 Let It Go', 'Elsa, Snow Chorus', null, 31, 36),
  ('scene', 13, 'Sec. 13', 'Sec. 13 — The barn. Anna hires Kristoff', 'The barn. Anna hires Kristoff', '#15 Let It Go (Playoff) · #16 You''re Hired', 'Anna, Kristoff, Sven, Olaf', null, 37, 39),
  ('scene', 14, 'Sec. 14', 'Sec. 14 — The mountainside. Olaf dreams of summer', 'The mountainside. Olaf dreams of summer', '#17 In Summer · #18 Playoff', 'Olaf, Summer Chorus, Sven, Kristoff, Anna', null, 40, 43),
  ('scene', 15, 'Sec. 15', 'Sec. 15 — Arendelle and the palace. The search party; Elsa panics', 'Arendelle and the palace. The search party; Elsa panics', '#19 Elsa''s Ice Palace · #20 Elsa Panics · #21 Transition to Hidden Folk', 'Hans, Weselton, Guards, Townspeople 10-11, Storytellers 1-4, Elsa, Anna, Snow Chorus, Kristoff, Sven, Olaf', null, 44, 46),
  ('scene', 16, 'Sec. 16', 'Sec. 16 — The Hidden Folk. Fixer Upper', 'The Hidden Folk. Fixer Upper', '#22 Fixer Upper', 'Bulda, Pabbie, Hidden Folk, Kristoff, Anna, Olaf', null, 47, 51),
  ('scene', 17, 'Sec. 17', 'Sec. 17 — Anna falls. An act of true love named', 'Anna falls. An act of true love named', '#23 An Act of True Love', 'Anna, Kristoff, Pabbie, Bulda, Olaf, Sven, Storytellers 3-4', null, 51, 52),
  ('scene', 18, 'Sec. 18', 'Sec. 18 — The castle. Hans''s betrayal; Olaf rescues Anna', 'The castle. Hans''s betrayal; Olaf rescues Anna', '#24 Anna and Olaf', 'Hans, Anna, Kristoff, Olaf, Elsa, Storytellers 1-2', null, 53, 54),
  ('scene', 19, 'Sec. 19', 'Sec. 19 — The blizzard, the sword and the thaw', 'The blizzard, the sword and the thaw', '#25 Whiteout Underscore', 'Elsa, Snow Chorus, Anna, Hans, Kristoff, Guards, Storyteller 3', null, 55, 56),
  ('scene', 20, 'Sec. 20', 'Sec. 20 — Arendelle restored. Finale', 'Arendelle restored. Finale', '#26 Finale', 'Full company', null, 56, 58),
  ('scene', 21, 'Sec. 21', 'Sec. 21 — Bows and Exit Music', 'Bows and Exit Music', '#27 Bows · #28 Exit Music', 'Full company', null, 59, 60),
  ('song', 101, null, '1. Let the Sun Shine On', null, null, 'Townspeople, Storytellers, Royal Family', 1, 1, 1),
  ('song', 102, null, '2. Let the Sun Shine On (Playoff)', null, null, 'Instrumental', 2, 4, 4),
  ('song', 103, null, '3. Elsa and Anna', null, null, 'Instrumental', 3, 5, 5),
  ('song', 104, null, '4. A Little Bit of You', null, null, 'Young Anna, Young Elsa, Snow Chorus', 4, 5, 5),
  ('song', 105, null, '5. The Hidden Folk', null, null, 'Hidden Folk', 5, 10, 10),
  ('song', 106, null, '6. Magic Removal', null, null, 'Instrumental', 6, 11, 11),
  ('song', 107, null, '7. Transition to Snowman', null, null, 'Instrumental', 7, 11, 11),
  ('song', 108, null, '8. Do You Want to Build a Snowman?', null, null, 'Young Anna, Middle Anna, Middle Elsa', 8, 12, 12),
  ('song', 109, null, '9. Coronation Day', null, null, 'Castle Staff', 9, 16, 16),
  ('song', 110, null, '10. For the First Time in Forever', null, null, 'Anna, Elsa, Castle Staff', 10, 17, 17),
  ('song', 111, null, '11. Coronation Ball', null, null, 'Instrumental / company', 11, 22, 22),
  ('song', 112, null, '12. Love Is an Open Door', null, null, 'Anna, Hans', 12, 24, 24),
  ('song', 113, null, '13. Elsa Flees', null, null, 'Instrumental', 13, 30, 30),
  ('song', 114, null, '14. Let It Go', null, null, 'Elsa, Snow Chorus', 14, 31, 31),
  ('song', 115, null, '15. Let It Go (Playoff)', null, null, 'Instrumental', 15, 37, 37),
  ('song', 116, null, '16. You''re Hired', null, null, 'Instrumental', 16, 38, 38),
  ('song', 117, null, '17. In Summer', null, null, 'Olaf, Summer Chorus, Sven', 17, 40, 40),
  ('song', 118, null, '18. In Summer (Playoff)', null, null, 'Instrumental', 18, 43, 43),
  ('song', 119, null, '19. Elsa''s Ice Palace', null, null, 'Instrumental / Snow Chorus', 19, 44, 44),
  ('song', 120, null, '20. Elsa Panics', null, null, 'Instrumental', 20, 45, 45),
  ('song', 121, null, '21. Transition to Hidden Folk', null, null, 'Instrumental', 21, 46, 46),
  ('song', 122, null, '22. Fixer Upper', null, null, 'Bulda, Pabbie, Hidden Folk Solos', 22, 47, 47),
  ('song', 123, null, '23. An Act of True Love', null, null, 'Instrumental', 23, 52, 52),
  ('song', 124, null, '24. Anna and Olaf', null, null, 'Instrumental', 24, 53, 53),
  ('song', 125, null, '25. Whiteout Underscore', null, null, 'Instrumental / Snow Chorus', 25, 55, 55),
  ('song', 126, null, '26. Finale', null, null, 'Full company', 26, 56, 56),
  ('song', 127, null, '27. Bows', null, null, 'Full company', 27, 59, 59),
  ('song', 128, null, '28. Exit Music', null, null, 'Instrumental', 28, 60, 60)
) as v(kind, sort_order, label, name, setting, numbers, characters,
       number_no, from_page, to_page);
