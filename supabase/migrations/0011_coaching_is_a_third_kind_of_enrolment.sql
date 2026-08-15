-- ─────────────────────────────────────────────────────────────────────────
-- SCHEMA OWNERSHIP. Everything below belongs to `family_hub`, the family
-- hub's own schema — never `public`, which is the website's and sits behind
-- live checkout (its `families` table is a different table with 772 rows in
-- it). Unqualified CREATEs land in the first schema on the search_path, so
-- this header is what keeps them out of Jason's way on any replay route:
-- `supabase db push`, the SQL editor, or a rebuild into a fresh project.
-- The app and every script are pinned to the same schema.
--
-- `extensions` and NOT `public` as the second entry, matching what is already
-- deployed: it means nothing here can resolve an unqualified name into the
-- website's schema even by accident, while pgcrypto stays reachable.
-- ─────────────────────────────────────────────────────────────────────────
create schema if not exists family_hub;
set search_path = family_hub, extensions;

-- ─────────────────────────────────────────────────────────────────────────
-- 0011 — Coaching is a third kind of enrolment.
-- ─────────────────────────────────────────────────────────────────────────
-- CJ: "coaching is a part of the staff portal so do not exclude coaching —
-- map it there."
--
-- Every registration sync finished `partial` on one unresolved row:
-- "10-Pack Acting Coaching Sessions" is neither a production nor a class, and
-- `enrollments` allowed no third answer — `num_nonnulls(class_id,
-- production_id) = 1` made "exactly one of two" a rule of the table. The
-- reconciler was right to refuse to guess; it had nowhere to put the answer.
--
-- Coaching is the STAFF PORTAL's business and stays there. The portal now
-- publishes `staff_portal.v_coaching_catalog` (0087) — a price list keyed to
-- the website activity that sells each service, carrying no client, child or
-- session data, so nothing here crosses the ground 0049 and 0082 argued over.
-- The hub resolves a coaching purchase against that catalog and shows a family
-- the package they themselves bought. It does not own coaching, schedule it,
-- or read who else has it.
--
-- WHY THE WEBSITE'S activity id AND NOT THE PORTAL'S service uuid. The same
-- reason 0087 refused a foreign key in the other direction: a hard reference
-- across schemas couples two systems that are deliberately separate. The
-- activity id is the key both sides already agree on — the website sells it,
-- the portal's catalog is keyed to it — so it is the stable thing to store.
-- No FK, by design.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────

alter table enrollments
  add column if not exists coaching_activity_id bigint;

comment on column enrollments.coaching_activity_id is
  'public.activities.id of a coaching package, resolved through '
  'staff_portal.v_coaching_catalog. Deliberately NOT a foreign key — it '
  'points across schemas into systems the hub does not own. 0011.';

-- Exactly one target, now out of three rather than two.
alter table enrollments drop constraint if exists enrollments_check;
alter table enrollments
  add constraint enrollments_check
  check (num_nonnulls(class_id, production_id, coaching_activity_id) = 1);

create index if not exists enrollments_coaching_idx
  on enrollments (coaching_activity_id)
  where coaching_activity_id is not null;
