-- 0083 — A parent is shown around once.
--
-- CJ, 11 Sep 2026: "a series of pop up instructions for important
-- information, including shows, star pages, spirit buttons, family profile,
-- Ask Spot, what's on the dashboard, where to find your calendar… a tutorial
-- for when parents log in for the first time, or if they've already logged in,
-- the next time that they log in."
--
-- The tour itself is in the app (src/lib/tour.ts). This table is only the
-- answer to one question: has this ACCOUNT been shown around yet? A row per
-- person, not per browser — a parent who took the tour on their phone in the
-- car should not be walked through it again on the laptop that evening.
-- localStorage alone would do exactly that.
--
-- `version` is the tour's version number when they saw it. The app bumps
-- TOUR_VERSION when the tour changes enough that everybody should see it again
-- (a new group in the menu, say), and the dashboard shows the tour to anyone
-- whose row is behind. Nobody is shown it twice for the same version.
--
-- `outcome` is a fact for CJ, not a gate for the app: "skipped" and "finished"
-- both count as shown. If most families skip on step two, that is a note about
-- the tour, and the number is here to be read.
--
-- Safe to re-run.

create table if not exists family_hub.portal_tours (
  user_id      uuid primary key references family_hub.profiles (id) on delete cascade,
  version      integer not null,
  outcome      text not null check (outcome in ('finished', 'skipped')),
  completed_at timestamptz not null default now()
);

alter table family_hub.portal_tours enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'family_hub'
       and tablename = 'portal_tours'
       and policyname = 'portal_tours_own'
  ) then
    -- Whether you have been shown around is yours to read and yours to set.
    create policy portal_tours_own on family_hub.portal_tours
      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end
$$;
