-- The script's own page numbers, so a call can say "Pages 12-18" instead of
-- naming every scene and song it touches.
--
-- Tony, 31 Aug 2026: SCRIPT PAGES ONLY. The piano/vocal score paginates
-- differently, and the same call sheet mixes the two — script pages for a
-- blocking call, score pages for a music call. Resolving both against one map
-- would land music calls on the wrong scenes with nothing about the output
-- looking wrong. A music call keeps naming its numbers on the Music: line.
--
-- Both columns null means this row has no page map yet. That is the normal
-- state until the script is walked once: the curriculum rebuild reports a
-- Pages: line that resolves to nothing rather than guessing at it.
--
-- Matching is by OVERLAP, not containment — a call working pp. 30-34 works
-- every scene and number those pages touch, even partially.

alter table family_hub.show_scenes
  add column if not exists from_page integer,
  add column if not exists to_page integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'family_hub.show_scenes'::regclass
      and conname = 'show_scenes_page_range_ordered'
  ) then
    alter table family_hub.show_scenes
      add constraint show_scenes_page_range_ordered
      check (from_page is null or to_page is null or from_page <= to_page);
  end if;
end $$;

comment on column family_hub.show_scenes.from_page is
  'First script page of this scene or number. Script pagination only, never the vocal score.';
comment on column family_hub.show_scenes.to_page is
  'Last script page, inclusive. Matched by overlap with a call''s Pages: line.';
