-- ════════ from novapa-deh history: family_hub_0011_view_security ════════

-- families_parent_view must respect the caller's RLS (it was definer by
-- default, which would have let any signed-in user read every family).
-- lesson_slot_occupancy stays definer BY DESIGN: it exposes only
-- slot_id + taken, so families can render the booking grid without any
-- access to other families' booking rows. Documented accepted risk.

alter view families_parent_view set (security_invoker = true);

revoke all on lesson_slot_occupancy from anon;
grant select on lesson_slot_occupancy to authenticated;

-- ════════ from novapa-deh history: family_hub_0012_invites_table ════════

-- Historical note: on novapa signup is unrestricted (the portal's 0081
-- decided doors are not triggers), so this table is no longer a gate.
-- The adapter still records invite rows as an audit trail of accounts
-- the family hub creates.

create table family_hub_invites (
  email text primary key,
  invited_at timestamptz not null default now(),
  note text
);

alter table family_hub_invites enable row level security;

-- (0013 signup-guard second door: OMITTED — superseded by portal 0081.)

-- ════════ from novapa-deh history: family_hub_0014_audition_profile_authorship ════════

alter table audition_profiles
  add column acknowledged_at timestamptz not null default now(),
  add column submitted_by_user_id uuid references profiles (id) on delete set null,
  add column submitted_by_role text not null default 'parent'
    check (submitted_by_role in ('parent','student'));

-- ════════ from novapa-deh history: family_hub_0015_messages_metadata ════════

alter table staff_profiles
  add column is_health_safety_director boolean not null default false;

alter table message_threads
  add column student_id uuid references students (id) on delete set null,
  add column last_message_at timestamptz not null default now(),
  add column urgent boolean not null default false;

alter table messages
  add column author_side text not null default 'family'
    check (author_side in ('family','staff')),
  add column read_at timestamptz;

-- ════════ from novapa-deh history: family_hub_0016_flexible_store_lines ════════

alter table cart_items
  alter column template_id drop not null,
  alter column photo_url drop not null,
  alter column photo_width drop not null,
  alter column photo_height drop not null,
  alter column student_name drop not null,
  alter column size_inches drop not null,
  alter column style drop not null,
  add column product_type text not null default 'spirit_button',
  add column product_id uuid references products (id) on delete set null,
  add column option_value text,
  add column display_name text not null default '',
  add column customization jsonb;

alter table button_order_items
  alter column photo_url drop not null,
  alter column photo_width drop not null,
  alter column photo_height drop not null,
  alter column student_name drop not null,
  alter column size_inches drop not null,
  alter column style drop not null,
  add column product_type text not null default 'spirit_button',
  add column product_id uuid references products (id) on delete set null,
  add column option_value text,
  add column display_name text not null default '',
  add column customization jsonb;

-- ════════ from novapa-deh history: family_hub_0017_storage_buckets ════════

-- Private storage buckets, prefixed fh- because the bucket namespace is
-- shared project-wide and the portal already owns `resumes` on novapa.
-- fh-reference-photos added for completeness (the app's 7th bucket type).
insert into storage.buckets (id, name, public)
values
  ('fh-headshots', 'fh-headshots', false),
  ('fh-resumes', 'fh-resumes', false),
  ('fh-audition-audio', 'fh-audition-audio', false),
  ('fh-family-documents', 'fh-family-documents', false),
  ('fh-staff-photos', 'fh-staff-photos', false),
  ('fh-button-photos', 'fh-button-photos', false),
  ('fh-reference-photos', 'fh-reference-photos', false)
on conflict (id) do nothing;

-- ════════ from novapa-deh history: family_hub_0018_staff_change_rejection ════════

alter table staff_profiles add column change_rejection text;
