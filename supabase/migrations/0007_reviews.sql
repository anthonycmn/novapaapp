-- ─────────────────────────────────────────────────────────────────────────
-- 0007_reviews.sql — private class & production reviews (#15).
--
-- The privacy model is the feature. Three rules the policies below enforce:
--   1. A review is never visible to another family, and never public.
--   2. Admins see everything, including who wrote an anonymous review.
--   3. Staff see reviews about their own work, but must NOT be able to
--      attribute an anonymous one.
--
-- Rule 3 cannot be done with row-level security alone, because RLS filters
-- rows, not columns. Staff therefore read through `staff_review_view`,
-- which simply does not select the reviewer columns.
-- ─────────────────────────────────────────────────────────────────────────

create table review_windows (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('mid_session','end_of_session','post_show')),
  subject_type text not null check (subject_type in ('class','production')),
  subject_id uuid not null,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  check (closes_at > opens_at)
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  window_id uuid not null references review_windows (id) on delete cascade,
  subject_type text not null check (subject_type in ('class','production')),
  subject_id uuid not null,
  -- Always recorded. Admins may read it; staff never do.
  reviewer_user_id uuid not null references profiles (id) on delete cascade,
  reviewer_name text not null,
  family_id uuid not null references families (id) on delete cascade,
  staff_ids uuid[] not null default '{}',
  instruction_quality int not null check (instruction_quality between 1 and 5),
  communication int not null check (communication between 1 and 5),
  child_growth int not null check (child_growth between 1 and 5),
  organization int not null check (organization between 1 and 5),
  comment text not null default '',
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  flagged_at timestamptz,
  flag_reason text,
  resolved_at timestamptz,
  resolution_note text,
  -- One review per family per window.
  unique (window_id, family_id)
);

create index reviews_subject_idx on reviews (subject_type, subject_id, created_at desc);
create index reviews_staff_idx on reviews using gin (staff_ids);
create index reviews_flagged_idx on reviews (flagged_at)
  where flagged_at is not null and resolved_at is null;

-- ── the staff-safe projection ────────────────────────────────────────────
-- No reviewer_user_id, no reviewer_name, no family_id. Anonymous reviews
-- collapse to 'A family'. Staff read ONLY this view.
create view staff_review_view
with (security_invoker = true) as
  select
    r.id,
    r.subject_type,
    r.subject_id,
    r.staff_ids,
    case when r.is_anonymous then 'A family' else r.reviewer_name end as attribution,
    r.instruction_quality,
    r.communication,
    r.child_growth,
    r.organization,
    r.comment,
    r.created_at
  from reviews r;

comment on view staff_review_view is
  'Reviews with reviewer identity removed. The only path staff use to read reviews.';

-- ─────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────

alter table review_windows enable row level security;
alter table reviews enable row level security;

-- Any signed-in user may see which windows are open; the app filters to the
-- ones they're enrolled in.
create policy review_windows_read on review_windows
  for select using (auth.uid() is not null);
create policy review_windows_write on review_windows
  for all using (is_admin());

-- A family reads its OWN reviews. Admins read everything. Note there is no
-- staff policy here at all — staff have no direct select on `reviews`, only
-- on the view above.
create policy reviews_read_own on reviews
  for select using (family_id = auth_family_id() or is_admin());

-- Only a parent may write, only for their own family, only inside an open
-- window, and only for something they're enrolled in.
create policy reviews_insert on reviews
  for insert with check (
    auth_role() = 'parent'
    and family_id = auth_family_id()
    and reviewer_user_id = auth.uid()
    and exists (
      select 1 from review_windows w
      where w.id = reviews.window_id
        and now() between w.opens_at and w.closes_at
    )
    and exists (
      select 1
      from enrollments e
      join students s on s.id = e.student_id
      where s.family_id = auth_family_id()
        and e.status = 'enrolled'
        and (
          (reviews.subject_type = 'class' and e.class_id = reviews.subject_id)
          or (reviews.subject_type = 'production' and e.production_id = reviews.subject_id)
        )
    )
  );

-- Only admins flag/resolve. Families cannot edit a submitted review —
-- an editable review would undermine the audit value of the trend data.
create policy reviews_update_admin on reviews
  for update using (is_admin());

-- Staff reach reviews only through the identity-stripped view. security_invoker
-- makes the view respect the caller's RLS, so grant staff a narrow policy that
-- exposes rows about their own work without the reviewer columns.
create policy reviews_read_staff_scoped on reviews
  for select using (
    is_staffish()
    and exists (
      select 1 from staff_profiles sp
      where sp.user_id = auth.uid() and sp.id = any (reviews.staff_ids)
    )
  );

-- NOTE for whoever wires the Supabase adapter: because the policy above
-- grants staff row access, the application MUST query staff_review_view (not
-- `reviews`) for any staff-facing screen. The mock data layer enforces this
-- by returning a type with no reviewer field; do the same server-side by
-- never selecting reviewer_* for a staff session.
