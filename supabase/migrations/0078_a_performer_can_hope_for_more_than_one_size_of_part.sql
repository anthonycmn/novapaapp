-- 0078 — A performer can hope for more than one size of part.
--
-- Yin, a parent, 8 Sep 2026, after being walked through the portal: "it would
-- be great to enable multi-selection for 'And how big a part are they hoping
-- for?' question as many kids are open to multiple types of roles!"
--
-- She is right, and the single-choice question was quietly costing us the
-- truth. A child who would love a lead and would be perfectly happy in the
-- ensemble had to pick one, and whichever they picked read to the panel as the
-- only answer — either an ambition that looks like a demand, or a modesty that
-- hides one.
--
-- So the answer becomes a set. preference_tiers holds every size of part the
-- family said yes to.
--
-- preference_tier STAYS, and stays honest. Twenty-six auditions already carry
-- it, the staff portal reads it in four places, and casting is live for the
-- Frozen weekends — a column rename here is a blank "Hoping:" on a casting
-- board in January. A trigger keeps it equal to the biggest tier in the array,
-- so every reader that has not learned about the set yet still gets a true
-- answer rather than a stale one, and a writer that only knows the old column
-- still produces a valid row.
--
-- Safe to re-run.

alter table family_hub.audition_profiles
  add column if not exists preference_tiers text[] not null default '{}';

-- The 26 rows already in the table each said exactly one thing. That one thing
-- is now a set of one; nobody's answer changes.
update family_hub.audition_profiles
   set preference_tiers = array[preference_tier]
 where coalesce(array_length(preference_tiers, 1), 0) = 0;

/*
 * Both directions, so neither column can drift from the other:
 *   - given only the old column, build the set from it;
 *   - given the set, dedupe it, order it biggest-first, and recompute the old
 *     column from its head.
 * BEFORE-row, so the NOT NULL on preference_tier is satisfied by the time it
 * is checked and a writer may legitimately send only one of the two.
 */
create or replace function family_hub.audition_profile_sync_tiers()
returns trigger
language plpgsql
security invoker
set search_path = family_hub, public
as $$
declare
  ordered text[];
begin
  if coalesce(array_length(new.preference_tiers, 1), 0) = 0 then
    if new.preference_tier is null then
      raise exception 'an audition profile must say what size of part they hope for';
    end if;
    new.preference_tiers := array[new.preference_tier];
  end if;

  select array_agg(t.value order by t.rank)
    into ordered
    from (values ('lead', 1), ('supporting', 2), ('featured', 3), ('ensemble', 4))
      as t(value, rank)
   where t.value = any (new.preference_tiers);

  -- Everything they ticked was junk. Say so here rather than letting it
  -- surface as a not-null violation on a column they never touched.
  if ordered is null then
    raise exception 'unknown role tier in %', new.preference_tiers;
  end if;

  new.preference_tiers := ordered;
  new.preference_tier := ordered[1];
  return new;
end;
$$;

drop trigger if exists audition_profiles_sync_tiers on family_hub.audition_profiles;
create trigger audition_profiles_sync_tiers
  before insert or update on family_hub.audition_profiles
  for each row execute function family_hub.audition_profile_sync_tiers();

alter table family_hub.audition_profiles
  drop constraint if exists audition_profiles_preference_tiers_valid;
alter table family_hub.audition_profiles
  add constraint audition_profiles_preference_tiers_valid check (
    array_length(preference_tiers, 1) between 1 and 4
    and preference_tiers <@ array['ensemble', 'featured', 'supporting', 'lead']::text[]
  );

notify pgrst, 'reload schema';
