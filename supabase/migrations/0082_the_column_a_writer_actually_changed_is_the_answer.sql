-- 0082 — The column a writer actually changed is the answer.
--
-- Isabel Sok, a parent, 10 Sep 2026: "I changed her choice of role from
-- 'supporting' to 'lead' but each time I submit, it reverts back to
-- supporting."
--
-- It did, three times, and this is why. 0078 gave audition_profiles a set of
-- hoped-for tiers and left preference_tier beside it, kept equal to the biggest
-- of the set by trigger, so that readers which had not learned about the set
-- would still be told the truth. The trigger rebuilt the set from the old
-- column only when the set was EMPTY — which is right for a new row and wrong
-- for every edit of an old one. Olivia's row already carried
-- preference_tiers = {supporting} from the backfill. Her mother changed the
-- radio to Lead, the app wrote preference_tier = 'lead', the trigger read the
-- untouched array and put 'supporting' straight back.
--
-- 08:59, 09:09, 09:11. The form said saved every time, and the code on her
-- receipt never changed, so there was nothing on screen to suggest the portal
-- had quietly disagreed with her.
--
-- The rule the trigger was missing: whichever column the writer actually
-- CHANGED is the answer, and the other one follows it. An old client moves the
-- scalar; the set is rebuilt from it. The current form moves the set; the
-- scalar is recomputed from its head. Neither can silently overrule the other
-- again.
--
-- Safe to re-run.

create or replace function family_hub.audition_profile_sync_tiers()
returns trigger
language plpgsql
security invoker
set search_path = family_hub, public
as $$
declare
  ordered text[];
begin
  /*
   * A writer that moved only the old column has not learned about the set —
   * and it is still the one saying something new, so its word wins. This is
   * the line that was missing on 10 Sep 2026.
   *
   * The upsert the parent portal uses arrives here as an UPDATE, and the
   * current form sends preference_tiers and never mentions preference_tier, so
   * this branch is skipped for it and the set stays authoritative.
   */
  if tg_op = 'UPDATE'
     and new.preference_tier is distinct from old.preference_tier
     and new.preference_tiers is not distinct from old.preference_tiers then
    new.preference_tiers := array[new.preference_tier];
  end if;

  -- A new row from a writer that only knows the old column.
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

  if ordered is null then
    raise exception 'unknown role tier in %', new.preference_tiers;
  end if;

  new.preference_tiers := ordered;
  new.preference_tier := ordered[1];
  return new;
end;
$$;

/*
 * And Olivia's answer, put back to the one her mother chose three times.
 *
 * Only her: every other row touched while this was broken was a first
 * submission, where the set was empty and the trigger did the right thing. The
 * one other edit in the window (Serena Lynn, 12:45) re-sent the tier it already
 * had, so nothing of hers was lost.
 *
 * Written as the set, so the trigger recomputes the scalar from it rather than
 * the other way about.
 */
update family_hub.audition_profiles ap
   set preference_tiers = array['lead']
  from family_hub.students s, family_hub.productions p
 where s.id = ap.student_id
   and p.id = ap.production_id
   and s.first_name = 'Olivia'
   and s.last_name = 'Sok'
   and p.title = 'Broadway Bound Junior | Frozen, Jr.'
   and ap.preference_tiers = array['supporting'];
