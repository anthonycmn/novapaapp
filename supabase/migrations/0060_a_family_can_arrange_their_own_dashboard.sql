-- A family can arrange their own dashboard.
--
-- CJ, 2 Sep 2026: "allow me to move around my dashboard the same way we did for
-- the staff portal."
--
-- The staff portal's answer is 0195 there: one jsonb per person, holding an
-- order, what is folded, what has been taken off, and which column each panel
-- sits in. This is the same shape for the same reasons, so the two portals can
-- be talked about in the same words.
--
-- ARRANGEMENT, NEVER ACCESS. The saved layout is allowed to name anything: a
-- tile is drawn only if the page had something to put in it, and everything a
-- tile shows was already fetched for this account and checked by the provider
-- and by RLS underneath that. There is no arrangement of this jsonb that opens
-- a door — the worst a hand-edited one can do is hide a panel from its owner.
--
-- Why several lists rather than one order array: `order` alone cannot tell "I
-- took that off" from "the app added that after I last arranged this". Both
-- look like a key missing from the array and they want opposite treatment —
-- the first must stay off, the second must appear. `hidden` is what separates
-- them, and it is why a panel added to the portal next month turns up on a
-- dashboard somebody arranged in September instead of silently never existing
-- for them.

create table if not exists family_hub.dashboard_layouts (
  user_id    uuid primary key references family_hub.profiles (id) on delete cascade,
  layout     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table family_hub.dashboard_layouts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'family_hub'
       and tablename = 'dashboard_layouts'
       and policyname = 'dashboard_layouts_own'
  ) then
    -- Your own front page, and nobody else's. Not even an administrator has a
    -- reason to read how somebody arranged their dashboard.
    create policy dashboard_layouts_own on family_hub.dashboard_layouts
      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end
$$;
